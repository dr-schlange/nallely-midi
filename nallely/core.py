import json
import threading
import time
import traceback
from collections import defaultdict
from dataclasses import InitVar, asdict, dataclass, field
from decimal import Decimal
from itertools import chain
from pathlib import Path
from queue import Empty, Full, Queue
from typing import Any, Callable, Counter, Iterable, Literal, Type

import mido

from .modules import (
    DeviceState,
    Int,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
    PadOrKey,
    PadsOrKeysInstance,
    Scaler,
)

virtual_devices: list["VirtualDevice"] = []
connected_devices: list["MidiDevice"] = []
midi_device_classes: list[Type] = []
virtual_device_classes: list[Type] = []


def no_registration(cls):
    try:
        midi_device_classes.remove(cls)
    except ValueError:
        ...
    try:
        virtual_device_classes.remove(cls)
    except ValueError:
        ...
    return cls


def need_registration(cls):
    return cls.__dict__.get("registrer", True)


def stop_all_virtual_devices(skip_unregistered=False):
    for device in list(virtual_devices):
        if skip_unregistered and getattr(device, "forever", False):
            continue
        device.stop()


def stop_all_connected_devices(skip_unregistered=False, force_note_off=True):
    stop_all_virtual_devices(skip_unregistered)
    for device in list(connected_devices):
        if force_note_off:
            device.all_notes_off()
        if skip_unregistered and getattr(device, "forever", False):
            continue
        device.close()


def get_connected_devices():
    return connected_devices


def get_virtual_devices():
    return virtual_devices


def all_devices():
    return get_connected_devices() + get_virtual_devices()


def unbind_all():
    for device in all_devices():
        device.unbind_all()


def get_all_virtual_parameters(cls):
    out = {}
    for base in reversed(cls.__mro__):
        for k, v in base.__dict__.items():
            # if not k.startswith("__") and not callable(v):
            if isinstance(v, VirtualParameter):
                out[k] = v
    return out


class ThreadContext(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self["last_value"] = None

    def __getattr__(self, key):
        return self[key]

    def __setattr__(self, key, value):
        self[key] = value

    @property
    def parent(self):
        return self["parent"]

    @parent.setter
    def parent(self, value):
        self["parent"] = value


class CallbackRegistryEntry:
    def __init__(
        self,
        target: "VirtualDevice | MidiDevice",
        parameter: "VirtualParameter | ModuleParameter | ModulePadsOrKeys | PadOrKey | ParameterInstance",
        from_: "VirtualParameter | ModuleParameter | ModulePadsOrKeys | PadOrKey",
        callback: Callable[[Any, ThreadContext], Any],
        chain: Callable | None,
        cc_note: int | None = None,
        type: str | None = None,
    ):
        self.target = target
        self.parameter = parameter
        self.callback = callback
        self.cc_note = cc_note
        self.type = type
        self.chain = chain
        self.from_ = from_


class ParameterInstance:
    def __init__(self, parameter: "VirtualParameter", device: "VirtualDevice"):
        self.parameter = parameter
        self.device = device

    @property
    def name(self):
        return self.parameter.name

    def repr(self):
        return f"{id(self.device)}::{self.parameter.section_name}::{self.parameter.cv_name}"

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def __isub__(self, other):
        other.device.unbind_link(other, self)
        #  we need to return None to avoid to trigger the __set__ again
        return None

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin"] | Literal["log"] = "lin",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            # device=self.device,
            to_min=min,
            to_max=max,
            # from_min=self.parameter.range[0],
            # from_max=self.parameter.range[1],
            method=method,
            as_int=as_int,
            auto=min is None and max is None,
        )


@dataclass
class VirtualParameter:
    name: str
    stream: bool = False
    consumer: bool = False
    description: str | None = None
    range: tuple[int | float | None, int | float | None] = (None, None)
    accepted_values: Iterable[Any] = ()
    cv_name: str | None = None
    section_name: str = "__virtual__"
    cc_note: int = -1

    def __set_name__(self, owner, name):
        self.cv_name = name

    def __get__(self, device: "VirtualDevice", owner=None):
        if device is None:
            return self
        return ParameterInstance(parameter=self, device=device)

    def __set__(self, device: "VirtualDevice", value, append=True, chain=None):
        if isinstance(
            value,
            (
                ParameterInstance,
                Int,
                PadOrKey,
                PadsOrKeysInstance,
                VirtualDevice,
                Scaler,
            ),
        ):
            assert self.cv_name
            value.bind(getattr(device, self.cv_name))


class VirtualDevice(threading.Thread):
    _id: dict[Type, int] = defaultdict(int)
    output_cv = VirtualParameter(name="output")

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        instance._id[cls] += 1
        instance._number = instance._id[cls]  # type: ignore
        return instance

    def __init__(self, target_cycle_time: float = 0.005, autoconnect: bool = False):
        from .links import Link

        super().__init__(daemon=True)
        virtual_devices.append(self)
        self.device = self  # to be polymorphic with Int
        self.__virtual__ = self  # to have a fake section
        self.links: tuple[
            defaultdict[str, list[Link]], defaultdict[str, list[Link]]
        ] = (
            defaultdict(list),
            defaultdict(list),
        )
        self.links_registry: dict[tuple[str, str], Link] = {}

        self.input_queue = Queue(maxsize=2000)
        self.pause_event = threading.Event()
        self.paused = False
        self.running = False
        self.pause_event.set()
        self.target_cycle_time = target_cycle_time
        self.ready_event = threading.Event()
        if autoconnect:
            self.start()

    def __init_subclass__(cls) -> None:
        virtual_device_classes.append(cls)
        super().__init_subclass__()

    def setup(self) -> ThreadContext:
        return ThreadContext()

    def main(self, ctx: ThreadContext) -> Any: ...

    def receiving(self, value, on: str, ctx: ThreadContext): ...

    def set_parameter(self, param: str, value: Any, ctx: ThreadContext):
        if self.paused:
            return
        try:
            self.input_queue.put_nowait((param, value, ctx or ThreadContext({})))
        except Full:
            print(
                f"Warning: input_queue full for {self.uid()} — dropping message {param}={value}"
            )
            # self.target_cycle_time = 0.001

    def run(self):
        self.ready_event.set()
        ctx = self.setup()
        ctx.parent = self
        ctx.last_value = None

        while self.running:
            start_time = time.perf_counter()
            self.pause_event.wait()  # Block if paused

            if not self.running:
                break

            # Process a batch of inputs per cycle (to avoid backlog)
            max_batch_size = 10  # Maximum number of items to process per cycle
            queue_level = self.input_queue.qsize()
            # We adjust the batch size dynamically based on queue pressure
            batch_size = min(max_batch_size, max(1, int(queue_level / 100)))
            inner_ctx = {}
            for _ in range(batch_size):
                try:
                    param, value, inner_ctx = self.input_queue.get_nowait()
                    self.process_input(param, value)
                    self.input_queue.task_done()
                except Empty:
                    break

            # Log queue pressure
            queue_level = self.input_queue.qsize()
            if queue_level > self.input_queue.maxsize * 0.8:
                print(
                    f"[{self.uid()}] Queue usage: {queue_level}/{self.input_queue.maxsize}"
                )

            # Run main processing and output
            ctx.update(inner_ctx)
            value = self.main(ctx)
            self.process_output(value, ctx)

            if queue_level > self.input_queue.maxsize * 0.8:
                # Skip sleep to catch up faster
                print(
                    f"[{self.uid()}] High queue pressure, skipping sleep for this cycle."
                )
            else:
                # Adaptive sleep
                elapsed_time = time.perf_counter() - start_time
                sleep_time = max(0, self.target_cycle_time - elapsed_time)
                time.sleep(sleep_time)

    def start(self):
        """Start the LFO thread."""
        if self.is_alive() or self.running:
            return
        self.running = True
        self.paused = False
        self.pause_event.set()
        if self not in virtual_devices:
            virtual_devices.append(self)
        super().start()
        self.ready_event.wait()

    def stop(self, clear_queues=True):
        """Stop the LFO thread."""
        for device in all_devices():
            device.unbind_link(None, self)
        if self in virtual_devices:
            virtual_devices.remove(self)
        if not self.running:
            return
        self.running = False
        self.pause_event.set()
        if self.is_alive():
            self.join()  # Wait for the thread to finish
        if clear_queues:
            # Clear input_queue
            inqueue = self.input_queue
            while not inqueue.empty():
                try:
                    inqueue.get_nowait()
                    inqueue.task_done()
                except Empty:
                    break
            # Clear output_queue
            # while not self.output_queue.empty():
            #     try:
            #         self.output_queue.get_nowait()
            #         self.output_queue.task_done()
            #     except Empty:
            #         break

    def pause(self, duration=None):
        """Pause the LFO, optionally for a specific duration."""
        if self.running and not self.paused:
            self.paused = True
            self.pause_event.clear()
            inqueue = self.input_queue
            inqueue = self.input_queue
            while not inqueue.empty():
                try:
                    inqueue.get_nowait()
                    inqueue.task_done()
                except Empty:
                    break
            if duration:
                time.sleep(duration)
                self.resume()

    def resume(self):
        if self.running and self.paused:
            self.paused = False
            self.pause_event.set()

    def unbind_all(self):
        self.stream_links.clear()
        for link in self.links_registry.values():
            link.cleanup()
        self.nonstream_links.clear()
        self.links_registry.clear()

    def bind_link(self, link):
        self.links[int(link.is_stream)][link.src_repr()].append(link)
        self.links_registry[(link.src_repr(), link.dest_repr())] = link

    def bounce_link(self, from_, value, ctx):
        src_path = from_.repr()
        for (src, _), link in list(self.links_registry.items()):
            if src == src_path:
                link.trigger(value, ctx)

    def unbind_link(self, from_, target):
        if from_ is None:
            to_remove = []
            link_to_remove = []
            target_path = target.repr()
            for (src, dst), link in self.links_registry.items():
                if dst == target_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                try:
                    self.stream_links[from_.repr()].remove(link)
                    link.cleanup()
                except ValueError:
                    ...
                try:
                    self.nonstream_links[from_.repr()].remove(link)
                    link.cleanup()
                except ValueError:
                    ...
            return
        if target is None:
            to_remove = []
            link_to_remove = []
            src_path = from_.repr()
            for (src, dst), link in self.links_registry.items():
                if src == src_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                for key in list(self.stream_links.keys()):
                    try:
                        self.stream_links[key].remove(link)
                        link.cleanup()
                    except ValueError:
                        ...
                for key in list(self.nonstream_links.keys()):
                    try:
                        self.nonstream_links[key].remove(link)
                        link.cleanup()
                    except ValueError:
                        ...
            return

        key = (from_.repr(), target.repr())
        link = self.links_registry.get(key)
        if not link:
            # print(f"Cannot unbind {from_} and {target}, they are not bound in {self}")
            return

        del self.links_registry[key]
        try:
            self.stream_links[from_.repr()].remove(link)
            link.cleanup()
        except ValueError:
            ...
        try:
            self.nonstream_links[from_.repr()].remove(link)
            link.cleanup()
        except ValueError:
            ...

    def process_input(self, param: str, value):
        setattr(self, param, value)

    def repr(self):
        # We are called because of the default output
        return self.output_cv.repr()

    def bind(self, target):
        from .links import Link

        Link.create(self.output_cv, target)

    @property
    def stream_links(self):
        return self.links[int(True)]

    @property
    def nonstream_links(self):
        return self.links[int(False)]

    def process_output(
        self, value, ctx, selected_outputs: None | list[ParameterInstance] = None
    ):
        if value is None:
            return
        # try:
        #     self.output_queue.put_nowait((value, ctx))
        # except Full:
        #     pass  # Drop if full

        # True -> stream; False -> non stream
        outputs = None
        if selected_outputs:
            outputs = [e.repr() for e in selected_outputs]

        for output in outputs or list(self.stream_links.keys()):
            links = self.stream_links.get(output, [])
            for link in links:
                try:
                    link.trigger(value, ctx)
                except Exception as e:
                    traceback.print_exc()
                    raise e
        if value != ctx.last_value:
            for output in outputs or list(self.nonstream_links.keys()):
                links = self.nonstream_links.get(output, [])
                for link in links:
                    try:
                        link.trigger(value, ctx)
                    except Exception as e:
                        traceback.print_exc()
                        raise e
            ctx.last_value = value

    def scale(self, min=None, max=None, method="lin", as_int=False):
        return Scaler(
            self,
            min,
            max,
            method,
            as_int,
            # from_min=self.min_range,
            # from_max=self.max_range,
            auto=min is None and max is None,
        )

    @property
    def max_range(self) -> float | int | None:
        return None

    @property
    def min_range(self) -> float | int | None:
        return None

    @property
    def range(self):
        return (self.min_range, self.max_range)

    def generate_fun(self, to_device, to_param):
        if isinstance(to_param, VirtualParameter):
            if to_param.consumer:
                return lambda value, ctx: to_device.receiving(
                    value,
                    on=to_param.name,
                    ctx=ThreadContext({**ctx, "param": self.__class__.__name__}),
                )
            else:
                return lambda value, ctx: to_device.set_parameter(to_param.name, value)
        else:
            return lambda value, ctx: setattr(to_device, to_param.name, value)

    def to_dict(self):
        virtual_parameters = self.all_parameters()
        config = self.current_preset()
        del config["output"]
        return {
            "id": id(self),
            "repr": self.uid(),
            "meta": {
                "name": self.__class__.__name__,
                "parameters": [asdict(p) for p in virtual_parameters],
            },
            "paused": self.paused,
            "running": self.running,
            "config": config,
        }

    def uid(self):
        return f"{self.__class__.__name__}{self._number}"  # type: ignore

    def all_sections(self):
        return [self]

    @classmethod
    def all_parameters(cls) -> list[VirtualParameter]:
        return list(get_all_virtual_parameters(cls).values())

    def current_preset(self):
        d = {}
        for parameter in self.all_parameters():
            d[parameter.name] = getattr(self, parameter.name, None)
        return d

    def save_preset(self, file: Path | str):
        Path(file).write_text(
            json.dumps(self.current_preset(), indent=2, cls=DeviceSerializer)
        )

    def load_preset(
        self,
        file: Path | str | None = None,
        dct: dict[str, dict[str, int]] | None = None,
    ):
        d = dct or {}
        if file:
            p = Path(file)
            d = json.loads(p.read_text())
        for k, v in d.items():
            setattr(self, k, v)

    def random_preset(self):
        import random

        for parameter in self.all_parameters():
            min, max = parameter.range
            min = min or 0
            max = max or 127
            as_int = isinstance(min, int) and isinstance(max, int)
            rand = random.randint if as_int else random.uniform
            self.process_input(parameter.name, rand(min, max))  # type: ignore


@dataclass
class MidiDevice:
    device_name: str
    modules_descr: dict[str, Type[Module]] | None = None
    autoconnect: InitVar[bool] = True
    read_input_only: InitVar[bool] = False
    played_notes: Counter = field(default_factory=Counter)
    outport: mido.ports.BaseOutput | None = None
    inport: mido.ports.BaseInput | None = None
    debug: bool = False
    on_midi_message: Callable[["MidiDevice", mido.Message], None] | None = None

    def __init_subclass__(cls) -> None:
        midi_device_classes.append(cls)
        return super().__init_subclass__()

    def __post_init__(self, autoconnect, read_input_only):
        from .links import Link

        if self not in connected_devices:
            connected_devices.append(self)
        self.reverse_map = {}
        self.links: defaultdict[tuple[str, int], list[Link]] = defaultdict(list)
        self.links_registry: dict[tuple[str, str], Link] = {}
        if self.modules_descr is None:
            self.modules_descr = {
                k: v
                for k, v in self.__class__.__annotations__.items()
                if isinstance(v, type) and issubclass(v, Module)
            }
        self.modules = DeviceState(self, self.modules_descr)
        self.listening = False
        self.outport_name = self.device_name
        self.inport_name = self.device_name
        if autoconnect:
            try:
                self.outport_name = next(
                    (
                        dev_name
                        for dev_name in mido.get_output_names()  # type: ignore
                        if self.device_name == dev_name or self.device_name in dev_name
                    ),
                )
            except StopIteration:
                raise DeviceNotFound(self.device_name)
            if not read_input_only:
                self.connect()
            self.listen()

    def connect(self):
        self.outport = mido.open_output(self.outport_name, autoreset=True)  # type: ignore

    def listen(self, start=True):
        if not start:
            self.listening = False
            self.inport.callback = None  # type: ignore
            return
        if not self.listening:
            try:
                self.inport = mido.open_input(self.inport_name)  # type: ignore
            except OSError:
                try:
                    self.inport_name = next(
                        (
                            dev_name
                            for dev_name in mido.get_input_names()  # type: ignore
                            if self.device_name == dev_name
                            or self.device_name in dev_name
                        ),
                    )
                    self.inport = mido.open_input(self.inport_name)  # type: ignore
                except StopIteration:
                    raise DeviceNotFound(self.device_name)
            self.inport.callback = self._sync_state  # type: ignore

    def close_out(self):
        if self.outport:
            self.outport.close()
            self.outport = None
            self.outport_name = None

    def close_in(self):
        if self.inport:
            self.listen(False)
            self.inport = None
            self.inport_name = None

    def close(self, delete=True):
        self.all_notes_off()
        self.close_in()
        self.close_out()
        # flush all callbacks and registry
        self.links.clear()
        self.links_registry.clear()
        if delete and self in connected_devices:
            connected_devices.remove(self)

    stop = close

    def _update_state(self, cc, value):
        control: ModuleParameter | None = self.reverse_map.get(("control_change", cc))
        if control:
            control.basic_set(self, value)

    def _sync_state(self, msg):
        if msg.type == "clock":
            return
        if self.on_midi_message:
            self.on_midi_message(self, msg)
        if self.debug:
            print(msg)
        if msg.type == "control_change":
            try:
                for link in self.links.get((msg.type, msg.control), []):
                    value = msg.value
                    ctx = ThreadContext({"debug": self.debug})
                    link.trigger(value, ctx)
                self._update_state(msg.control, msg.value)
            except:
                traceback.print_exc()
        if msg.type == "note_on" or msg.type == "note_off":
            try:
                # We look first if there are links at the "global level" for keys
                for link in self.links.get(("note", -1), []):
                    value = msg.note
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "velocity": msg.velocity,
                        }
                    )
                    link.trigger(value, ctx)
                for link in self.links.get(("note", msg.note), []):
                    value = msg.note
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "velocity": msg.velocity,
                        }
                    )
                    link.trigger(value, ctx)
                for link in self.links.get(("velocity", msg.note), []):
                    value = msg.velocity
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "note": msg.note,
                        }
                    )
                    link.trigger(value, ctx)
                pads: ModulePadsOrKeys | None = self.reverse_map.get(("note", None))
                if pads:
                    pads.basic_send(msg.type, msg.note, msg.velocity)
            except:
                traceback.print_exc()

    def send(self, msg):
        if not self.outport:
            return
        self.outport.send(msg)

    def note(self, type, note, velocity=127 // 2, channel=0):
        getattr(self, type)(note, velocity=velocity, channel=channel)

    def note_on(self, note, velocity=127 // 2, channel=0):
        if not self.outport:
            return
        note = int(note)
        if note > 127:
            note = 127
        elif note < 0:
            note = 0
        self.played_notes[note] += 1
        self.outport.send(
            mido.Message("note_on", channel=channel, note=note, velocity=velocity)
        )
        if self.played_notes[note] > 40:
            for _ in range(20):
                self.note_off(note, velocity=0)

    def note_off(self, note, velocity=127 // 2, channel=0):
        if not self.outport:
            return
        note = int(note)
        if note > 127:
            note = 127
        elif note < 0:
            note = 0
        self.outport.send(
            mido.Message("note_off", channel=channel, note=note, velocity=velocity)
        )
        if self.played_notes[note]:
            self.played_notes[note] -= 1

    def all_notes_off(self):
        for note, occurence in self.played_notes.items():
            for _ in range(occurence):
                self.note_off(note, velocity=0)
        self.played_notes.clear()

    def force_all_notes_off(self, times=1):
        for _ in range(times + 1):
            for note in range(0, 128):
                self.note_off(note, velocity=0)

    def control_change(self, control, value=0, channel=0):
        if not self.outport:
            return
        value = int(value)
        if value > 127:
            value = 127
        elif value < 0:
            value = 0
        self._update_state(control, value)
        self.outport.send(
            mido.Message(
                "control_change", channel=channel, control=control, value=value
            )
        )

    def unbind_all(self):
        for link in self.links_registry.values():
            link.cleanup()
        self.links.clear()
        self.links_registry.clear()

    def bind_link(self, link):
        type = link.src.parameter.type
        cc_note = link.src.parameter.cc_note
        self.links[(type, cc_note)].append(link)
        self.links_registry[(link.src_repr(), link.dest_repr())] = link

    def bounce_link(self, from_, value, ctx):
        src_path = from_.repr()
        for (src, _), link in list(self.links_registry.items()):
            if src == src_path:
                link.trigger(value, ctx)

    def unbind_link(self, from_, target):
        if from_ is None:
            to_remove = []
            link_to_remove = []
            target_path = target.repr()
            for (src, dst), link in self.links_registry.items():
                if dst == target_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                self.links[(from_.parameter.type, from_.parameter.cc_note)].remove(link)
                link.cleanup()
            return
        if target is None:
            to_remove = []
            link_to_remove = []
            src_path = from_.repr()
            for (src, dst), link in self.links_registry.items():
                if src == src_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                for key in list(self.links.keys()):
                    try:
                        self.links[key].remove(link)
                        link.cleanup()
                    except ValueError:
                        ...
            return

        key = (from_.repr(), target.repr())
        link = self.links_registry.get(key)
        if not link:
            # print(f"Cannot unbind {from_} and {target}, they are not bound in {self}")
            return

        del self.links_registry[key]
        self.links[(from_.parameter.type, from_.parameter.cc_note)].remove(link)
        link.cleanup()

    def __isub__(self, other):
        # The only way to be here is from a callback removal on the key/pad section
        other.device.unbind_link(other, self)
        self.all_notes_off()
        return self

    def current_preset(self):
        return self.modules.as_dict_patch()

    def save_preset(self, file: Path | str):
        Path(file).write_text(
            json.dumps(self.current_preset(), indent=2, cls=DeviceSerializer)
        )

    def load_preset(
        self,
        file: Path | str | None = None,
        dct: dict[str, dict[str, int]] | None = None,
    ):
        if file:
            p = Path(file)
            self.modules.from_dict_patch(json.loads(p.read_text()))
        if dct:
            self.modules.from_dict_patch(dct)

    def to_dict(self):
        d = {
            "id": id(self),
            "repr": self.uid(),
            "ports": {
                "input": self.inport.name if self.inport else None,
                "output": self.outport.name if self.outport else None,
            },
            "meta": {
                "name": self.__class__.__name__,
                "sections": [
                    asdict(module.meta) for module in self.modules.modules.values()
                ],
            },
            "config": self.modules.as_dict_patch(with_meta=False),
        }
        return d

    def uid(self):
        return f"{self.__class__.__name__}"

    def all_sections(self):
        return self.modules.modules.values()

    def all_parameters(self):
        parameters = []
        for section in self.all_sections():
            parameters.extend(section.all_parameters())
        return parameters

    def pads_or_keys(self):
        for section in self.all_sections():
            if section.meta.pads_or_keys:
                return section.meta.pads_or_keys
        return None

    def random_preset(self):
        import random

        for parameter in self.all_parameters():
            setattr(
                getattr(self, parameter.section_name),
                parameter.name,
                random.randint(0, 127),
            )


class DeviceSerializer(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, Int):
            return int(o)
        return super().default(o)


class DeviceNotFound(Exception):
    def __init__(self, device_name):
        super().__init__(
            f"MIDI port {device_name!r} couldn't be found, known devices are:\n"
            f"  input: {mido.get_output_names()}\n"  # type: ignore
            f"  outputs: {mido.get_input_names()}"  # type: ignore
        )


@no_registration
class TimeBasedDevice(VirtualDevice):
    speed_cv = VirtualParameter("speed", range=(0, 10.0))
    sampling_rate_cv = VirtualParameter("sampling_rate", range=(0.001, None))

    def __init__(
        self,
        speed: int | float = 1.0,
        sampling_rate: int | Literal["auto"] = "auto",
        **kwargs,
    ):
        self._speed = speed
        self.auto_sampling_rate = sampling_rate == "auto"
        self._sampling_rate = (
            self.compute_sampling_rate() if sampling_rate == "auto" else sampling_rate
        )
        self.time_step = Decimal(speed) / self._sampling_rate
        super().__init__(target_cycle_time=1 / self._sampling_rate, **kwargs)

    @property
    def speed(self):
        return self._speed

    @speed.setter
    def speed(self, value):
        self._speed = value
        if self.auto_sampling_rate:
            self._sampling_rate = self.compute_sampling_rate()
        self.time_step = Decimal(value) / self._sampling_rate
        self.target_cycle_time = float(1 / self._sampling_rate)

    @property
    def sampling_rate(self):
        return self._sampling_rate

    @sampling_rate.setter
    def sampling_rate(self, value):
        self._sampling_rate = Decimal(value)
        self.time_step = Decimal(self.speed) / self._sampling_rate
        self.target_cycle_time = float(1 / self._sampling_rate)

    def compute_sampling_rate(self):
        if self.speed <= 1:
            return 50  # we sample 50 point, enough as it's slow
        return int(self.speed * 20)  # we sample 20 times faster than the speed

    def generate_value(self, t, ticks) -> Any: ...

    def setup(self):
        return ThreadContext({"t": Decimal(0), "ticks": 0})

    def main(self, ctx: ThreadContext):
        t = ctx.t
        ticks = ctx.ticks
        generated_value = self.generate_value(t, ticks)
        t += self.time_step
        ctx.t = t % 1
        ctx.ticks += 1
        return generated_value
