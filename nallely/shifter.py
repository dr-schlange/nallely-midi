import random
from decimal import Decimal

from .core.virtual_device import VirtualDevice, VirtualParameter, on


class PitchShifter(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 128))
    shift_cv = VirtualParameter("shift", range=(-24, +24))

    @property
    def range(self):
        return (0, 127)

    def __init__(self, *args, **kwargs):
        self.input = 0
        self.shift = 0
        super().__init__(*args, **kwargs)

    @on(input_cv, edge="both")
    def shift_input(self, value, ctx):
        return value + self.shift

    @on(input_cv, edge="falling")
    def reset_input(self, value, ctx):
        return 0

    @on(shift_cv, edge="both")
    def apply_shift(self, value, ctx):
        if self.input > 0:
            return self.input + value
        return 0


class Modulo(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 128))
    modulo_cv = VirtualParameter("modulo", range=(0.001, None))

    @property
    def range(self):
        upper_bound = self.modulo_cv.parameter.range[1]
        if isinstance(upper_bound, (float, int, Decimal)):
            upper_bound -= 1
        return (0, upper_bound)

    def __init__(self, *args, **kwargs):
        self.input = 0
        self.modulo = 1
        super().__init__(*args, **kwargs)

    def store_input(self, param: str, value):
        if param == "modulo" and value == 0:
            value = 0.001
        elif param == "modulo":
            value = float(value)
        return super().store_input(param, value)

    @on(input_cv, edge="both")
    def modulo_input(self, value, ctx):
        return value % self.modulo

    @on(input_cv, edge="falling")
    def reset_input(self, value, ctx):
        return 0

    @on(modulo_cv, edge="both")
    def apply_modulo(self, value, ctx):
        if self.input > 0:
            return value % float(self.modulo)
        return 0


class Arpegiator(VirtualDevice):
    input_cv = VirtualParameter("input", range=(24, 108))
    bpm_cv = VirtualParameter("bpm", range=(20, 600))
    direction_cv = VirtualParameter(
        "direction", accepted_values=("free", "up", "down", "up-down", "random")
    )
    reset_cv = VirtualParameter("reset", range=(0, 1))

    @property
    def range(self):
        return 24, 108

    def store_input(self, param: str, value):
        if param == "direction" and isinstance(value, (int, float, Decimal)):
            accepted_values = self.direction_cv.parameter.accepted_values
            value = accepted_values[int(value % len(accepted_values))]
        return super().store_input(param, value)

    def __init__(self, **kwargs):
        self.input = None
        self.reset = 0
        self.notes = []
        self.index = -1
        self.direction = "free"
        self._incr = +1
        self.bpm = 320
        super().__init__(**kwargs)

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        self.notes.clear()
        return 0

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        if value == 0:
            self.notes.clear()
            return 0
        if value in self.notes:
            self.notes.remove(value)
            if len(self.notes) == 0:
                return 0
        else:
            self.notes.append(value)
            return value

    def main(self, ctx):
        if len(self.notes) == 0:
            return

        if self.direction in ("up", "down", "up-down"):
            sorted_notes = sorted(self.notes)
        else:
            sorted_notes = self.notes

        len_notes = len(self.notes)
        if len_notes == 1:
            self.index = 0

        if self.index < 0 or self.index >= len_notes:
            self.index = 0
            self._incr = 1

        yield sorted_notes[self.index]
        yield from self.sleep(60_000 / self.bpm)

        if self.direction == "up":
            self.index += 1
            if self.index >= len_notes:
                self.index = 0
        elif self.direction == "down":
            self.index -= 1
            if self.index < 0:
                self.index = len_notes - 1
        elif self.direction == "up-down":
            if len_notes == 1:
                self.index = 0
            else:
                next_index = self.index + self._incr

                if next_index >= len_notes:
                    self._incr = -1
                    next_index = self.index + self._incr
                elif next_index < 0:
                    self._incr = 1
                    next_index = self.index + self._incr

                self.index = next_index
        elif self.direction == "random" and len_notes > 1:
            prev_index = self.index
            while True:
                self.index = random.randint(0, len_notes - 1)
                if self.index != prev_index:
                    break


class Looper(VirtualDevice):
    output1_cv = VirtualParameter("output1", range=(0, 127))
    output2_cv = VirtualParameter("output2", range=(0, 127))
    output3_cv = VirtualParameter("output3", range=(0, 127))

    input_cv = VirtualParameter("input", range=(0, 127))

    record_cv = VirtualParameter("record", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    clear_cv = VirtualParameter("clear", range=(0, 1))
    speed_cv = VirtualParameter("speed", range=(0, 127))
    reverse_cv = VirtualParameter("reverse", range=(0, 1))

    @property
    def range(self):
        return 0, 127

    def __init__(self, **kwargs):
        self.recording = False
        self.loop = []
        self.loop_start = 0
        self.playing = False
        self.last_assigned_channel = -1
        self.outputs = [
            self.output_cv,
            self.output1_cv,
            self.output2_cv,
            self.output3_cv,
        ]
        self.input = 0
        self.record = 0
        self.clear = 0
        self.reset = 0
        self.reverse = 0
        for i in range(1, 4):
            setattr(self, f"output{i}", 0)
        self.active_notes = {}
        self.current_index = 0
        self.speed = 1.0
        super().__init__(**kwargs)

    def normalize_loop(self):
        if self.loop:
            first_ts = self.loop[0][0]
            self.loop = [(ts - first_ts, group) for ts, group in self.loop]

    @on(record_cv, edge="rising")
    def start_recording(self, value, ctx):
        if self.debug:
            print("+ START RECORDING")
        self.recording = True
        self.playing = False
        self.loop.clear()
        self.loop_start = self.current_time_ms()
        self.current_index = 0

    @on(record_cv, edge="falling")
    def stop_recording(self, value, ctx):
        if self.debug:
            print("+ STOP RECORDING")
        self.recording = False
        now = self.current_time_ms()

        if self.loop:
            self.loop_duration = now - self.loop_start
            self.normalize_loop()
            self.playing = True

    @on(clear_cv, edge="rising")
    def on_clear(self, value, ctx):
        if self.debug:
            print("  CLEAR")
        self.loop.clear()
        self.playing = False
        self.recording = False
        return 0, self.outputs

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        if self.debug:
            print("  RESET")
        if self.reverse:
            self.current_index = len(self.loop)
        else:
            self.current_index = 0

    @on(speed_cv, edge="any")
    def on_speed_change(self, value, ctx):
        self.speed = max(0.01, value)
        if self.debug:
            print(f"  SPEED set to {self.speed}x")

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        if not self.recording:
            return
        if value == 0:
            return

        if len(self.loop) == 0:
            self.loop_start = self.current_time_ms()

        timestamp = self.current_time_ms() - self.loop_start

        if value in self.active_notes:
            channel = self.active_notes[value]
            if self.loop and abs(self.loop[-1][0] - timestamp) < 10:
                self.loop[-1][1].append((0, channel))
            else:
                self.last_assigned_channel = (self.last_assigned_channel + 1) % len(
                    self.outputs
                )
                self.loop.append((timestamp, [(0, channel)]))
            del self.active_notes[value]
            return

        if self.loop and abs(self.loop[-1][0] - timestamp) < 10:
            channel = self.loop[-1][1][0][1]
            self.loop[-1][1].append((value, channel))
        else:
            self.last_assigned_channel = (self.last_assigned_channel + 1) % len(
                self.outputs
            )
            channel = self.last_assigned_channel
            self.loop.append((timestamp, [(value, channel)]))

        self.active_notes[value] = channel
        if self.debug:
            print(f"  NOTE ON {value=} assigned to {channel=} at {timestamp}ms")

    def current_time_ms(self):
        import time

        return int(time.monotonic() * 1000)

    def main(self, ctx):
        if not self.playing or not self.loop:
            yield from self.sleep(10)
            return

        now = self.current_time_ms()

        if self.current_index == 0:
            self.play_start_time = now

        if self.reverse:
            rev_index = len(self.loop) - 1 - self.current_index
            if rev_index < 0:
                elapsed = now - self.play_start_time
                remaining = self.loop_duration - elapsed
                if remaining > 0:
                    yield from self.sleep(remaining)
                self.current_index = 0
                self.play_start_time = self.current_time_ms()
                return

            ts, group = self.loop[rev_index]
            # Horloge inverse : le moment "logique" de ce point, depuis la fin
            target_time = self.loop_duration - ts
            elapsed = now - self.play_start_time
            wait_time = (target_time - elapsed) / self.speed

            if wait_time > 0:
                yield from self.sleep(wait_time)

            for value, channel in group:
                yield value, [self.outputs[channel]]

            self.current_index += 1
        else:
            if self.current_index >= len(self.loop):
                elapsed = now - self.play_start_time
                remaining = (self.loop_duration - elapsed) / self.speed
                if self.debug:
                    print(f"  REMAINING {remaining}ms")
                if remaining > 0:
                    yield from self.sleep(remaining)
                self.current_index = 0
                self.play_start_time = self.current_time_ms()
                return

            ts, group = self.loop[self.current_index]
            wait_time = (ts - (now - self.play_start_time)) / self.speed

            if wait_time > 0:
                yield from self.sleep(wait_time)

            for value, channel in group:
                yield value, [self.outputs[channel]]

            self.current_index += 1
