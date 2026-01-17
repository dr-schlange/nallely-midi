import math
import random
from collections import deque

from nallely import VirtualDevice, VirtualParameter, on
from nallely.core.world import ThreadContext

MAX_ABS = 1e6  # valeur max avant clamp


def safe_val(v):
    if math.isfinite(v):
        return max(-MAX_ABS, min(MAX_ABS, v))
    return 0.0  # si NaN ou inf


class HenonProjector(VirtualDevice):
    a_cv = VirtualParameter("a")
    b_cv = VirtualParameter("b")
    freq_cv = VirtualParameter("freq", range=(0.01, 1000))

    y_cv = VirtualParameter("y")
    x_cv = VirtualParameter("x")

    @property
    def range(self):
        return (None, None)

    def __init__(self, a=1.4, b=0.3, freq=1, **kwargs):
        self.a = a
        self.b = b
        self.x = 0.1
        self.y = 0.1
        self.freq = freq
        super().__init__(disable_output=True, **kwargs)

    def next_value(self):
        new_x = 1 - self.a * self.x * self.x + self.y
        new_y = self.b * self.x

        if (
            math.isinf(new_x)
            or math.isnan(new_x)
            or math.isinf(new_y)
            or math.isnan(new_y)
        ):
            print("Divergence detected, reset to initial values")
            self.x, self.y = 0.1, 0.1
            return self.x, self.y

        self.x, self.y = new_x, new_y
        return self.x, self.y

    def main(self, ctx: ThreadContext):
        x, y = self.next_value()
        yield x, [self.output_cv, self.x_cv]
        yield y, [self.y_cv]
        yield from self.sleep((1 / self.freq) * 1000)


class LorenzProjector(VirtualDevice):
    sigma_cv = VirtualParameter("sigma", range=(5, 20))
    rho_cv = VirtualParameter("rho", range=(10, 50))
    beta_cv = VirtualParameter("b", range=(1, 5))
    freq_cv = VirtualParameter("freq", range=(0.01, 5000))

    z_cv = VirtualParameter("z")
    y_cv = VirtualParameter("y")
    x_cv = VirtualParameter("x")

    znorm_cv = VirtualParameter("znorm", range=(0, 127))
    ynorm_cv = VirtualParameter("ynorm", range=(0, 127))
    xnorm_cv = VirtualParameter("xnorm", range=(0, 127))

    @property
    def range(self):
        return (None, None)

    def __init__(
        self,
        sigma=10.0,
        rho=28.0,
        beta=8 / 3,
        x0=0.1,
        y0=0.0,
        z0=0.0,
        dt=0.01,
        freq=1,
        **kwargs,
    ):
        self.sigma = sigma
        self.rho = rho
        self.beta = beta
        self.x = x0
        self.y = y0
        self.z = z0
        self.xnorm = x0
        self.ynorm = y0
        self.znorm = z0
        self.dt = dt
        self.freq = freq
        self.history_x = deque(maxlen=200)
        self.history_y = deque(maxlen=200)
        self.history_z = deque(maxlen=200)
        super().__init__(disable_output=True, **kwargs)

    def normalize(self, v, history, target_min=0, target_max=127):
        history.append(v)
        min_v = min(history)
        max_v = max(history)
        if max_v == min_v:
            return 0.0
        return target_min + (v - min_v) * (target_max - target_min) / (max_v - min_v)

    def next_value(self):
        dx = self.sigma * (self.y - self.x)
        dy = self.x * (self.rho - self.z) - self.y
        dz = self.x * self.y - self.beta * self.z
        self.x += dx * self.dt
        self.y += dy * self.dt
        self.z += dz * self.dt

        return self.x, self.y, self.z

    def main(self, ctx: ThreadContext):
        x, y, z = self.next_value()
        yield x, [self.output_cv, self.x_cv]
        yield y, [self.y_cv]
        yield z, [self.z_cv]
        yield self.normalize(x, self.history_x), [self.xnorm_cv]
        yield self.normalize(y, self.history_y), [self.ynorm_cv]
        yield self.normalize(z, self.history_z), [self.znorm_cv]
        yield from self.sleep((1 / self.freq) * 1000)


class BarnsleyProjector(VirtualDevice):
    freq_cv = VirtualParameter("freq", range=(0.01, 5000))

    y_cv = VirtualParameter("y")
    x_cv = VirtualParameter("x")
    ynorm_cv = VirtualParameter("ynorm", range=(0, 127))
    xnorm_cv = VirtualParameter("xnorm", range=(0, 127))

    @property
    def range(self):
        return (None, None)

    def __init__(self, freq=50, **kwargs):
        self.x = 0.0
        self.y = 0.0
        self.freq = freq
        self.history_x = deque(maxlen=200)
        self.history_y = deque(maxlen=200)

        # Barnsley Coefficients
        self.transforms = [
            # f1
            (0.0, 0.0, 0.0, 0.16, 0.0, 0.0, 0.01),
            # f2
            (0.85, 0.04, -0.04, 0.85, 0.0, 1.6, 0.85),
            # f3
            (0.2, -0.26, 0.23, 0.22, 0.0, 1.6, 0.07),
            # f4
            (-0.15, 0.28, 0.26, 0.24, 0.0, 0.44, 0.07),
        ]

        super().__init__(disable_output=True, **kwargs)

    def normalize(self, v, history, target_min=0, target_max=127):
        history.append(v)
        min_v = min(history)
        max_v = max(history)
        if max_v == min_v:
            return 0.0
        return target_min + (v - min_v) * (target_max - target_min) / (max_v - min_v)

    def next_value(self):
        r = random.random()
        cumulative = 0
        for a, b, c, d, e, f, p in self.transforms:
            cumulative += p
            if r <= cumulative:
                new_x = a * self.x + b * self.y + e
                new_y = c * self.x + d * self.y + f
                self.x, self.y = new_x, new_y
                break
        return self.x, self.y

    def main(self, ctx: ThreadContext):
        x, y = self.next_value()
        yield x, [self.output_cv, self.x_cv]
        yield y, [self.y_cv]
        yield self.normalize(x, self.history_x), [self.xnorm_cv]
        yield self.normalize(y, self.history_y), [self.ynorm_cv]
        yield from self.sleep((1 / self.freq) * 1000)


class RosslerProjector(VirtualDevice):
    freq_cv = VirtualParameter("freq", range=(0.01, 5000))

    c_cv = VirtualParameter("c", range=(3, 10))
    b_cv = VirtualParameter("b", range=(0.1, 0.5))
    a_cv = VirtualParameter("a", range=(0.1, 0.5))
    z_cv = VirtualParameter("z", range=(0, 30))
    y_cv = VirtualParameter("y", range=(-15, 15))
    x_cv = VirtualParameter("x", range=(-15, 15))

    znorm_cv = VirtualParameter("znorm", range=(0, 127))
    ynorm_cv = VirtualParameter("ynorm", range=(0, 127))
    xnorm_cv = VirtualParameter("xnorm", range=(0, 127))

    @property
    def range(self):
        return (None, None)

    def __init__(
        self,
        a=0.2,
        b=0.2,
        c=5.7,
        x0=0.1,
        y0=0.0,
        z0=0.0,
        dt=0.01,
        freq=1,
        **kwargs,
    ):
        self.a = a
        self.b = b
        self.c = c
        self.x = x0
        self.y = y0
        self.z = z0
        self.xnorm = x0
        self.ynorm = y0
        self.znorm = z0
        self.dt = dt
        self.freq = freq
        self.history_x = deque(maxlen=200)
        self.history_y = deque(maxlen=200)
        self.history_z = deque(maxlen=200)
        super().__init__(disable_output=True, **kwargs)

    def normalize(self, v, history, target_min=0, target_max=127, window_size=50):
        history.append(v)
        recent_history = list(history)[-window_size:]
        if not recent_history:
            return (target_min + target_max) / 2

        sorted_hist = sorted(recent_history)
        n = len(sorted_hist)

        idx_low = max(0, int(n * 0.05))
        idx_high = min(n - 1, int(n * 0.95))

        lower = sorted_hist[idx_low]
        upper = sorted_hist[idx_high]

        filtered = [x for x in sorted_hist if lower <= x <= upper]
        if not filtered:
            filtered = sorted_hist

        min_v = min(filtered)
        max_v = max(filtered)

        if max_v == min_v:
            return (target_min + target_max) / 2

        return target_min + (v - min_v) * (target_max - target_min) / (max_v - min_v)

    def next_value(self):
        dx = -self.y - self.z
        dy = self.x + self.a * self.y
        dz = self.b + self.z * (self.x - self.c)
        self.x += dx * self.dt
        self.y += dy * self.dt
        self.z += dz * self.dt

        return self.x, self.y, self.z

    def main(self, ctx: ThreadContext):
        x, y, z = self.next_value()
        yield x, [self.output_cv, self.x_cv]
        yield y, [self.y_cv]
        yield z, [self.z_cv]
        yield self.normalize(x, self.history_x), [self.xnorm_cv]
        yield self.normalize(y, self.history_y), [self.ynorm_cv]
        yield self.normalize(z, self.history_z), [self.znorm_cv]
        yield from self.sleep((1 / self.freq) * 1000)


class Morton(VirtualDevice):
    x_cv = VirtualParameter("x", range=(0, 127))
    y_cv = VirtualParameter("y", range=(0, 127))

    @property
    def range(self):
        return (0, 127)

    def __init__(self, x=0.0, y=0.0, **kwargs):
        self.x = x
        self.y = y
        super().__init__(**kwargs)

    def interleave16(self, x: float, y: float) -> int:
        """Entrelace les bits de x et y (0..65535) en Morton code 32 bits."""
        z = 0
        for i in range(16):
            z |= ((int(x) >> i) & 1) << (2 * i)
            z |= ((int(y) >> i) & 1) << (2 * i + 1)
        return z

    @on(x_cv, edge="any")
    def on_x_change(self, value, ctx: ThreadContext):
        return self.interleave16(value, self.y)

    @on(y_cv, edge="any")
    def on_y_change(self, value, ctx: ThreadContext):
        return self.interleave16(self.x, value)


class BuddhabrotProjector(VirtualDevice):
    freq_cv = VirtualParameter("freq", range=(0.1, 1000))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    max_iter_cv = VirtualParameter("max_iter", range=(10, 5000))

    real_min_cv = VirtualParameter("real_min", range=(-3, 3))
    real_max_cv = VirtualParameter("real_max", range=(-3, 3))
    imag_min_cv = VirtualParameter("imag_min", range=(-3, 3))
    imag_max_cv = VirtualParameter("imag_max", range=(-3, 3))

    # outputs
    y_cv = VirtualParameter("y")
    x_cv = VirtualParameter("x")
    ynorm_cv = VirtualParameter("ynorm", range=(-2, 2))
    xnorm_cv = VirtualParameter("xnorm", range=(-2, 2))

    def __init__(
        self,
        freq=10,
        max_iter=5000,
        real_min=-2,
        real_max=1,
        imag_min=-1.5,
        imag_max=1.5,
        history_len=200,
        **kwargs,
    ):
        self.freq = freq
        self.max_iter = max_iter

        self.real_min = real_min
        self.real_max = real_max
        self.imag_min = imag_min
        self.imag_max = imag_max

        self.history_x = deque(maxlen=history_len)
        self.history_y = deque(maxlen=history_len)

        self.reset = 0

        self.traj = []
        self.idx = 0

        super().__init__(**kwargs)

    def normalize_to_range(self, v, history, target_min=-2, target_max=2):
        history.append(v)
        min_v = min(history)
        max_v = max(history)
        if max_v == min_v:
            return target_min
        return target_min + (v - min_v) * (target_max - target_min) / (max_v - min_v)

    def sample_c(self):
        return complex(
            random.uniform(self.real_min, self.real_max),
            random.uniform(self.imag_min, self.imag_max),
        )

    def trace_trajectory(self, c, max_iter):
        z = 0 + 0j
        traj = []
        for _ in range(max_iter):
            z = z * z + c
            traj.append((z.real, z.imag))
            if abs(z) > 2:
                return traj
        return None

    @property
    def range(self):
        return (-2, 2)

    @on(reset_cv, edge="rising")
    def on_reset_history_change(self, value, ctx: ThreadContext):
        self.history_x.clear()
        self.history_y.clear()

    def main(self, ctx: ThreadContext):
        if not self.traj or self.idx >= len(self.traj):
            c = self.sample_c()
            self.traj = self.trace_trajectory(c, self.max_iter)
            self.idx = 0

        if self.traj:
            x, y = self.traj[self.idx]
            self.idx += 1

            yield x, [self.x_cv]
            yield y, [self.y_cv]

            xnorm = self.normalize_to_range(x, self.history_x)
            ynorm = self.normalize_to_range(y, self.history_y)
            yield xnorm, [self.xnorm_cv]
            yield ynorm, [self.ynorm_cv]

        yield from self.sleep((1 / self.freq) * 1000)


class MandelbrotProjector(VirtualDevice):
    freq_cv = VirtualParameter("freq", range=(0.1, 1000))
    max_iter_cv = VirtualParameter("max_iter", range=(10, 2000))

    real_min_cv = VirtualParameter("real_min", range=(-3, 3))
    real_max_cv = VirtualParameter("real_max", range=(-3, 3))
    imag_min_cv = VirtualParameter("imag_min", range=(-3, 3))
    imag_max_cv = VirtualParameter("imag_max", range=(-3, 3))

    z_cv = VirtualParameter("z")
    y_cv = VirtualParameter("y")
    x_cv = VirtualParameter("x")

    def __init__(
        self,
        freq=20,
        max_iter=1000,
        real_min=-2,
        real_max=1,
        imag_min=-1.5,
        imag_max=1.5,
        **kwargs,
    ):
        self.freq = freq
        self.max_iter = max_iter

        self.real_min = real_min
        self.real_max = real_max
        self.imag_min = imag_min
        self.imag_max = imag_max

        self.current_point = None
        self.iteration = 0

        super().__init__(disable_output=True, **kwargs)

    def sample_c(self):
        return complex(
            random.uniform(self.real_min, self.real_max),
            random.uniform(self.imag_min, self.imag_max),
        )

    def mandelbrot_iterate(self, c, max_iter):
        z = 0 + 0j
        for i in range(max_iter):
            z = z * z + c
            if abs(z) > 2:
                return i, z.real, z.imag
        return max_iter, z.real, z.imag

    @property
    def range(self):
        return (-2, 2)

    def main(self, ctx: ThreadContext):
        if self.current_point is None or self.iteration >= self.max_iter:
            self.current_point = self.sample_c()
            self.iteration = 0

        z = 0 + 0j
        for _ in range(self.iteration + 1):
            z = z * z + self.current_point

        x, y = z.real, z.imag
        iter_norm = self.iteration / self.max_iter

        self.iteration += 1

        yield x, [self.x_cv]
        yield y, [self.y_cv]
        yield iter_norm, [self.z_cv]

        yield from self.sleep((1 / self.freq) * 1000)


import time


class UniversalSlopeGenerator(VirtualDevice):
    """UniversalSlopeGenerator

    Serge-inspired Universal Slope Generator (single channel).

    Generates voltage-controlled slopes for:
    - AD / AR envelopes
    - Cycling LFOs
    - Slew limiting
    - Trigger-to-envelope generation
    - Free-running function generation

    Hybrid operation:
    - Reactive when externally triggered
    - Continuous when cycle enabled

    NOTE: This module is LLM generated and manually fixed (and buggy for some outputs)

    inputs:
    * trig_cv [0, 1] round <rising>: Rising-edge trigger input. Starts a new slope immediately.
    * gate_cv [0, 1] round <rising, falling>: Gate input. Rising edge begins rise phase; falling edge begins fall phase.
    * rise_cv [0.001, 10.0] init=0.25: Rise time control. Exponential response.
    * fall_cv [0.001, 10.0] init=0.25: Fall time control. Exponential response.
    * shape_cv [log, lin, exp]: Curve mode for both rise and fall.
    * cycle_cv [off, on] <any>: Cycle enable. When non-zero, slope free-runs continuously,
                           restarting automatically after EOC.
    * reset_cv [0, 1] round <rising>: Immediate reset. Forces output to 0 and stops the slope.

    outputs:
    * out_cv [0, 1]: Main slope output.
    * inv_cv [0, 1]: Inverted output (1 - out).
    * eor_cv [0, 1]: End Of Rise pulse. Emits a short pulse at the end of the rise phase.
    * eoc_cv [0, 1]: End Of Cycle pulse. Emits a short pulse at the end of the fall phase.

    type: continuous
    category: function-generator
    meta: disable default output
    """

    trig_cv = VirtualParameter(name="trig", range=(0.0, 1.0), conversion_policy="round")
    gate_cv = VirtualParameter(name="gate", range=(0.0, 1.0), conversion_policy="round")
    rise_cv = VirtualParameter(name="rise", range=(0.001, 10.0), default=0.25)
    fall_cv = VirtualParameter(name="fall", range=(0.001, 10.0), default=0.25)
    shape_cv = VirtualParameter(name="shape", accepted_values=["log", "lin", "exp"])
    cycle_cv = VirtualParameter(name="cycle", accepted_values=["off", "on"])
    reset_cv = VirtualParameter(
        name="reset", range=(0.0, 1.0), conversion_policy="round"
    )
    eoc_cv = VirtualParameter(name="eoc", range=(0.0, 1.0))
    eor_cv = VirtualParameter(name="eor", range=(0.0, 1.0))
    inv_cv = VirtualParameter(name="inv", range=(0.0, 1.0))
    out_cv = VirtualParameter(name="out", range=(0.0, 1.0))

    def __post_init__(self, **kwargs):
        self.phase = "idle"
        self.value = 0.0
        self.eor_pulse = 0.0
        self.eoc_pulse = 0.0
        self.last_time = time.time()
        return {"disable_output": True}

    def _advance_phase(self):
        """Update slope value and yield outputs (including pulses)."""
        current_time = time.time()
        dt = current_time - self.last_time
        self.last_time = current_time
        if self.phase == "idle":
            yield (self.value, [self.out_cv])
            yield (1.0 - self.value, [self.inv_cv])
            return
        if self.phase == "rising":
            rate = max(self.rise, 0.00001)
            remaining = 1.0 - self.value
        elif self.phase == "falling":
            rate = max(self.fall, 0.00001)
            remaining = self.value
        else:
            return
        if self.shape == "lin":
            delta = dt / rate
        elif self.shape == "exp":
            delta = remaining * dt / rate
        elif self.shape == "log":
            delta = remaining**0.5 * dt / rate
        else:
            delta = dt / rate
        pulse = None
        if self.phase == "rising":
            self.value += delta
            if self.value >= 1.0:
                self.value = 1.0
                pulse = ("eor", self.eor_cv)
                if self.gate != 1:
                    self.phase = "falling"
        elif self.phase == "falling":
            self.value -= delta
            if self.value <= 0.0:
                self.value = 0.0
                pulse = ("eoc", self.eoc_cv)
                self.phase = "idle"
        if pulse:
            channel, output = pulse
            yield (1.0, [output])
            yield (0.0, [output])
            if channel == "eoc" and self.cycle == "on":
                self.phase = "rising"
                self.value = 0.0
        self.value = max(0.0, min(1.0, self.value))
        yield (self.value, [self.out_cv])
        yield (1.0 - self.value, [self.inv_cv])

    def main(self, ctx: ThreadContext):
        yield from self._advance_phase()

    @on(trig_cv, edge="rising")
    def on_trig_rising(self, value, ctx):
        self.phase = "rising"
        self.value = 0.0

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.phase = "idle"
        self.value = 0.0
        self.eor_pulse = 0.0
        self.eoc_pulse = 0.0
        return (0.0, [self.out_cv, self.inv_cv, self.eor_cv, self.eoc_cv])

    @on(gate_cv, edge="rising")
    def on_gate_rising(self, value, ctx):
        self.phase = "rising"

    @on(gate_cv, edge="falling")
    def on_gate_falling(self, value, ctx):
        self.phase = "falling"

    @on(cycle_cv, edge="any")
    def on_cycle_any(self, value, ctx):
        if value == "on" and self.phase == "idle":
            self.phase = "rising"
            self.value = 0.0


class SmoothSteppedGenerator(VirtualDevice):
    """
    Serge SSG (Smooth & Stepped Generator)

    NOTE: mostly LLM Generated (and buggy)

    inputs:
    * input_cv [-10.0, 10.0] init=0.0 round: Rising-edge trigger input. Starts a new slope immediately
    * trig_cv [0, 1] round <rising>: Trig input
    * gate_cv [0, 1] <increase, decrease>: Gate input
    * rate_cv [0.001, 10.0] init=0.5: Curve mode
    * coupler_cv [-1.0, 1.0] init=0: Coupler amount
    * noise_cv [ideal, rails, nonlinear]: Finer feedback computation introducing noise on some values

    outputs:
    * stepped_cv [-10.0, 10.0]: Stepped output
    * smooth_cv [-10.0, 10.0]: Smooth output
    * hot_cv [0, 1]: HOT output

    type: continuous
    category: function-generator
    meta: disable default output
    """

    noise_cv = VirtualParameter(
        name="noise", accepted_values=["ideal", "rails", "nonlinear"]
    )
    input_cv = VirtualParameter(
        name="input", range=(-10.0, 10.0), conversion_policy="round", default=0.0
    )
    trig_cv = VirtualParameter(name="trig", range=(0.0, 1.0), conversion_policy="round")
    gate_cv = VirtualParameter(name="gate", range=(0.0, 1.0))
    rate_cv = VirtualParameter(name="rate", range=(0.001, 10.0), default=0.5)
    coupler_cv = VirtualParameter(name="coupler", range=(-1.0, 1.0), default=0.0)
    hot_cv = VirtualParameter(name="hot", range=(0.0, 1.0))
    stepped_cv = VirtualParameter(name="stepped", range=(-10.0, 10.0))
    smooth_cv = VirtualParameter(name="smooth", range=(-10.0, 10.0))

    def __post_init__(self, **kwargs):
        self.mode = "track"
        self.held = self.input
        self.smooth = self.input
        self.last_time = time.time()
        return {"disable_output": True}

    def main(self, ctx):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now
        rate = max(self.rate, 0.0001)
        dt = min(dt, rate * 0.25)
        alpha = 1.0 - math.exp(-dt / rate)
        raw_stepped = self.held if self.mode == "hold" else self.input
        target = raw_stepped + self.coupler * self.smooth
        self.smooth += (target - self.smooth) * alpha
        if self.noise == "rails":
            self.smooth = max(-10.0, min(10.0, self.smooth))
        elif self.noise == "nonlinear":
            self.smooth = 10.0 * math.tanh(self.smooth / 10.0)
        yield (raw_stepped, [self.stepped_cv])
        yield (self.smooth, [self.smooth_cv])

    @on(trig_cv, edge="rising")
    def on_trig(self, value, ctx):
        self.held = self.input
        self.mode = "hold"
        yield (1, [self.hot_cv])
        yield (0, [self.hot_cv])

    @on(gate_cv, edge="increase")
    def on_gate_increase(self, value, ctx):
        if value >= 1:
            self.mode = "track"

    @on(gate_cv, edge="decrease")
    def on_gate_decrease(self, value, ctx):
        if self.mode == "hold":
            return
        self.mode = "hold"
        self.held = self.input
        yield (1, [self.hot_cv])
        yield (0, [self.hot_cv])


class Integrator(VirtualDevice):
    """
    A pure mathematical integrator for emergent
    non-determinism in async feedback loops.

    inputs:
    * input_cv [None, None] init=0.0 round: Integrator input in integrator unit
    * initial_cv [-1.0, 1.0] init=0.0 <any>: Initial condition
    * gain_cv [0.0, 100.0] init=1.0: Integrator gain
    * reset_cv [0, 1.0] round: Reset integrator

    outputs:
    * output_cv [None, None]: main output

    type: continuous
    category: math
    """

    initial_cv = VirtualParameter(name="initial", range=(-1.0, 1.0), default=0.0)
    input_cv = VirtualParameter(
        name="input", range=(None, None), conversion_policy="round", default=0.0
    )
    gain_cv = VirtualParameter(name="gain", range=(0.0, 100.0), default=1.0)
    reset_cv = VirtualParameter(
        name="reset", range=(0.0, 1.0), conversion_policy="round"
    )

    @property
    def range(self):
        return (None, None)

    def __post_init__(self, **kwargs):
        self.value = self.initial
        self.last_time = time.time()

    def main(self, ctx: ThreadContext):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now
        self.value += self.input * self.gain * dt
        self.value = max(-1.0, min(1.0, self.value))
        yield self.value

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        self.value = self.initial
        self.last_time = time.time()
        return self.value

    @on(initial_cv, edge="any")
    def on_initial_any(self, value, ctx):
        self.value = value
        self.last_time = time.time()
        return self.value
