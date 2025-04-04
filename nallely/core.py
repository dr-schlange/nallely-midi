import json
import threading
import time
import traceback
from collections import defaultdict
from dataclasses import InitVar, dataclass, field
from decimal import Decimal
from pathlib import Path
from queue import Empty, Full, Queue
from typing import Any, Callable, Counter, Literal, Type

import mido

from .modules import (
    DeviceState,
    Int,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
    PadOrKey,
    Scaler,
)

virtual_devices = []
connected_devices = []


def stop_all_virtual_devices():
    for device in list(virtual_devices):
        device.stop()
    # scheduler.stop()


def stop_all_connected_devices():
    stop_all_virtual_devices()
    for device in list(connected_devices):
        device.close()


def get_connected_devices():
    return connected_devices


def get_virtual_devices():
    return virtual_devices


def all_devices():
    return get_connected_devices() + get_virtual_devices()


def unbind_all(target=None, param=None):
    for device in list(all_devices()):
        if target == None:
            device.unbind_all()
        elif param == None:
            device.unbind(target)
        else:
            if isinstance(param, Int):
                param = param.parameter
                device.unbind(target, param, type=param.type, cc_note=param.cc_note)
            elif isinstance(param, ModuleParameter):
                device.unbind(target, param, type=param.type, cc_note=param.cc_note)
            else:
                device.unbind(target, param)


class ThreadContext(dict):
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


@dataclass
class CallbackRegistryEntry:
    def __init__(
        self,
        target: "VirtualDevice | MidiDevice",
        parameter: "VirtualParameter | ModuleParameter | ModulePadsOrKeys | PadOrKey | ParameterInstance",
        callback: Callable[[Any, ThreadContext], Any],
        cc_note: int | None = None,
        type: str | None = None,
    ):
        self.target = target
        self.parameter = parameter
        self.callback = callback
        self.cc_note = cc_note
        self.type = type


class ParameterInstance:
    def __init__(self, parameter, device):
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


@dataclass
class VirtualParameter:
    name: str
    stream: bool = False
    consummer: bool = False
    description: str | None = None
    range: tuple[int | None, int | None] = (None, None)
    prefered_converter_type: Literal["lin"] | Literal["log"] = "lin"

    def should_adapt_low(self, olow):
        low, _ = self.range
        return low is not None and olow != low

    def should_adapt_high(self, ohigh):
        _, high = self.range
        return high is not None and high != ohigh

    def __get__(self, device: "VirtualDevice", owner=None):
        return ParameterInstance(parameter=self, device=device)

    def __set__(self, device: "VirtualDevice", value, append=True):
        if isinstance(value, VirtualDevice):
            input = value
            low, high = self.range
            nlow, nhigh = None, None
            if self.should_adapt_high(None):
                nhigh = high
            if self.should_adapt_low(None):
                nlow = low
            if nhigh is not None or nlow is not None:
                print("Adapt range", self.range)
                self.__set__(
                    device,
                    Scaler(
                        input,
                        input.device,
                        to_min=low,
                        to_max=high,
                        method=self.prefered_converter_type,
                        from_min=input.min_range,
                        from_max=input.max_range,
                    ),
                )
                return

            if self.consummer:
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
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    param=self,
                    stream=self.stream,
                    append=append,
                )
        elif isinstance(value, Int):
            if self.consummer:
                int_val = value
                int_val.device.bind(
                    lambda value, ctx: device.receiving(
                        value,
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": int_val.parameter.name}),
                    ),
                    to=device,
                    param=value.parameter,
                    type=value.parameter.type,
                    cc_note=value.parameter.cc_note,
                    stream=self.stream,
                    append=append,
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    param=value.parameter,
                    type=value.parameter.type,
                    cc_note=value.parameter.cc_note,
                    stream=self.stream,
                    append=append,
                )
        elif isinstance(value, ParameterInstance):
            if self.consummer:
                value.device.bind(
                    lambda _, ctx: device.receiving(
                        getattr(value.device, value.parameter.name),
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": value.parameter.name}),
                    ),
                    to=device,
                    param=self,
                    append=append,
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
                )
        elif isinstance(value, Scaler):
            scaler = value
            scaler.install_fun(device, self, append=append)
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
            )


class VirtualDevice(threading.Thread):
    variable_refresh: bool = True

    def __init__(self, target_cycle_time: float = 0.005):
        super().__init__(daemon=True)
        virtual_devices.append(self)
        self.device = self  # to be polymorphic with Int
        self.callbacks_registry: list[CallbackRegistryEntry] = []
        self.callbacks = []
        self.stream_callbacks = []
        self.input_queue = Queue(maxsize=200)
        self.output_queue = Queue(maxsize=2000)
        self.pause_event = threading.Event()
        self.paused = False
        self.running = False
        self.pause_event.set()
        self.target_cycle_time = target_cycle_time
        self.ready_event = threading.Event()

    def setup(self) -> ThreadContext:
        return ThreadContext()

    def main(self, ctx: ThreadContext) -> Any: ...

    def receiving(self, value, on: str, ctx: ThreadContext): ...

    def set_parameter(self, param: str, value: Any):
        self.input_queue.put((param, value))

    def run(self):
        self.ready_event.set()
        ctx = self.setup()
        ctx.parent = self
        ctx.last_value = None
        while self.running:
            start_time = time.perf_counter()
            self.pause_event.wait()
            if not self.running:
                break
            # Check input queue
            try:
                param, value = self.input_queue.get_nowait()
                self.process_input(param, value)
                self.input_queue.task_done()
            except Empty:
                pass

            # Consume from output_queue
            while not self.output_queue.empty():
                try:
                    value, output_ctx = self.output_queue.get_nowait()
                    self.receiving(value, "output_queue", output_ctx)
                    self.output_queue.task_done()
                except Empty:
                    break

            value = self.main(ctx)
            self.process_output(value, ctx)

            # Adaptive sleep to try to maintain constant cycle time
            elapsed_time = time.perf_counter() - start_time
            sleep_time = max(0, self.target_cycle_time - elapsed_time)
            if sleep_time == 0:
                # print(
                #     f"Warning: Cycle time exceeded for {self}: {elapsed_time:.6f}s > {target_cycle_time:.6f}s"
                # )
                ...
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
        if not self.running:
            return
        self.running = False
        self.pause_event.set()
        if self.is_alive():
            self.join()  # Wait for the thread to finish
        if clear_queues:
            # Clear input_queue
            while not self.input_queue.empty():
                try:
                    self.input_queue.get_nowait()
                    self.input_queue.task_done()
                except Empty:
                    break
            # Clear output_queue
            while not self.output_queue.empty():
                try:
                    self.output_queue.get_nowait()
                    self.output_queue.task_done()
                except Empty:
                    break
        if self in virtual_devices:
            virtual_devices.remove(self)

    def pause(self, duration=None):
        """Pause the LFO, optionally for a specific duration."""
        if self.running and not self.paused:
            self.paused = True
            self.pause_event.clear()
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

    def bind(self, callback, to, param, stream=False, append=True):
        # if to:
        #     scheduler.connections.append((self, to))
        if not append:
            unbind_all(to, param)
        if stream:
            self.stream_callbacks.append(callback)
        else:
            self.callbacks.append(callback)
        self.callbacks_registry.append(
            CallbackRegistryEntry(target=to, parameter=param, callback=callback)
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
                    self.stream_callbacks.remove(callback)
                except ValueError:
                    ...
                try:
                    self.callbacks.remove(callback)
                except ValueError:
                    ...

    def process_input(self, param, value):
        setattr(self, param, value)

    def process_output(self, value, ctx):
        if value is not None:
            try:
                self.output_queue.put_nowait((value, ctx))
            except Full:
                pass  # Drop if full
        for callback in self.stream_callbacks:
            try:
                callback(value, ctx)
            except Exception as e:
                traceback.print_exc()
                raise e
        if value != ctx.last_value:
            ctx.last_value = value
            for callback in self.callbacks:
                try:
                    callback(value, ctx)
                except Exception as e:
                    traceback.print_exc()
                    raise e

    def scale(self, min, max, method="log", as_int=False):
        return Scaler(self, self, min, max, method, as_int, from_max=self.max_range)

    @property
    def max_range(self) -> float | int | None:
        return None

    @property
    def min_range(self) -> float | int | None:
        return None

    def generate_fun(self, to_device, to_param):
        if isinstance(to_param, VirtualParameter):
            if to_param.consummer:
                return lambda value, ctx: to_device.receiving(
                    value,
                    on=to_param.name,
                    ctx=ThreadContext({**ctx, "param": self.__class__.__name__}),
                )
            else:
                return lambda value, ctx: to_device.set_parameter(to_param.name, value)
        else:
            return lambda value, ctx: setattr(to_device, to_param.name, value)


@dataclass
class MidiDevice:
    variable_refresh = False

    device_name: str
    modules_descr: list[Type[Module]] | None = None
    autoconnect: InitVar[bool] = True
    read_input_only: InitVar[bool] = False
    played_notes: Counter = field(default_factory=Counter)
    outport: mido.ports.BaseOutput | None = None
    inport: mido.ports.BaseInput | None = None
    debug: bool = False
    on_midi_message: Callable[["MidiDevice", mido.Message], None] | None = None

    def __post_init__(self, autoconnect, read_input_only):
        self.reverse_map = {}
        # callbacks that are called when reacting to a value
        self.callbacks_registry: list[CallbackRegistryEntry] = []
        self.input_callbacks: defaultdict[tuple[str, int], list[Any]] = defaultdict(
            list
        )
        self.output_callbacks = []  # callbacks that are classed when sending a value
        if self.modules_descr is None:
            self.modules_descr = []
        self.modules = DeviceState(self, self.modules_descr)
        self.listening = False
        if autoconnect:
            try:
                self.device_name = next(
                    (
                        dev_name
                        for dev_name in mido.get_output_names()
                        if self.device_name == dev_name or self.device_name in dev_name
                    ),
                )
            except StopIteration:
                raise DeviceNotFound(self.device_name)
            if not read_input_only:
                self.connect()
            self.listen()

    def connect(self):
        self.outport = mido.open_output(self.device_name, autoreset=True)
        if self not in connected_devices:
            connected_devices.append(self)

    def close(self):
        if self.inport:
            self.inport.callback = None
        if self.outport:
            self.outport.close()
            if self in connected_devices:
                connected_devices.remove(self)

    def _sync_state(self, msg):
        if msg.type == "clock":
            return
        if self.on_midi_message:
            self.on_midi_message(self, msg)
        if self.debug:
            print(msg)
        if msg.type == "control_change":
            try:
                for callback in self.input_callbacks.get((msg.type, msg.control), []):
                    callback(msg.value, ThreadContext({"debug": self.debug}))
            except:
                traceback.print_exc()
            control: ModuleParameter = self.reverse_map[("cc", msg.control)]
            control.basic_set(self, msg.value)
        if msg.type == "note_on" or msg.type == "note_off":
            try:
                for callback in self.input_callbacks.get(("note", msg.note), []):
                    callback(
                        msg.note,
                        ThreadContext(
                            {
                                "debug": self.debug,
                                "type": msg.type,
                                "velocity": msg.velocity,
                            }
                        ),
                    )
                for callback in self.input_callbacks.get(("velocity", msg.note), []):
                    callback(
                        msg.velocity,
                        ThreadContext(
                            {
                                "debug": self.debug,
                                "type": msg.type,
                                "note": msg.note,
                            }
                        ),
                    )
            except:
                traceback.print_exc()
            pads: ModulePadsOrKeys = self.reverse_map[("note", None)]
            pads.basic_send(msg.type, msg.note, msg.velocity)

    def send(self, msg):
        if not self.outport:
            return
        self.outport.send(msg)

    def note(self, type, note, velocity=127 // 2, channel=0):
        getattr(self, type)(note, velocity=velocity, channel=channel)

    def note_on(self, note, velocity=127 // 2, channel=0):
        if not self.outport:
            return
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
        self.outport.send(
            mido.Message(
                "control_change", channel=channel, control=control, value=value
            )
        )

    def unbind_all(self):
        self.callbacks_registry.clear()
        self.input_callbacks.clear()

    def bind(self, callback, type, cc_note, to, param, stream=False, append=True):
        # if to:
        #     scheduler.connections.append((self, to))
        if not append:
            unbind_all(to, param)
        self.input_callbacks[(type, cc_note)].append(callback)
        self.callbacks_registry.append(
            CallbackRegistryEntry(
                target=to,
                parameter=param,
                callback=callback,
                type=type,
                cc_note=cc_note,
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
                    self.input_callbacks[(type, cc_note)].remove(callback)  # type: ignore
                except ValueError:
                    ...

    def __isub__(self, other):
        # The only way to be here is from a callback removal on the key/pad section
        match other:
            case PadOrKey():
                mm = self.reverse_map[("note", None)]
                other.device.unbind(self, mm, other.type, other.cc_note)
                return
        raise Exception(f"Unbinding {other.__class__.__name__} not yet supported")

    # def bind_output(self, callback):
    #     self.output_callbacks.append(callback)

    def listen(self, start=True):
        if not start:
            self.listening = False
            self.inport.callback = None
            return
        if not self.listening:
            try:
                self.inport = mido.open_input(self.device_name)
            except OSError:
                try:
                    self.device_name = next(
                        (
                            dev_name
                            for dev_name in mido.get_input_names()
                            if self.device_name == dev_name
                            or self.device_name in dev_name
                        ),
                    )
                    self.inport = mido.open_input(self.device_name)
                except StopIteration:
                    raise DeviceNotFound(self.device_name)
            self.inport.callback = self._sync_state
        if self not in connected_devices:
            connected_devices.append(self)

    def save_preset(self, file: Path | str):
        d = self.modules.as_dict()
        p = Path(file)
        p.write_text(json.dumps(d, indent=2, cls=DeviceSerializer))

    def load_preset(self, file: Path | str):
        p = Path(file)
        self.modules.from_dict(json.loads(p.read_text()))


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
            f"""Device {device_name!r} couldn't be found, known devices are:
input: {mido.get_output_names()}
outputs: {mido.get_input_names()}"""
        )


class TimeBasedDevice(VirtualDevice):
    def __init__(
        self,
        speed: int | float = 10.0,
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
            return 20  # we sample 20 point, enough as it's slow
        return int(self.speed * 20)  # we sample 20 times faster than the speed

    def generate_value(self, t) -> Any: ...

    def setup(self):
        return ThreadContext({"t": Decimal(0), "ticks": 0})

    def main(self, ctx: ThreadContext):
        t = ctx.t
        generated_value = self.generate_value(t)
        t += self.time_step
        ctx.t = t % 1
        ctx.ticks += 1
        return generated_value


# class VirtualDeviceScheduler(VirtualDevice):
#     def __init__(self, **kwargs):
#         self.connections = []
#         super().__init__(**kwargs)

#     def main(self, ctx):
#         devices_graph = defaultdict(list)
#         devices = {}
#         is_used_as_src = []
#         for src, dest in self.connections:
#             # We should build a chain for all the dependencies to build multiple trees
#             # This is a first PoC
#             if isinstance(src, TimeBasedDevice) and isinstance(dest, TimeBasedDevice):
#                 dest_id = id(dest)
#                 devices_graph[dest_id].append(src)
#                 devices[dest_id] = dest
#                 is_used_as_src.append(src)

#         for device_id, feeders in devices_graph.items():
#             device = devices[device_id]
#             if device not in is_used_as_src:  # We know we are on a "leaf"
#                 ...  # adjust me
#             # we go 5 times the sum of all the freqs
#             ideal_refresh_freq = int(
#                 sum((1 / f.target_cycle_time) for f in feeders) * 5
#             )
#             current_refresh_freq = int(1 / device.target_cycle_time)
#             print(
#                 f"Ideal is {ideal_refresh_freq}Hz, and current is {current_refresh_freq}Hz"
#             )
#             if ideal_refresh_freq != current_refresh_freq:
#                 print(f"Change to {ideal_refresh_freq}")
#                 device.set_parameter("sampling_rate", ideal_refresh_freq)
#                 time.sleep(1)


# # Try to enforce 1Hz for this device
# scheduler = VirtualDeviceScheduler(target_cycle_time=0.5)
# scheduler.start()
