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
