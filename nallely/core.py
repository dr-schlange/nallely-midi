from decimal import Decimal
import threading
import time
import traceback
from collections import defaultdict
from dataclasses import InitVar, dataclass, field
from queue import Empty, Full, Queue

# from concurrent.futures import ThreadPoolExecutor
from typing import Any, Counter, Type

import mido

from .modules import DeviceState, Int, Module, ModulePadsOrKeys, ModuleParameter, Scaler

running_virtual_devices = []
connected_devices = []
# executor = ThreadPoolExecutor(max_workers=10)  # Shared pool for callbacks


def stop_all_virtual_devices():
    for device in list(running_virtual_devices):
        device.stop()
    # scheduler.stop()


def stop_all_connected_devices():
    stop_all_virtual_devices()
    for device in list(connected_devices):
        device.close()


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
class ParameterInstance:
    parameter: "Parameter"
    device: "VirtualDevice"


@dataclass
class Parameter:
    name: str
    stream: bool = False
    consummer: bool = False

    def __get__(self, device: "VirtualDevice", owner=None):
        return ParameterInstance(parameter=self, device=device)

    def __set__(self, device: "VirtualDevice", value):
        if isinstance(value, VirtualDevice):
            if self.consummer:
                value.device.bind(
                    lambda value, ctx: device.receiving(
                        value,
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": self.name}),
                    ),
                    to=device,
                    stream=self.stream,
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    stream=self.stream,
                )
        elif isinstance(value, Int):
            if self.consummer:
                value.device.bind(
                    lambda value, ctx: device.receiving(
                        value,
                        on=self.name,
                        ctx=ThreadContext({**ctx, "param": self.name}),
                    ),
                    to=device,
                    # type="control_change",
                    type=value.parameter.type,
                    value=value.parameter.cc,
                    stream=self.stream,
                )
            else:
                value.device.bind(
                    lambda value, ctx: device.set_parameter(self.name, value),
                    to=device,
                    # type="control_change",
                    type=value.parameter.type,
                    value=value.parameter.cc,
                    stream=self.stream,
                )
        elif isinstance(value, ParameterInstance):
            if self.consummer:
                value.device.bind(
                    lambda _, ctx: device.receiving(
                        getattr(value.device, value.parameter.name),
                        on=self.name,
                        ctx=ThreadContext({**ctx, "kind": value.parameter.name}),
                    ),
                    to=device,
                )
        elif isinstance(value, Scaler):
            scaler = value
            if self.consummer:
                scaler.device.bind(
                    lambda value, ctx: device.receiving(
                        scaler.convert(value), on=self.name, ctx=ctx
                    ),
                    # type="control_change",
                    type=value.data.parameter.type,
                    value=value.data.parameter.cc,
                    to=device,
                )
            else:
                scaler.device.bind(
                    lambda value, ctx: device.set_parameter(
                        self.name, scaler.convert(value)
                    ),
                    # type="control_change",
                    type=value.data.parameter.type,
                    value=value.data.parameter.cc,
                    to=device,
                )


class VirtualDevice(threading.Thread):
    def __init__(self, target_cycle_time: float = 0.005):
        super().__init__(daemon=True)
        self.device = self  # to be polymorphic with Int
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
        running_virtual_devices.append(self)
        super().start()
        self.ready_event.wait()

    def stop(self, clear_queues=True):
        """Stop the LFO thread."""
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
        if self in running_virtual_devices:
            running_virtual_devices.remove(self)

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

    def bind(self, callback, to, stream=False, append=True):
        # if to:
        #     scheduler.connections.append((self, to))
        if stream:
            if not append:
                self.stream_callbacks.clear()
            self.stream_callbacks.append(callback)
        else:
            if not append:
                self.callbacks.clear()
            self.callbacks.append(callback)

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

    def bind_to(self, other: "VirtualDevice", stream=False):

        def queue_callback(value, ctx):
            try:
                other.output_queue.put_nowait((value, ctx))
            except Full:
                pass

        self.bind(queue_callback, stream=stream)


@dataclass
class MidiDevice:
    device_name: str
    modules_descr: list[Type[Module]]
    autoconnect: InitVar[bool] = True
    read_input_only: InitVar[bool] = False
    played_notes: Counter = field(default_factory=Counter)
    outport: mido.ports.BaseOutput | None = None
    inport: mido.ports.BaseInput | None = None
    debug: bool = False
    # on_midi_message: Callable[[mido.Message], None] | Callable[[Self, mido.Message], None] = field(
    #     default=lambda msg: (print("received", msg) if msg.type != "clock" else None)  # type: ignore
    # )

    def __post_init__(self, autoconnect, read_input_only):
        self.reverse_map = {}
        # callbacks that are called when reacting to a value
        self.input_callbacks: defaultdict[tuple[str, int], list[Any]] = defaultdict(
            list
        )
        self.output_callbacks = []  # callbacks that are classed when sending a value
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
            connected_devices.append(self)

    def connect(self):
        self.outport = mido.open_output(self.device_name, autoreset=True)

    def close(self):
        if self.inport:
            self.inport.callback = None
        if self.outport:
            self.outport.close()
            if self in connected_devices:
                connected_devices.remove(self)

    def on_midi_message(self, msg, debug): ...

    def _sync_state(self, msg):
        if msg.type == "clock":
            return
        if self.on_midi_message:
            ...
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
                for callback in self.input_callbacks.get((msg.type, msg.note), []):
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
            except:
                traceback.print_exc()
            pads: ModulePadsOrKeys = self.reverse_map[("note", None)]
            pads.basic_send(msg.type, msg.note, msg.velocity)

    def send(self, msg):
        if not self.outport:
            return
        self.outport.send(msg)

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

    def bind(self, callback, type, value, to, stream=False, append=True):
        # if to:
        #     scheduler.connections.append((self, to))
        if not append:
            self.input_callbacks[(type, value)].clear()
        self.input_callbacks[(type, value)].append(callback)

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


class DeviceNotFound(Exception):
    def __init__(self, device_name):
        super().__init__(f"Device {device_name!r} couldn't be found")


class TimeBasedDevice(VirtualDevice):
    def __init__(self, speed: int | float = 10.0, sampling_rate: int = 44100, **kwargs):
        self._speed = speed
        self._sampling_rate = sampling_rate
        self.time_step = Decimal(speed) / sampling_rate
        super().__init__(**kwargs)

    @property
    def speed(self):
        return self._speed

    @speed.setter
    def speed(self, value):
        self._speed = value
        self.time_step = Decimal(value) / self._sampling_rate

    @property
    def sampling_rate(self):
        return self._sampling_rate

    @sampling_rate.setter
    def sampling_rate(self, value):
        self._sampling_rate = value
        self.time_step = Decimal(value) / self._sampling_rate

    def generate_value(self, t) -> Any: ...

    def setup(self):
        return ThreadContext({"t": Decimal(0), "ticks": 0})

    def main(self, ctx: ThreadContext):
        t = ctx.t
        waveform_value = self.generate_value(t)
        t += self.time_step
        ctx.t = t % 1
        ctx.ticks += 1
        return waveform_value


# class VirtualDeviceScheduler(VirtualDevice):
#     def __init__(self, **kwargs):
#         self.connections = []
#         super().__init__(**kwargs)

#     def main(self, ctx):
#         for src, dest in self.connections:
#             if isinstance(src, TimeBasedDevice):
#                 current_hz = 1/src.time_step
#                 current = 1/dest.target_cycle_time
#                 new_freq = 1/(src.target_cycle_time * 2)
#                 if new_freq != current:
#                     print(f"src={src.target_cycle_time}, dest={dest.target_cycle_time}")
#                     print(f"src={src}, dest={dest}")
#                     print(f"  * refresh={current_hz}Hz")
#                     print(f"   => This src device will produce {current_hz} data every 1s")
#                     print(f"   => This dest device will consume {dest.target_cycle_time} data every 1s")
#                 if new_freq < current:
#                     print(f"   => We could lower refresh of dest to {1/(src.target_cycle_time * 2)}Hz")
#                     print(f"   => I'm lowering it's refresh frequency from {current} to 2times the speed {new_freq}Hz")
#                     dest.set_parameter("target_cycle_time", 1/new_freq)
#                 elif new_freq > current:
#                     print(f"   => We could increase refresh of dest to {1/(src.target_cycle_time * 2)}Hz")
#                     print(f"   => I'm increasing it's refresh frequency from {current} to {new_freq}Hz")
#                     dest.set_parameter("target_cycle_time", 1/new_freq)


# scheduler = VirtualDeviceScheduler(target_cycle_time=1)  # Try to enforce 1Hz
# scheduler.start()
