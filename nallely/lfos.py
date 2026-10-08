import math
import random
import time
from collections import deque
from decimal import Decimal
from typing import Literal

from .core import (
    ThreadContext,
    TimeBasedDevice,
    VirtualDevice,
    VirtualParameter,
    no_registration,
    on,
)


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
            "white_noise2",
            "half_wave_rectified_sine",
            "tent_map",
        ],
    )
    invert_polarity_cv = VirtualParameter("invert_polarity", default=0.0)
    min_value_cv = VirtualParameter("min_value", default=0)
    max_value_cv = VirtualParameter("max_value", default=127.0)
    pulse_width_cv = VirtualParameter("pulse_width", range=(0.0, 1.0), default=0.3)
    step_size_cv = VirtualParameter("step_size", range=(0.0, 5.0), default=0.2)

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
            curve = Decimal("2.0")
            eased_pos = cycle_pos**curve
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
            result = self.min_value + (self.max_value - self.min_value) * Decimal(
                t + 1
            ) ** (-1)
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
            import os

            return os.urandom(1)[0] >> 1
        elif waveform == "white_noise2":
            result = random.uniform(float(self.min_value), float(self.max_value))
        elif waveform == "half_wave_rectified_sine":
            result = self.min_value + (self.max_value - self.min_value) * max(
                0, Decimal(math.sin(2 * Decimal(math.pi) * t))
            )
        elif waveform == "tent_map":
            result = self.min_value + (self.max_value - self.min_value) * abs(
                2 * t % 2 - 1
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

    def __add__(self, lfo):
        if isinstance(lfo, int):
            return AddLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return AddLFO(lfo1=self, lfo2=lfo)

    def __sub__(self, lfo):
        if isinstance(lfo, int):
            return SubLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return SubLFO(lfo1=self, lfo2=lfo)

    def __mul__(self, lfo):
        if isinstance(lfo, int):
            return MulLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return MulLFO(lfo1=self, lfo2=lfo)

    def __truediv__(self, lfo):
        if isinstance(lfo, int):
            return DivLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return DivLFO(lfo1=self, lfo2=lfo)

    def __gt__(self, lfo):
        if isinstance(lfo, int):
            return MaxLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return MaxLFO(lfo1=self, lfo2=lfo)

    def __lt__(self, lfo):
        if isinstance(lfo, int):
            return MinLFO(lfo1=self, lfo2=ConstLFO(lfo))
        return MinLFO(lfo1=self, lfo2=lfo)


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
            sampling_rate=sampling_rate,
            speed=speed,
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
        super().__init__(waveform="const", min_value=value, max_value=value, speed=1)

    def generate_value(self, t, ticks):
        return self.min_value


from .codegen import gencode

SUBDIVISIONS = {
    "4/1": Decimal("0.25"),
    "2/1": Decimal("0.5"),
    "1/1": 1,
    "1/2": 2,
    "1/4": 4,
    "1/8": 8,
    "1/16": 16,
    "1/32": 32,
    "1/1t": Decimal(3) / Decimal(2),
    "1/2t": 2 * Decimal(3) / Decimal(2),
    "1/4t": 4 * Decimal(3) / Decimal(2),
    "1/8t": 8 * Decimal(3) / Decimal(2),
    "1/16t": 16 * Decimal(3) / Decimal(2),
    "1/32t": 32 * Decimal(3) / Decimal(2),
}


class LFOs(VirtualDevice):
    """LFO

    Simple Low Frequency Oscillator

    inputs:
    * waveform_cv [-, invert_sawtooth, random, smooth_random_exp, smooth_random_cosine, pulse, white_noise, half_wave_rectified_sine]: Waveform of the main output
    * speed_cv [0, 20] init=1 <any>: LFO speed (cycle per seconds)
    * sync_cv [0, 1] init=0 <rising>: sync LFO speed (per second tick)
    * pps_cv [50, 8192] init=259 <any>: number of points per seconds
    * subdiv_cv [4/1, 2/1, 1/1, 1/2, 1/4, 1/8, 1/16, 1/32, 1/1t, 1/2t, 1/4t, 1/8t, 1/16t, 1/32t] init=1/1: sub-division when synced
    * phase_cv [0, 1]: LFO phase
    * lower_bound_cv [-1, 1] init=-1 <any>: lower bound the LFO can reach
    * upper_bound_cv [-1, 1] init=1 <any>: upper bound the LFO can reach
    * pulse_width_cv [0.01, 1] init=0.253: with of the pulse waveform

    outputs:
    * output_cv [-1, 1]: main LFO output
    * sine_cv [-1, 1]: sine output
    * triangle_cv [-1, 1]: triangle output
    * square_cv [-1, 1]: square output
    * sawtooth_cv [-1, 1]: sawtooth output

    type: continuous
    category: oscillator
    """

    waveform_cv = VirtualParameter(
        name="waveform",
        accepted_values=[
            "-",
            "invert_sawtooth",
            "random",
            "smooth_random_exp",
            "smooth_random_cosine",
            "pulse",
            "white_noise",
            "half_wave_rectified_sine",
        ],
    )
    speed_cv = VirtualParameter(name="speed", range=(0.0, 20.0), default=Decimal("1.0"))
    sync_cv = VirtualParameter(name="sync", range=(0.0, 1.0), default=0.0)
    pps_cv = VirtualParameter(name="pps", range=(50.0, 8192.0), default=259.0)
    subdiv_cv = VirtualParameter(
        name="subdiv",
        accepted_values=[
            "4/1",
            "2/1",
            "1/1",
            "1/2",
            "1/4",
            "1/8",
            "1/16",
            "1/32",
            "1/1t",
            "1/2t",
            "1/4t",
            "1/8t",
            "1/16t",
            "1/32t",
        ],
        default="1/1",
    )
    phase_cv = VirtualParameter(name="phase", range=(0.0, 1.0))
    lower_bound_cv = VirtualParameter(
        name="lower_bound", range=(-1.0, 1.0), default=-1.0
    )
    upper_bound_cv = VirtualParameter(
        name="upper_bound", range=(-1.0, 1.0), default=1.0
    )
    pulse_width_cv = VirtualParameter(
        name="pulse_width", range=(0.01, 1.0), default=0.253
    )

    sawtooth_cv = VirtualParameter(name="sawtooth", range=(-1.0, 1.0))
    square_cv = VirtualParameter(name="square", range=(-1.0, 1.0))
    triangle_cv = VirtualParameter(name="triangle", range=(-1.0, 1.0))
    sine_cv = VirtualParameter(name="sine", range=(-1.0, 1.0))
    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        self.lower_bound = Decimal(self.lower_bound)
        self.upper_bound = Decimal(self.upper_bound)
        self.speed = Decimal(self.speed)
        self.pps = Decimal(self.pps)
        self.target_cycle_time = float(1 / self.pps)
        self.time_step = self.speed / self.pps
        self.phase = Decimal(self.phase)
        self.window_size = 4
        self.smoothing = Decimal("0.1")
        self.last_sync_time = time.perf_counter_ns()
        self.sync_intervals = deque(maxlen=self.window_size)
        self.randval = 0
        self._current_value = Decimal(self.lower_bound)
        self._previous_value = Decimal(self.lower_bound)

    def setup(self):
        return ThreadContext({"ticks": 0, "t": 0})

    @on(pps_cv, edge="any")
    def on_pps_any(self, value, ctx):
        self.target_cycle_time = float(1 / self.pps)

    @on(speed_cv, edge="any")
    def on_speed_any(self, value, ctx):
        value = Decimal(value)
        self.speed = value
        self.time_step = value / self.pps

    @on(lower_bound_cv, edge="any")
    def on_lower_bound_any(self, value, ctx):
        self.lower_bound = Decimal(value)

    @on(upper_bound_cv, edge="any")
    def on_upper_bound_any(self, value, ctx):
        self.upper_bound = Decimal(value)

    @on(sync_cv, edge="rising")
    def on_sync_rising(self, value, ctx, decimal1=Decimal("1.0")):
        now = time.perf_counter_ns()

        subdivision_factor = SUBDIVISIONS[self.subdiv]

        if self.last_sync_time is not None:
            dt = (now - self.last_sync_time) / 1e9  # seconds
            self.sync_intervals.append(dt)
            avg_interval = sum(self.sync_intervals) / len(self.sync_intervals)
            snap_frequency = (
                decimal1 / Decimal(avg_interval) * Decimal(subdivision_factor)
            )
            self.speed = snap_frequency

            # Estimated BPM for a quater note
            ctx.sync_bpm = float(60.0 / avg_interval)
        else:
            self.speed = Decimal(self.speed) * Decimal(subdivision_factor)
            ctx.sync_bpm = float(self.speed * 60)

        # Reset phase
        self.last_sync_time = now

    def generate_waveform(self, t, ticks, lb, ub, pps):
        waveform = self.waveform
        if waveform == "-":
            return 0
        if waveform == "invert_sawtooth":
            return lb + (ub - lb) * (1 - t)
        if waveform == "random":
            ticks_per_cycle = int(pps / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self.randval = random.uniform(float(lb), float(ub))
            return self.randval
        if waveform == "smooth_random_exp":
            ticks_per_cycle = int(pps / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._previous_value = self._current_value
                self._current_value = Decimal(random.uniform(float(lb), float(ub)))
            cycle_pos = Decimal(ticks % ticks_per_cycle) / Decimal(ticks_per_cycle)
            curve = Decimal("2.0")
            eased_pos = cycle_pos**curve
            return (
                self._previous_value
                + (self._current_value - self._previous_value) * eased_pos
            )
        if waveform == "smooth_random_cosine":
            ticks_per_cycle = int(pps / Decimal(max(0.0001, self.speed)))
            ticks_per_cycle = max(ticks_per_cycle, 1)
            if ticks % ticks_per_cycle == 0:
                self._previous_value = self._current_value
                self._current_value = Decimal(random.uniform(float(lb), float(ub)))
            cycle_pos = float(ticks % ticks_per_cycle) / float(ticks_per_cycle)
            mu2 = (1 - math.cos(math.pi * cycle_pos)) / 2
            return self._previous_value * Decimal(
                1 - mu2
            ) + self._current_value * Decimal(mu2)
        if waveform == "pulse":
            return lb + (ub - lb) * (1 if t < self.pulse_width else 0)
        if waveform == "white_noise":
            return random.uniform(float(self.lower_bound), float(self.upper_bound))
        if waveform == "half_wave_rectified_sine":
            return lb + (ub - lb) * max(0, Decimal(math.sin(2 * Decimal(math.pi) * t)))
        raise ValueError(f"Unsupported waveform type: {waveform}")

    def generate_sine(self, t, lb, ub):
        return lb + (ub - lb) * Decimal(math.sin(2 * Decimal(math.pi) * t) + 1) / 2

    def generate_triangle(self, t, lb, ub, decimal05=Decimal("0.5")):
        return ub - (lb + (ub - lb) * abs(2 * (t - decimal05))) + lb

    def generate_square(self, t, lb, ub, decimal05=Decimal("0.5")):
        return lb + (ub - lb) * (1 if t < decimal05 else 0)

    def generate_sawtooth(self, t, lb, ub):
        return lb + (ub - lb) * t

    def main(self, ctx):
        # Compute t using measured time
        elapsed = Decimal(time.perf_counter_ns() - self.last_sync_time) / 1000000000
        t = (Decimal(self.speed) * elapsed + Decimal(self.phase)) % 1
        lb = Decimal(self.lower_bound)
        ub = Decimal(self.upper_bound)
        pps = Decimal(self.pps)
        yield self.generate_waveform(t, ctx.ticks, lb, ub, pps), [self.output_cv]
        yield self.generate_sine(t, lb, ub), [self.sine_cv]
        yield self.generate_triangle(t, lb, ub), [self.triangle_cv]
        yield self.generate_square(t, lb, ub), [self.square_cv]
        yield self.generate_sawtooth(t, lb, ub), [self.sawtooth_cv]
        ctx.ticks += 1
        ctx.t = t
