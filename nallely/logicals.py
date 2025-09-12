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
    def change_comparator(self, value, ctx):
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


class WindowDetector(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(None, None))
    upperbound_cv = VirtualParameter(name="upperbound", range=(None, None))
    lowerbound_cv = VirtualParameter(name="lowerbound", range=(None, None))

    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @property
    def min_range(self):
        return 0

    @property
    def max_range(self):
        return 1

    def store_input(self, param, value):
        if param == "type" and isinstance(value, (int, float, Decimal)):
            value = self.type_cv.parameter.map2accepted_values(value)
        super().store_input(param, value)

    def __init__(
        self, input=0, upperbound=127, lowerbound=0, type="ondemand", **kwargs
    ):
        self.input = input
        self.upperbound = upperbound
        self.lowerbound = lowerbound
        self.type = type
        super().__init__(**kwargs)

    @staticmethod
    def _in_window(lower, value, upper):
        return int(lower <= value <= upper)

    @on(input_cv, edge="any")
    def input_variation(self, value, ctx):
        if self.type == "ondemand":
            return self._in_window(self.lowerbound, value, self.upperbound)

    @on(lowerbound_cv, edge="any")
    def lowerbound_variation(self, value, ctx):
        if self.type == "ondemand":
            return self._in_window(value, self.input, self.upperbound)

    @on(upperbound_cv, edge="any")
    def upperbound_variation(self, value, ctx):
        if self.type == "ondemand":
            return self._in_window(self.lowerbound, self.input, value)

    def main(self, ctx: ThreadContext):
        if self.type != "continuous":
            return
        return self._in_window(self.lowerbound, self.input, self.upperbound)


class Operator(VirtualDevice):
    a_cv = VirtualParameter(name="a", range=(None, None))
    b_cv = VirtualParameter(name="b", range=(None, None))
    operator_cv = VirtualParameter(
        name="operator",
        accepted_values=(
            "+",
            "-",
            "/",
            "*",
            "mod",
            "min",
            "max",
            "clamp",
            "pow",
        ),
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @property
    def min_range(self):
        return 0

    @property
    def max_range(self):
        return 127

    operator_map = {
        "+": lambda a, b: a + b,
        "-": lambda a, b: a - b,
        "*": lambda a, b: a * b,
        "/": lambda a, b: a / b,
        "mod": lambda a, b: a % b,
        "min": lambda a, b: a if a < b else b,
        "max": lambda a, b: a if a > b else b,
        "clamp": lambda a, b: max(min(a, b), 0),
        "pow": lambda a, b: a**b,
    }

    def store_input(self, param, value):
        if param == "type" and isinstance(value, (int, float, Decimal)):
            value = self.type_cv.parameter.map2accepted_values(value)
        elif param == "operator" and isinstance(value, (int, float, Decimal)):
            value = self.operator_cv.parameter.map2accepted_values(value)
        elif param == "b" and self.operator == "/" and value == 0:
            value = 0.0001  # avoid division by 0
        super().store_input(param, value)

    def __init__(self, a=0, b=0, operator="+", type="ondemand", **kwargs):
        self.a = a
        self.b = b
        self.operator = operator
        self.type = type
        super().__init__(**kwargs)

    @on(operator_cv, edge="any")
    def change_operator(self, value, ctx):
        if self.type == "ondemand":
            return self.operator_map[value](self.a, self.b)

    @on(a_cv, edge="any")
    def operation_a2b(self, value, ctx):
        if self.type == "ondemand":
            return self.operator_map[self.operator](value, self.b)

    @on(b_cv, edge="any")
    def operation_b2a(self, value, ctx):
        if self.type == "ondemand":
            return self.operator_map[self.operator](self.a, value)

    def main(self, ctx: ThreadContext):
        if self.type != "continuous":
            return
        return self.operator_map[self.operator](self.a, self.b)
