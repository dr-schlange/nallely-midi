from decimal import Decimal
from typing import Any

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
        return None

    @property
    def max_range(self):
        return None

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
        if param == "b" and self.operator == "/" and value == 0:
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


class Logical(VirtualDevice):
    a_cv = VirtualParameter(name="a", range=(0, 1), conversion_policy=">0")
    b_cv = VirtualParameter(name="b", range=(0, 1), conversion_policy=">0")
    operator_cv = VirtualParameter(
        name="operator",
        accepted_values=("and", "or", "xor", "nand", "nor", "xnor", "not"),
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @property
    def min_range(self):
        return 0

    @property
    def max_range(self):
        return 1

    operator_map = {
        "and": lambda a, b: int(bool(a) and bool(b)),
        "or": lambda a, b: int(bool(a) or bool(b)),
        "xor": lambda a, b: int(bool(a) ^ bool(b)),
        "nand": lambda a, b: int(not (bool(a) and bool(b))),
        "nor": lambda a, b: int(not (bool(a) or bool(b))),
        "xnor": lambda a, b: int(not (bool(a) ^ bool(b))),
        "not": lambda a, _: int(not bool(a)),
    }

    def __init__(self, a=0, b=0, operator="and", type="ondemand", **kwargs):
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
        if self.type == "ondemand" and self.operator != "not":
            return self.operator_map[self.operator](self.a, value)

    def main(self, ctx: ThreadContext):
        if self.type != "continuous":
            return
        return self.operator_map[self.operator](self.a, self.b)


class Bitwise(VirtualDevice):
    a_cv = VirtualParameter(name="a", range=(None, None), conversion_policy="round")
    b_cv = VirtualParameter(name="b", range=(None, None), conversion_policy="round")
    operator_cv = VirtualParameter(
        name="operator",
        accepted_values=("and", "or", "xor", "not", ">>", "<<"),
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @property
    def min_range(self):
        return None

    @property
    def max_range(self):
        return None

    operator_map = {
        "and": lambda a, b: a & b,
        "or": lambda a, b: a | b,
        "xor": lambda a, b: a ^ b,
        "not": lambda a, _: ~a,
        ">>": lambda a, b: a >> b,
        "<<": lambda a, b: a << b,
    }

    def __init__(self, a=0, b=0, operator="and", type="ondemand", **kwargs):
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
        if self.type == "ondemand" and self.operator != "not":
            return self.operator_map[self.operator](self.a, value)

    def main(self, ctx: ThreadContext):
        if self.type != "continuous":
            return
        return self.operator_map[self.operator](self.a, self.b)


class Latch(VirtualDevice):
    set_cv = VirtualParameter(name="set", range=(0, 1), conversion_policy="round")
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy="round")

    def __post_init__(self, **kwargs):
        return {"target_cycle_time": 0.01}

    @on(set_cv, edge="rising")
    def set_rising(self, value, ctx):
        return 1

    @on(reset_cv, edge="rising")
    def reset_state(self, value, ctx):
        return 0

    def main(self, ctx):
        return self.output


class FlipFlop(VirtualDevice):
    data_toggle_cv = VirtualParameter(
        name="data_toggle", range=(0, 1), conversion_policy="round"
    )
    clock_cv = VirtualParameter(name="clock", range=(0, 1), conversion_policy=">0")
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy="round")
    mode_cv = VirtualParameter(name="mode", accepted_values=("data", "toggle"))

    def __post_init__(self, **kwargs):
        return {"target_cycle_time": 0.01}

    @on(clock_cv, edge="rising")
    def rising_clock(self, value, ctx):
        if self.mode == "data":  # type: ignore
            return self.data_toggle  # type: ignore
        elif self.data_toggle > 0:  # type: ignore
            return 1 - self.output  # type: ignore

    @on(reset_cv, edge="rising")
    def reset_out(self, value, ctx):
        return 0

    def main(self, ctx):
        return self.output
