from decimal import Decimal

from .core import VirtualDevice, VirtualParameter, on
from .core.world import ThreadContext


class Comparator(VirtualDevice):
    a_cv = VirtualParameter(name="a", range=(None, None))
    b_cv = VirtualParameter(name="b", range=(None, None))
    comparator_cv = VirtualParameter(
        name="comparator", accepted_values=("=", ">", ">=", "<", "<=", "<>")
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @property
    def min_range(self):
        return 0

    @property
    def max_range(self):
        return 1

    comparators_map = {
        "=": lambda a, b: 1 if a == b else 0,
        ">": lambda a, b: 1 if a > b else 0,
        ">=": lambda a, b: 1 if a >= b else 0,
        "<": lambda a, b: 1 if a < b else 0,
        "<=": lambda a, b: 1 if a <= b else 0,
        "<>": lambda a, b: 1 if a != b else 0,
    }

    def store_input(self, param, value):
        if param == "type" and isinstance(value, (int, float, Decimal)):
            value = self.type_cv.parameter.map2accepted_values(value)
        elif param == "comparator" and isinstance(value, (int, float, Decimal)):
            value = self.comparator_cv.parameter.map2accepted_values(value)
        super().store_input(param, value)

    def __init__(self, a=0, b=0, comparator="=", type="ondemand", **kwargs):
        self.a = a
        self.b = b
        self.comparator = comparator
        self.type = type
        super().__init__(**kwargs)

    @on(comparator_cv, edge="any")
    def changeComparison(self, value, ctx):
        if self.type == "ondemand":
            return self.comparators_map[value](self.a, self.b)

    @on(a_cv, edge="any")
    def compare_a2b(self, value, ctx):
        if self.type == "ondemand":
            return self.comparators_map[self.comparator](value, self.b)

    @on(b_cv, edge="any")
    def compare_b2a(self, value, ctx):
        if self.type == "ondemand":
            return self.comparators_map[self.comparator](self.a, value)

    def main(self, ctx: ThreadContext):
        if self.type != "continuous":
            return
        return self.comparators_map[self.comparator](self.a, self.b)
