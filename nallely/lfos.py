import math
import random
from decimal import Decimal
from typing import Any, Literal

from .core import TimeBasedDevice, VirtualParameter, no_registration


class LFO(TimeBasedDevice):
    waveform_cv = VirtualParameter(
        "waveform",
        accepted_values=[
            "sine",
            "invert_sine",
            "triangle",
            "square",
            "sawtooth",
            "invert_sawtooth",
            "random",
            "smooth_random",
            "smooth_random_exp",
            "smooth_random_cosine",
            "pulse",
            "exponential",
            "logarithmic",
            "ramp_down",
            "step",
            "white_noise",
            "half_wave_rectified_sine",
            "tent_map",
        ],
    )
    invert_polarity_cv = VirtualParameter("invert_polarity")
    min_value_cv = VirtualParameter("min_value")
    max_value_cv = VirtualParameter("max_value")
    pulse_width_cv = VirtualParameter("pulse_width", range=(0.0, 1.0))
    step_size_cv = VirtualParameter("step_size", range=(0.0, 5.0))

    def __init__(
        self,
        waveform="sine",
        min_value: int | float | Decimal = 0,
        max_value: int | float | Decimal = 127.0,
        speed: int | float | Decimal = 0.01,
        sampling_rate: int | Literal["auto"] = "auto",
        **kwargs,
    ):
        self.as_int = isinstance(min_value, int) and isinstance(max_value, int)
        self.waveform = waveform
        self._min_value: Decimal | int = (
            Decimal(min_value) if isinstance(min_value, float) else min_value
        )
        self._max_value: Decimal | int = (
            Decimal(max_value) if isinstance(max_value, float) else max_value
        )
        self.pulse_width = 0.3
        self.step_size = 0.2
        self._random_value = 0
        self._previous_value = 0
        self._current_value = 0
        self.invert_polarity = 0.0
        super().__init__(speed=speed, sampling_rate=sampling_rate, **kwargs)

    @property
    def min_value(self):
        return self._min_value

    @min_value.setter
    def min_value(self, value):
        self._min_value = Decimal(value) if isinstance(value, (float, str)) else value
        self.as_int = isinstance(self._min_value, int) and isinstance(
            self._max_value, int
        )

    @property
    def max_value(self):
        return self._max_value

    @max_value.setter
    def max_value(self, value):
        self._max_value = Decimal(value) if isinstance(value, (float, str)) else value
        self.as_int = isinstance(self._min_value, int) and isinstance(
            self._max_value, int
        )

    def generate_waveform(self, t, ticks):
        waveform = self.waveform
        if waveform == "sine":
            result = (
                self.min_value
                + (self.max_value - self.min_value)
                * Decimal(math.sin(2 * Decimal(math.pi) * t) + 1)
                / 2
            )
        elif waveform == "invert_sine":
            result = (
                self.min_value
                + (self.max_value - self.min_value)
                * Decimal(1 - math.sin(2 * Decimal(math.pi) * t))
                / 2
            )
        elif waveform == "triangle":
            result = (
                self.max_value
                - (
                    self.min_value
                    + (self.max_value - self.min_value) * abs(2 * (t - Decimal(0.5)))
                )
                + self.min_value
            )
        elif waveform == "square":
            result = self.min_value + (self.max_value - self.min_value) * (
                1 if t < Decimal(0.5) else 0
            )
        elif waveform == "sawtooth":
            result = self.min_value + (self.max_value - self.min_value) * t
        elif waveform == "invert_sawtooth":
            result = self.min_value + (self.max_value - self.min_value) * (1 - t)
        elif waveform == "random":
            ticks_per_cycle = int(self.sampling_rate / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._random_value = random.uniform(
                    float(self.min_value), float(self.max_value)
                )
            result = self._random_value
        elif waveform == "smooth_random":
            ticks_per_cycle = int(self.sampling_rate / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._previous_value = getattr(
                    self, "_current_value", Decimal(self.min_value)
                )
                self._current_value = Decimal(
                    random.uniform(float(self.min_value), float(self.max_value))
                )

            cycle_pos = Decimal(ticks % ticks_per_cycle) / Decimal(ticks_per_cycle)
            result = (
                self._previous_value
                + (self._current_value - self._previous_value) * cycle_pos
            )
        elif waveform == "smooth_random_exp":
            ticks_per_cycle = int(self.sampling_rate / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._previous_value = getattr(
                    self, "_current_value", Decimal(self.min_value)
                )
                self._current_value = Decimal(
                    random.uniform(float(self.min_value), float(self.max_value))
                )

            cycle_pos = Decimal(ticks % ticks_per_cycle) / Decimal(ticks_per_cycle)
            curve = Decimal("2.0")  # TODO pass as parameter

            eased_pos = cycle_pos**curve  # Ease-in
            # eased_pos = 1 - (1 - cycle_pos) ** curve  # Uncomment for ease-out

            result = (
                self._previous_value
                + (self._current_value - self._previous_value) * eased_pos
            )
        elif waveform == "smooth_random_cosine":
            ticks_per_cycle = int(self.sampling_rate / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._previous_value = getattr(
                    self, "_current_value", Decimal(self.min_value)
                )
                self._current_value = Decimal(
                    random.uniform(float(self.min_value), float(self.max_value))
                )

            cycle_pos = float(ticks % ticks_per_cycle) / float(ticks_per_cycle)
            mu2 = (1 - math.cos(math.pi * cycle_pos)) / 2

            result = self._previous_value * Decimal(
                1 - mu2
            ) + self._current_value * Decimal(mu2)
        elif waveform == "pulse":
            result = self.min_value + (self.max_value - self.min_value) * (
                1 if t < self.pulse_width else 0
            )
        elif waveform == "exponential":
            result = self.min_value + (self.max_value - self.min_value) * (
                Decimal(2) ** t - 1
            )
        elif waveform == "logarithmic":
            result = self.min_value + (self.max_value - self.min_value) * (
                Decimal(t + 1) ** -1
            )
        elif waveform == "ramp_down":
            result = self.max_value - (self.max_value - self.min_value) * t
        elif waveform == "step":
            step_size = Decimal(self.step_size)
            if step_size == 0:
                step_size = Decimal(0.001)
            result = (
                self.min_value
                + (self.max_value - self.min_value)
                * (Decimal(t) // step_size)
                * step_size
            )
        elif waveform == "white_noise":
            result = random.uniform(float(self.min_value), float(self.max_value))
        elif waveform == "half_wave_rectified_sine":
            result = self.min_value + (self.max_value - self.min_value) * max(
                0, Decimal(math.sin(2 * Decimal(math.pi) * t))
            )
        elif waveform == "tent_map":
            result = self.min_value + (self.max_value - self.min_value) * abs(
                (2 * t) % 2 - 1
            )
        else:
            raise ValueError(f"Unsupported waveform type: {waveform}")

        if self.invert_polarity:
            result = self.max_value + self.min_value - Decimal(result)
        return int(result) if self.as_int else result

    @property
    def max_range(self):
        return float(self.max_value)

    @property
    def min_range(self):
        return float(self.min_value)

    generate_value = generate_waveform

    # def store_input(self, param, value):
    #     if param == "waveform" and isinstance(value, (int, float, Decimal)):
    #         value = self.waveform_cv.parameter.map2accepted_values(value)
    #     super().store_input(param, value)

    def __add__(self, lfo):
        if isinstance(lfo, int):
            return AddLFO(self, ConstLFO(lfo))
        return AddLFO(self, lfo)

    def __sub__(self, lfo):
        if isinstance(lfo, int):
            return SubLFO(self, ConstLFO(lfo))
        return SubLFO(self, lfo)

    def __mul__(self, lfo):
        if isinstance(lfo, int):
            return MulLFO(self, ConstLFO(lfo))
        return MulLFO(self, lfo)

    def __truediv__(self, lfo):
        if isinstance(lfo, int):
            return DivLFO(self, ConstLFO(lfo))
        return DivLFO(self, lfo)

    def __gt__(self, lfo):
        if isinstance(lfo, int):
            return MaxLFO(self, ConstLFO(lfo))
        return MaxLFO(self, lfo)

    def __lt__(self, lfo):
        if isinstance(lfo, int):
            return MinLFO(self, ConstLFO(lfo))
        return MinLFO(self, lfo)


@no_registration
class CombinedLFO(LFO):
    def __init__(self, lfo1: LFO, lfo2: LFO):
        self.lfo1 = lfo1
        self.lfo2 = lfo2

        min_value = min(lfo1.min_value, lfo2.min_value)
        max_value = max(lfo1.max_value, lfo2.max_value)
        speed = max(lfo1.speed, lfo2.speed)
        sampling_rate = int(max(lfo1.sampling_rate, lfo2.sampling_rate))

        super().__init__(
            waveform="combined",
            min_value=min_value,
            max_value=max_value,
            speed=speed,
            sampling_rate=sampling_rate,
        )

    def normalize(self, value):
        min_val = self.min_value
        max_val = self.max_value
        return max(min(value, max_val), min_val)


@no_registration
class MaxLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        return max(
            self.lfo1.generate_value(t, ticks), self.lfo2.generate_value(t, ticks)
        )


@no_registration
class MinLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        return min(
            self.lfo1.generate_value(t, ticks), self.lfo2.generate_value(t, ticks)
        )


@no_registration
class AddLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        return self.normalize(
            self.lfo1.generate_value(t, ticks) + self.lfo2.generate_value(t, ticks)
        )


@no_registration
class SubLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        return self.normalize(
            self.lfo1.generate_value(t, ticks) - self.lfo2.generate_value(t, ticks)
        )


@no_registration
class MulLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        return self.normalize(
            self.lfo1.generate_value(t, ticks) * self.lfo2.generate_value(t, ticks)
        )


@no_registration
class DivLFO(CombinedLFO):
    def generate_value(self, t, ticks):
        value2 = self.lfo2.generate_value(t, ticks)
        if value2 == 0:
            return self.min_value

        result = self.lfo1.generate_value(t, ticks) // value2
        return self.normalize(result)


@no_registration
class ConstLFO(LFO):
    def __init__(self, value):
        super().__init__(
            waveform="const",
            min_value=value,
            max_value=value,
            speed=1,
        )

    def generate_value(self, t, ticks):
        return self.min_value


@no_registration
class Cycler(LFO):
    def __init__(self, values: list[Any], speed=10, waveform="triangle", **kwargs):
        self.values = values
        super().__init__(
            waveform=waveform, speed=speed, min_value=0, max_value=len(values), **kwargs
        )

    def generate_value(self, t, ticks) -> Any:
        idx = super().generate_value(t, ticks)
        return self.values[idx]
