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
