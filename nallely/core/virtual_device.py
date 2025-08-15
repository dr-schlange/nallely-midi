import json
import threading
import time
import traceback
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from decimal import Decimal
from pathlib import Path
from queue import Empty, Full, Queue
from types import GeneratorType
from typing import Any, Callable, Literal, Sequence, Type

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
    accepted_values: Sequence[Any] = ()
    cv_name: str | None = None
    section_name: str = "__virtual__"
    cc_note: int = -1

    def __post_init__(self):
        if self.accepted_values and self.range == (None, None):
            self.range = (0, len(self.accepted_values) - 1)

    def __set_name__(self, owner, name):
        self.cv_name = name

    def __get__(self, device: "VirtualDevice", owner=None):
        if device is None:
            return self
        return ParameterInstance(parameter=self, device=device)

    def __set__(self, device: "VirtualDevice", value, append=True, chain=None):
        if hasattr(value, "bind"):
            assert self.cv_name
            value.bind(getattr(device, self.cv_name))


class OnChange:
    conditions = {
        "any": lambda _, __: True,
        "flat": lambda prev, curr: prev is not None and curr == prev,
        "both": lambda prev, curr: prev != curr,
        "rising": lambda prev, curr: (prev or 0) == 0 and curr > 0,
        "increase": lambda prev, curr: prev is not None and curr > prev,
        "decrease": lambda prev, curr: prev is not None and curr < prev,
        "falling": lambda prev, curr: (prev or 0) > 0 and curr == 0,
    }
    conditions_name = list(conditions.keys())

    def __init__(self, parameter, func, condition):
        self.parameter = parameter
        self.func = func
        self.condition_func = None
        self._lock = threading.RLock()

        try:
            self.condition_func = self.conditions[condition]
            self.condition = condition
            self._wrap_func()
            return
        except KeyError:
            if callable(condition):
                self.condition_func = condition
                self.condition = f"custom_{id(condition)}"
                self._wrap_func()
                return
        raise ValueError(f"Condition {condition} unknown")

    def _wrap_func(self):
        original = self.func
        cond = self.condition_func
        assert cond
        lock = self._lock
        # send_out = lambda vdev, ctx, value, selected_outputs: vdev.send_out(
        #     value,
        #     selected_outputs=selected_outputs,
        #     ctx=ctx,
        #     from_=self.parameter.name,
        # )

        def wrapped(instance, value, last_value, ctx):
            with lock:
                condition_met = cond(last_value, value)
                last_value = value

            if condition_met:
                # ctx.send_out = partial(instance.send_out, ctx=ctx)
                return True, original(instance, value, ctx)  # type: ignore
            return False, None

        self.func = wrapped

    @classmethod
    def alias_name(cls, parameter_name, condition_name):
        return f"_on_{condition_name}_{parameter_name}"

    def __set_name__(self, owner, name):
        alias_name = self.alias_name(self.parameter.name, self.condition)
        setattr(owner, alias_name, self.func)
        setattr(owner, name, self.func)

    def __get__(self, instance, owner):
        return self.func.__get__(instance, owner)


def on(
    parameter,
    edge: (
        Literal["rising", "falling", "both", "increase", "decrease", "flat", "any"]
        | Callable[[int | float, int | float], int | float | None]
    ),
):
    def wrapper(func):
        return OnChange(parameter, func, condition=edge)

    return wrapper


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

    def __init__(self, target_cycle_time: float = 0.002, autoconnect: bool = False):
        from ..utils import ThreadSafeDefaultDict
        from .links import Link

        super().__init__(daemon=True)
        self.debug = False
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
        self.input_queues = ThreadSafeDefaultDict(lambda: Queue(maxsize=2000))
        self.pause_event = threading.Event()
        self.paused = False
        self.running = False
        self.pause_event.set()
        self.target_cycle_time = target_cycle_time
        self.ready_event = threading.Event()
        self.closed_ports = set()
        self._param_last_values = {}
        if autoconnect:
            self.start()

    def __init_subclass__(cls) -> None:
        virtual_device_classes.append(cls)
        super().__init_subclass__()

    def setup(self) -> ThreadContext:
        return ThreadContext()

    def main(self, ctx: ThreadContext) -> Any: ...

    def debug_print(self, ctx):
        print("======")
        print(f"{self.uid()}")
        print("======")
        for virt in self.all_parameters():
            print(f"* {virt.cv_name}[{virt.name}] = {getattr(self, virt.name)}")

    def _open_port(self, port):
        try:
            self.closed_ports.remove(port)
        except:
            pass

    def _close_port(self, port):
        self.closed_ports.add(port)

    def receiving(self, value, on: str, ctx: ThreadContext):
        if on == "set_pause":
            self.set_pause = value
        if hasattr(self, "to_update"):
            self.to_update.send_update()  # type: ignore -> this is set by the trevor bus dynamically

    def set_parameter(self, param: str, value: Any, ctx: ThreadContext | None = None):
        if self.paused or param in self.closed_ports:
            return
        try:
            try:
                previous = getattr(self, param)
            except:
                previous = None
            self.store_input(param, value)  # We store for immediate feedback
            self.input_queues[param].put_nowait(
                (value, previous, ctx or ThreadContext())
            )
        except Full:
            print(
                f"Warning: input_queue full for {self.uid()}[{param}] — dropping message {value}"
            )
            # self.target_cycle_time = 0.001

    def store_input(self, param: str, value):
        setattr(self, param, value)

    # def sleep(self, t):
    #     if t < self.target_cycle_time * 1000:
    #         # print(f"Fits {t=} in the current time of {self.target_cycle_time * 1000}ms")
    #         time.sleep(float(t) / 1000)
    #         yield
    #         return
    #     next_tick = time.time_ns() + t * 1_000_000
    #     # print(f"Sleeping for {t}ms until {next_tick}")
    #     while time.time_ns() < next_tick:
    #         # print(f"Still sleeping... now={time.time_ns()}")
    #         yield "__suspend__"
    #     # print(f"Finished sleeping at {time.time_ns()}")
    #     yield

    def sleep(self, t, consider_target_time=False):
        if self.target_cycle_time > 0 and consider_target_time:
            t = min(float(t), self.target_cycle_time * 1000)
        else:
            t = float(t)

        end_time = time.perf_counter() + t / 1000.0

        while True:
            remaining = end_time - time.perf_counter()
            if remaining <= 0:
                break
            if remaining > 0.002:
                time.sleep(remaining / 2)
            else:
                time.sleep(0)
            yield "__suspend__"

        yield

    def run(self):
        self.ready_event.set()
        ctx = self.setup()
        ctx.parent = self
        ctx.last_values = {}
        edge_keys = OnChange.conditions_name
        alias_name = OnChange.alias_name
        self.suspended_tasks = []
        main_gen = self.main(ctx)

        def handle_output(return_value, param, ctx):
            if isinstance(return_value, tuple):
                return_value, selected_outputs = return_value
            else:
                selected_outputs = [self.output_cv]
            # if self.debug:
            #     print(f"out: {selected_outputs}")
            self.send_out(
                return_value,
                ctx,
                selected_outputs=selected_outputs,
                from_=param,
            )

        def handle_generator_or_output(value, param, ctx) -> bool:
            """Returns True if generator finished, False otherwise"""
            if isinstance(value, GeneratorType):
                try:
                    while True:
                        gen_return = next(value)
                        if isinstance(gen_return, GeneratorType):
                            try:
                                while True:
                                    sleepytime = next(gen_return)
                                    if sleepytime == "__suspend__":
                                        self.suspended_tasks.append(
                                            (gen_return, value, param, ctx)
                                        )
                                        return False
                            except StopIteration:
                                continue
                        if gen_return is None or gen_return == "__suspend__":
                            continue
                        handle_output(gen_return, param, ctx)
                except StopIteration as e:
                    gen_return = e.value
                    if gen_return and gen_return != "__suspend__":
                        handle_output(e.value, param, ctx)
                    return True
            else:
                handle_output(value, param, ctx)
            return False

        def resume_suspended_tasks():
            still_pending = []
            for sleep_gen, parent_gen, param, ctx in self.suspended_tasks:
                try:
                    result = next(sleep_gen)
                    if result == "__suspend__":
                        still_pending.append((sleep_gen, parent_gen, param, ctx))
                    else:
                        handle_generator_or_output(parent_gen, param, ctx)
                except StopIteration:
                    handle_generator_or_output(parent_gen, param, ctx)

            self.suspended_tasks = still_pending

        while self.running:
            start_time = time.perf_counter()
            self.pause_event.wait()  # Block if paused

            if not self.running:
                break

            resume_suspended_tasks()

            changed = set()
            inner_ctx = {}
            for param, input_queue in list(self.input_queues.items()):
                # Process a batch of inputs per cycle (to avoid backlog)
                max_batch_size = 10  # Maximum number of items to process per cycle
                queue_level = input_queue.qsize()
                # We adjust the batch size dynamically based on queue pressure
                batch_size = min(max_batch_size, max(1, int(queue_level / 100)))
                for _ in range(batch_size):
                    try:
                        value, previous, inner_ctx = input_queue.get_nowait()
                        changed.add(param)
                        self.store_input(param, value)
                        self._param_last_values[param] = previous
                        input_queue.task_done()
                    except Empty:
                        break

                # Log queue pressure
                queue_level = input_queue.qsize()
                if queue_level > input_queue.maxsize * 0.8:
                    print(
                        f"[{self.uid()}] Queue usage: {queue_level}/{input_queue.maxsize}"
                    )

            # Run main processing and output
            # triggered = False
            if changed:
                # if any parameter have been impacted
                for param in changed:
                    current_value = getattr(self, param)
                    last_value = self._param_last_values.get(param)
                    for key in edge_keys:
                        aliased_name = alias_name(param, key)
                        if hasattr(self, aliased_name):
                            success, value = getattr(self, aliased_name)(
                                current_value, last_value, ctx
                            )
                            # triggered = True
                            if success and self.debug:
                                print(
                                    f"TRIGGER {param} {aliased_name} {last_value=} {getattr(self, param)=}"
                                )
                                self.debug_print(ctx)
                                print()
                            if not success or value is None:
                                continue
                            ctx.update(inner_ctx)
                            handle_generator_or_output(value, param, ctx)
            # we call the idle loop
            # # if not triggered:
            # value = next(main_gen)
            if main_gen is None or not isinstance(main_gen, GeneratorType):
                main_gen = self.main(ctx)
            finished = handle_generator_or_output(main_gen, "_default_idle", ctx)
            if finished:
                main_gen = None
            # if queue_level > self.input_queue.maxsize * 0.8:
            #     # Skip sleep to catch up faster
            #     print(
            #         f"[{self.uid()}] High queue pressure, skipping sleep for this cycle."
            #     )
            # else:
            #     # Adaptive sleep
            #     elapsed_time = time.perf_counter() - start_time
            #     sleep_time = max(0, self.target_cycle_time - elapsed_time)
            #     time.sleep(sleep_time)

            # Adaptive sleep
            elapsed_time = time.perf_counter() - start_time
            sleep_time = max(0, self.target_cycle_time - elapsed_time)
            time.sleep(sleep_time)

    def send_out(
        self,
        value,
        ctx,
        selected_outputs: None | list[ParameterInstance] = None,
        from_: str | None = None,
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
            # perform internal routing. I don't like it
            # please refactor at some point with the
            # logic of the vparam -> vparam link
            for output in selected_outputs:
                setattr(self, output.name, value)

        for output in outputs or list(self.stream_links.keys()):
            links = self.stream_links.get(output, [])
            for link in links:
                try:
                    if self.debug:
                        print(f"[{output}]", value, ctx)
                    link.trigger(value, ctx)
                except Exception as e:
                    traceback.print_exc()
                    raise e

        for output in outputs or list(self.nonstream_links.keys()):
            last_value_key = f"{output}_{from_}"
            if value != ctx.last_values.get(last_value_key):
                links = self.nonstream_links.get(output, [])
                for link in links:
                    try:
                        if self.debug:
                            print(f"[{output}]", value, ctx)
                        link.trigger(value, ctx)
                    except Exception as e:
                        traceback.print_exc()
                        raise e
                ctx.last_values[last_value_key] = value

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
        if clear_queues:
            # Clear input_queue
            for inqueue in self.input_queues.values():
                while not inqueue.empty():
                    try:
                        inqueue.get_nowait()
                        inqueue.task_done()
                    except Empty:
                        break
        if self.is_alive():
            self.join()  # Wait for the thread to finish

    def pause(self, duration=None):
        """Pause the LFO, optionally for a specific duration."""
        if self.running and not self.paused:
            self.paused = True
            self.pause_event.clear()
            for inqueue in self.input_queues.values():
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
            self.store_input(parameter.name, rand(min, max))  # type: ignore


SUBDIVISIONS = {
    "4/1": Decimal("0.25"),
    "2/1": Decimal("0.5"),
    "1/1": 1,
    "1/2": 2,
    "1/4": 4,
    "1/8": 8,
    "1/16": 16,
    "1/32": 32,
    "1/1t": Decimal(3) / Decimal(2),
    "1/2t": 2 * Decimal(3) / Decimal(2),
    "1/4t": 4 * Decimal(3) / Decimal(2),
    "1/8t": 8 * Decimal(3) / Decimal(2),
    "1/16t": 16 * Decimal(3) / Decimal(2),
    "1/32t": 32 * Decimal(3) / Decimal(2),
}


@no_registration
class TimeBasedDevice(VirtualDevice):
    speed_cv = VirtualParameter("speed", range=(0, 10.0))
    phase_cv = VirtualParameter("phase", range=(0.0, 1.0))
    sync_cv = VirtualParameter("sync")
    subdiv_cv = VirtualParameter("subdiv", accepted_values=(tuple(SUBDIVISIONS.keys())))
    sampling_rate_cv = VirtualParameter("sampling_rate", range=(0.001, None))

    def __init__(
        self,
        speed: int | float | Decimal = 1.0,
        sampling_rate: int | Literal["auto"] = "auto",
        **kwargs,
    ):
        self._speed = Decimal(speed)
        self.auto_sampling_rate = sampling_rate == "auto"
        self._sampling_rate = (
            self.compute_sampling_rate() if sampling_rate == "auto" else sampling_rate
        )
        self.time_step = Decimal(speed) / self._sampling_rate
        self.phase = Decimal(0.0)
        self.sync = None
        self.window_size = 4
        self.smoothing = Decimal("0.1")
        self.last_sync_time = time.perf_counter()
        self.sync_intervals = deque(maxlen=self.window_size)
        self._subdiv = "1/1"
        super().__init__(target_cycle_time=1 / self._sampling_rate, **kwargs)

    @property
    def speed(self):
        return self._speed

    @speed.setter
    def speed(self, value):
        self._speed = Decimal(value)
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

    @property
    def subdiv(self):
        return self._subdiv

    @subdiv.setter
    def subdiv(self, value):
        if isinstance(value, (int, float, Decimal)):
            accepted_values = self.subdiv_cv.parameter.accepted_values
            value = accepted_values[int(value % len(accepted_values))]
        self._subdiv = value

    def generate_value(self, t, ticks) -> Any: ...

    def setup(self):
        return ThreadContext()

    @on(sync_cv, edge="rising")
    def on_sync(self, value, ctx):
        now = time.perf_counter()

        subdivision_factor = SUBDIVISIONS[self.subdiv]

        if self.last_sync_time is not None:
            interval = now - self.last_sync_time
            self.sync_intervals.append(interval)
            avg_interval = sum(self.sync_intervals) / len(self.sync_intervals)
            snap_frequency = (
                Decimal(1.0) / Decimal(avg_interval) * Decimal(subdivision_factor)
            )
            self.speed = snap_frequency

            # Estimated BPM for a quater note
            ctx.sync_bpm = float(60.0 / avg_interval)
        else:
            self.speed = Decimal(self._speed) * Decimal(subdivision_factor)
            ctx.sync_bpm = float(self._speed * 60)

        # Reset phase
        # print(f"Set freq={self.speed} for estimated bpm={ctx.sync_bpm}")
        self.phase = Decimal(0)
        self.last_sync_time = now

    def main(self, ctx: ThreadContext):
        # Compute t using measured time
        elapsed = Decimal(time.perf_counter() - self.last_sync_time)
        t = (self.speed * elapsed + Decimal(self.phase)) % 1
        generated_value = self.generate_value(t, None)
        return generated_value
