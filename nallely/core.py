import json
import threading
import time
import trace
import traceback
from collections import defaultdict
from dataclasses import InitVar, asdict, dataclass, field
from decimal import Decimal
from pathlib import Path
from queue import Empty, Full, Queue
from typing import Any, Callable, Counter, Iterable, Literal, Type

import mido
from requests import get

from .modules import (
    DeviceState,
    Int,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
    PadOrKey,
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
            device.force_all_notes_off()
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

    def __isub__(self, port):
        match port:
            case ParameterInstance():
                device = port.device
                device.unbind(self.device, self)
            case VirtualDevice():
                port.unbind(self.device, self)
            case Int() | PadOrKey():
                device = port.device
                parameter = port.parameter
                # device.unbind(self.device, self, port.type, port.cc_note)
                device.unbind(self.device, self, parameter.type, parameter.cc_note)
        return None  #  we need to return None to avoid to trigger the __set__ again

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
        if isinstance(value, VirtualDevice):
            if self.consumer:
                virtual_device = value
                value.device.bind(
                    lambda value, ctx: device.receiving(
                        value,
                        on=self.name,
                        ctx=ThreadContext(
                            {**ctx, "param": virtual_device.__class__.__name__}
                        ),
                    ),
                    to=device,
                    param=self,
                    stream=self.stream,
                    append=append,
                    transformer_chain=chain,
                    from_=value.output_cv.parameter,
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    param=self,
                    stream=self.stream,
                    append=append,
                    transformer_chain=chain,
                    from_=value.output_cv.parameter,
                )
        elif isinstance(value, Int):
            if self.consumer:
                int_val = value
                int_val.device.bind(
                    lambda value, ctx: device.receiving(
                        value,
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": int_val.parameter.name}),
                    ),
                    to=device,
                    param=self,
                    type=value.parameter.type,
                    cc_note=value.parameter.cc_note,
                    stream=self.stream,
                    append=append,
                    transformer_chain=chain,
                    from_=value.parameter,
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    param=self,
                    type=value.parameter.type,
                    cc_note=value.parameter.cc_note,
                    stream=self.stream,
                    append=append,
                    transformer_chain=chain,
                    from_=value.parameter,
                )
        elif isinstance(value, ParameterInstance):
            if self.consumer:
                value.device.bind(
                    lambda _, ctx: device.receiving(
                        getattr(value.device, value.parameter.name),
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": value.parameter.name}),
                    ),
                    to=device,
                    param=self,
                    append=append,
                    transformer_chain=chain,
                    from_=value.parameter,
                )
            else:
                value.device.bind(
                    lambda _, ctx: device.set_parameter(
                        self.name, getattr(value.device, value.parameter.name)
                    ),
                    to=device,
                    param=self,
                    stream=self.stream,
                    append=append,
                    transformer_chain=chain,
                    from_=value.parameter,
                )
        elif isinstance(value, Scaler):
            scaler = value
            self.__set__(device, scaler.data, append=append, chain=scaler)
        elif isinstance(value, PadOrKey):
            pad = value
            foo = pad.generate_fun(device, self)
            pad.device.bind(
                lambda value, ctx: foo(value, ctx),
                type=pad.type,
                cc_note=pad.cc_note,
                to=device,
                param=self,
                append=append,
                transformer_chain=chain,
                from_=pad,
            )


class VirtualDevice(threading.Thread):
    _id: dict[Type, int] = defaultdict(int)
    output_cv = VirtualParameter(name="output")

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        instance._id[cls] += 1
        instance._number = instance._id[cls]  # type: ignore
        return instance

    def __init__(self, target_cycle_time: float = 0.005, autoconnect: bool = False):
        super().__init__(daemon=True)
        virtual_devices.append(self)
        self.device = self  # to be polymorphic with Int
        self.__virtual__ = self  # to have a fake section
        self.callbacks_registry: list[CallbackRegistryEntry] = []
        self.callbacks = defaultdict(list)
        self.stream_callbacks = defaultdict(list)
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

    def set_parameter(self, param: str, value: Any):
        if self.paused:
            return
        try:
            self.input_queue.put_nowait((param, value))
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
            for _ in range(batch_size):
                try:
                    param, value = self.input_queue.get_nowait()
                    self.process_input(param, value)
                    self.input_queue.task_done()
                except Empty:
                    break

            # Optional: Log queue pressure
            queue_level = self.input_queue.qsize()
            if queue_level > self.input_queue.maxsize * 0.8:
                print(
                    f"[{self.uid()}] Queue usage: {queue_level}/{self.input_queue.maxsize}"
                )

            # Run main processing and output
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
        for device in all_devices():
            device.unbind(self, None)

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
        self.callbacks_registry.clear()
        self.stream_callbacks.clear()
        self.callbacks.clear()

    def bind(
        self,
        callback,
        to,
        param,
        from_,
        stream=False,
        append=True,
        transformer_chain=None,
    ):
        if transformer_chain:
            _callback = lambda value, ctx: callback(transformer_chain(value, ctx), ctx)
        else:
            _callback = callback
        if stream:
            self.stream_callbacks[from_.name].append(
                (_callback, param, transformer_chain)
            )
        else:
            self.callbacks[from_.name].append((_callback, param, transformer_chain))
        self.callbacks_registry.append(
            CallbackRegistryEntry(
                target=to,
                parameter=param,
                from_=from_,
                callback=_callback,
                chain=transformer_chain,
            )
        )

    # def bind_to(self, other: "VirtualDevice", stream=False):
    #     def queue_callback(value, ctx):
    #         try:
    #             other.output_queue.put_nowait((value, ctx))
    #         except Full:
    #             pass
    #     self.bind(queue_callback, stream=stream)

    def unbind(self, target, param=None):
        for entry in list(self.callbacks_registry):
            is_right_target = entry.target == target
            is_right_param = param is None or entry.parameter.name == param.name
            if is_right_target and is_right_param:
                callback = entry.callback
                self.callbacks_registry.remove(entry)
                try:
                    for from_, callbacks in self.stream_callbacks.items():
                        for c, parameter, chain in callbacks:
                            if c is callback:
                                self.stream_callbacks[from_].remove(
                                    (callback, parameter, chain)
                                )
                                if param is not None:
                                    return
                except ValueError:
                    ...
                try:
                    for from_, callbacks in self.callbacks.items():
                        for c, parameter, chain in callbacks:
                            if c is callback:
                                self.callbacks[from_].remove(
                                    (callback, parameter, chain)
                                )
                                if param is not None:
                                    return
                except ValueError:
                    ...

    def process_input(self, param: str, value):
        setattr(self, param, value)

    def process_output(self, value, ctx, selected_outputs=None):
        if value is None:
            return
        # try:
        #     self.output_queue.put_nowait((value, ctx))
        # except Full:
        #     pass  # Drop if full
        for output in selected_outputs or list(self.stream_callbacks.keys()):
            callbacks = self.stream_callbacks.get(output, [])
            for callback, param, _ in callbacks:
                try:
                    callback(value, ctx)
                except Exception as e:
                    traceback.print_exc()
                    raise e
        if value != ctx.last_value:
            for output in selected_outputs or list(self.callbacks.keys()):
                callbacks = self.callbacks.get(output, [])
                for callback, param, _ in callbacks:
                    try:
                        callback(value, ctx)
                    except Exception as e:
                        traceback.print_exc()
                        raise e
            ctx.last_value = value

    def scale(self, min=None, max=None, method="lin", as_int=False):
        return Scaler(
            self,
            # self,
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
        attrs = []
        for base in reversed(cls.__mro__):
            attrs.extend(
                v for v in base.__dict__.values() if isinstance(v, VirtualParameter)
            )
        return attrs

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
        if self not in connected_devices:
            connected_devices.append(self)
        self.reverse_map = {}
        self.callbacks_registry: list[CallbackRegistryEntry] = []
        # callbacks that are called when reacting to a value
        self.input_callbacks: defaultdict[
            tuple[str, int], list[tuple[Callable, Callable | None]]
        ] = defaultdict(list)
        self.output_callbacks = []  # callbacks that are called when sending a value
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
        self.close_in()
        self.close_out()
        # flush all callbacks and registry
        self.callbacks_registry.clear()
        self.input_callbacks.clear()
        self.output_callbacks.clear()
        if delete and self in connected_devices:
            connected_devices.remove(self)

    stop = close

    def _update_state(self, cc, value):
        control: ModuleParameter = self.reverse_map[("control_change", cc)]
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
                for callback, chain in self.input_callbacks.get(
                    (msg.type, msg.control), []
                ):
                    value = msg.value
                    ctx = ThreadContext({"debug": self.debug})
                    if chain:
                        value = chain(value, ctx)
                    callback(value, ctx)
                self._update_state(msg.control, msg.value)
            except:
                traceback.print_exc()
        if msg.type == "note_on" or msg.type == "note_off":
            try:
                for callback, chain in self.input_callbacks.get(("note", msg.note), []):
                    value = msg.note
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "velocity": msg.velocity,
                        }
                    )
                    if chain:
                        value = chain(value, ctx)
                    callback(value, ctx)
                for callback, chain in self.input_callbacks.get(
                    ("velocity", msg.note), []
                ):
                    value = msg.velocity
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "note": msg.note,
                        }
                    )
                    if chain:
                        value = chain(value, ctx)
                    callback(value, ctx)
                pads: ModulePadsOrKeys = self.reverse_map[("note", None)]
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
        if self.played_notes[note] > 100:
            for _ in range(50):
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
        self.callbacks_registry.clear()
        self.input_callbacks.clear()

    def bind(
        self,
        callback,
        type,
        cc_note,
        to,
        param,
        from_,
        stream=False,
        append=True,
        transformer_chain: Callable | None = None,
    ):
        self.input_callbacks[(type, cc_note)].append((callback, transformer_chain))
        self.callbacks_registry.append(
            CallbackRegistryEntry(
                target=to,
                parameter=param,
                callback=callback,
                type=type,
                cc_note=cc_note,
                chain=transformer_chain,
                from_=from_,
            )
        )

    def unbind(self, target, param, type=None, cc_note=None):
        for entry in list(self.callbacks_registry):
            is_right_target = entry.target == target
            is_right_param = param is None or entry.parameter.name == param.name
            is_right_type = type is None or entry.type == type
            is_right_cc_note = cc_note is None or entry.cc_note == cc_note
            if (
                is_right_target
                and is_right_param
                and is_right_type
                and is_right_cc_note
            ):
                callback = entry.callback
                self.callbacks_registry.remove(entry)
                try:
                    for c, chain in list(self.input_callbacks[(type, cc_note)]):  # type: ignore
                        if callback is c:
                            self.input_callbacks[(type, cc_note)].remove((callback, chain))  # type: ignore
                except ValueError:
                    ...

    def __isub__(self, other):
        # The only way to be here is from a callback removal on the key/pad section
        match other:
            case PadOrKey():
                mm = (
                    self.reverse_map.get(("note", other.cc_note))
                    or self.reverse_map[("note", None)]
                )
                other.device.unbind(self, mm, other.type, other.cc_note)
            case ParameterInstance():
                other.device.unbind(self, other.parameter)
            case Int():
                mm = (
                    self.reverse_map.get(("note", other.parameter.cc_note))
                    or self.reverse_map[("note", None)]
                )
                other.device.unbind(
                    self, mm, other.parameter.type, other.parameter.cc_note
                )
                self.force_all_notes_off()
            case _:
                raise Exception(
                    f"Unbinding {other.__class__.__name__} not yet supported"
                )
        return self

    # def bind_output(self, callback):
    #     self.output_callbacks.append(callback)

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
        print("DS Int")
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
