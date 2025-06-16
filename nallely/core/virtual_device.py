import json
import threading
import time
import traceback
from collections import defaultdict
from dataclasses import asdict, dataclass
from decimal import Decimal
from pathlib import Path
from queue import Empty, Full, Queue
from typing import Any, Iterable, Literal, Type

from .parameter_instances import ParameterInstance
from .scaler import Scaler
from .world import (
    DeviceSerializer,
    ThreadContext,
    all_devices,
    get_all_virtual_parameters,
    no_registration,
    virtual_device_classes,
    virtual_devices,
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
        # if isinstance(
        #     value,
        #     (
        #         ParameterInstance,
        #         Int,
        #         PadOrKey,
        #         PadsOrKeysInstance,
        #         VirtualDevice,
        #         Scaler,
        #         WSWaitingRoom,
        #     ),
        # ):
        if hasattr(value, "bind"):
            assert self.cv_name
            value.bind(getattr(device, self.cv_name))


class VirtualDevice(threading.Thread):
    _id: dict[Type, int] = defaultdict(int)
    output_cv = VirtualParameter(name="output", range=(0, 127))

    # We use a consumer to bypass the input queue
    set_pause_cv = VirtualParameter(name="set_pause", range=(0, 1), consumer=True)

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        instance._id[cls] += 1
        instance._number = instance._id[cls]  # type: ignore
        return instance

    def __init__(self, target_cycle_time: float = 0.005, autoconnect: bool = False):
        from .links import Link

        super().__init__(daemon=True)
        self.output = None
        virtual_devices.append(self)
        object.__setattr__(self, "device", self)  # to be polymorphic with Int
        object.__setattr__(self, "__virtual__", self)  # to have a fake section
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

    def receiving(self, value, on: str, ctx: ThreadContext):
        if on == "set_pause":
            self.set_pause = value
        if hasattr(self, "to_update"):
            self.to_update.send_update()  # type: ignore, this is set by the trevor bus dynamically

    def set_parameter(self, param: str, value: Any, ctx: ThreadContext):
        if self.paused:
            return
        try:
            self.input_queue.put_nowait((param, value, ctx or ThreadContext()))
        except Full:
            print(
                f"Warning: input_queue full for {self.uid()} — dropping message {param}={value}"
            )
            # self.target_cycle_time = 0.001

    def process_input(self, param: str, value):
        setattr(self, param, value)

    def run(self):
        self.ready_event.set()
        ctx = self.setup()
        ctx.parent = self
        ctx.last_value = {}

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
            changed = []
            for _ in range(batch_size):
                try:
                    param, value, inner_ctx = self.input_queue.get_nowait()
                    changed.append(param)
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
            if changed:
                for param in changed:
                    # ctx.update(inner_ctx)
                    if hasattr(self, f"on_{param}"):
                        value = getattr(self, f"on_{param}")(getattr(self, param), ctx)
                        if value is not None:
                            self.process_output(
                                value,
                                ctx,
                                selected_outputs=[self.output_cv],
                                changed=changed,
                            )
            else:
                ctx.update(inner_ctx)
                # try:
                value = self.main(ctx)
                if value is not None:
                    self.process_output(
                        value, ctx, selected_outputs=[self.output_cv], changed=changed
                    )
                # except Exception as e:
                #     print(
                #         f"Exception caught in {self.repr()}, execution continue, but you should check that:\n * {e}"
                #     )

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

    def process_output(
        self,
        value,
        ctx,
        selected_outputs: None | list[ParameterInstance] = None,
        changed=None,
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

        for output in outputs or list(self.nonstream_links.keys()):
            if (
                value != ctx.last_value.get(output)
                and ctx.last_value.get(output) is not None
            ):
                links = self.nonstream_links.get(output, [])
                for link in links:
                    try:
                        link.trigger(value, ctx)
                    except Exception as e:
                        traceback.print_exc()
                        raise e
            ctx.last_value[output] = value

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

    @property
    def set_pause(self):
        return 1 if self.paused else 0

    @set_pause.setter
    def set_pause(self, value):
        if value == 0:
            self.resume()
        else:
            self.pause()

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
    def min_range(self) -> float | int | None:
        return self.output_cv.parameter.range[0]

    @property
    def max_range(self) -> float | int | None:
        return self.output_cv.parameter.range[1]

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

    def to_dict(self, save_defaultvalues=False):
        virtual_parameters = self.all_parameters()
        config = self.current_preset()
        # del config["output"]
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
            try:
                value = object.__getattribute__(self, parameter.name)
                if value is not None:
                    d[parameter.name] = value
            except AttributeError:
                pass
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


@no_registration
class TimeBasedDevice(VirtualDevice):
    speed_cv = VirtualParameter("speed", range=(0, 10.0))
    phase_cv = VirtualParameter("phase", range=(0.0, 1.0))
    sync_cv = VirtualParameter("sync")
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
        self.phase = 0.0
        self.sync = None
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

    def on_sync(self, value, ctx):
        if value > 0:
            ctx.t = 0

    def main(self, ctx: ThreadContext):
        t = ctx.t
        ticks = ctx.ticks
        generated_value = self.generate_value((t + Decimal(self.phase)) % 1, ticks)
        t += self.time_step
        ctx.t = t % 1
        ctx.ticks += 1
        return generated_value
