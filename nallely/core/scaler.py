import math
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .parameter_instances import (
        Int,
        PadOrKey,
        PadsOrKeysInstance,
        ParameterInstance,
        PitchwheelInstance,
    )
    from .virtual_device import VirtualDevice


@dataclass
class Scaler:
    data: "Int | VirtualDevice | PadOrKey | ParameterInstance | PadsOrKeysInstance | PitchwheelInstance"
    # device: Any
    to_min: int | float | None
    to_max: int | float | None
    method: str = "lin"
    as_int: bool | None = False
    # from_min: int | float | None = None
    # from_max: int | float | None = None
    auto: bool = False

    def __post_init__(self):
        if self.to_min == 0 and self.method == "log":
            self.to_min = 0.001
        if self.as_int is None:
            self.as_int = (
                self.as_int
                or isinstance(self.to_min, int)
                and isinstance(self.to_max, int)
            )

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def convert_lin(self, value, from_min, from_max):
        if from_min is not None and value < from_min:
            value = from_min
        elif from_max is not None and value > from_max:
            value = from_max
        match from_min, from_max, self.to_min, self.to_max:
            case _, _, None, None:
                return value
            case None, from_max, to_min, None:
                offset = to_min
                v = value + offset
                return min(v, from_max + offset) if from_max is not None else v
            case None, None, to_min, to_max:
                return value
            case from_min, _, to_min, None:
                diff = abs(from_min - to_min)
                return value - diff if value > to_min else to_min
            case from_min, None, None, to_max:
                return value + from_min if value < to_max else to_max
            case from_min, None, to_min, to_max:
                return value if value < to_max else to_max
            case None, from_max, None, to_max:
                diff = abs(to_max - from_max)
                return value + diff if value + diff < to_max else to_max
            case from_min, from_max, None, to_max:
                return value - abs(to_max - from_min)
            case None, from_max, to_min, to_max:
                return (
                    to_max - (from_max - value)
                    if abs(value + to_min) < to_max
                    else to_max
                )
            case from_min, from_max, to_min, to_max:
                from_div = (from_max - from_min) if from_max != from_min else 1
                scaled_value = (value - from_min) / from_div
                return to_min + scaled_value * (to_max - to_min)

            case _:
                print(
                    f"No match: {self.from_min}, {self.from_max}, {self.to_min}, {self.to_max}"
                )
                return float(value)

    def convert_log(self, value, from_max) -> int | float:
        if self.to_min is None or self.to_max is None:
            print("Logarithmic scaling requires both min and max to be defined.")
            return value

        if value < 0:
            print(f"Logarithmic scaling is undefined for non-positive values {value}.")
            return value

        if self.to_min == 0:
            self.to_min = 0.001

        log_min = math.log(self.to_min)
        log_max = math.log(self.to_max)

        return math.exp(log_min + (value / from_max) * (log_max - log_min))

    def convert(self, value):
        from .parameter_instances import Int
        from .virtual_device import VirtualDevice

        from_min, from_max = (
            self.data.range
            if isinstance(self.data, VirtualDevice)
            else self.data.parameter.range
        )
        if isinstance(value, Decimal):
            value = float(value)
        if self.method == "lin":
            res = self.convert_lin(value, from_min=from_min, from_max=from_max)
        elif self.method == "log":
            res = self.convert_log(value, from_max=from_max)
        else:
            raise Exception("Unknown conversion method")
        res = int(res) if self.as_int else res
        if isinstance(value, Int):
            value.update(res)
            return value
        return res

    def __call__(self, value, *args, **kwargs):
        return self.convert(value)
