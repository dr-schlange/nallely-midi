from collections import deque
from nallely import on, VirtualParameter, VirtualDevice
from nallely.core.world import ThreadContext
import math
import random


MAX_ABS = 1e6  # valeur max avant clamp


def safe_val(v):
    if math.isfinite(v):
        return max(-MAX_ABS, min(MAX_ABS, v))
    return 0.0  # si NaN ou inf


class HenonProjector(VirtualDevice):
    a_cv = VirtualParameter("a")
    b_cv = VirtualParameter("b")
    x_cv = VirtualParameter("x")
    y_cv = VirtualParameter("y")
    freq_cv = VirtualParameter("freq", range=(0.01, 1000))

    @property
    def range(self):
        return (None, None)

    def __init__(self, a=1.4, b=0.3, freq=1, **kwargs):
        self.a = a
        self.b = b
        self.x = 0.1
        self.y = 0.1
        self.freq = freq
        super().__init__(**kwargs)

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
    x_cv = VirtualParameter("x")
    y_cv = VirtualParameter("y")
    z_cv = VirtualParameter("z")
    xnorm_cv = VirtualParameter("xnorm", range=(0, 127))
    ynorm_cv = VirtualParameter("ynorm", range=(0, 127))
    znorm_cv = VirtualParameter("znorm", range=(0, 127))
    freq_cv = VirtualParameter("freq", range=(0.01, 5000))

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
        super().__init__(**kwargs)

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
    x_cv = VirtualParameter("x")
    y_cv = VirtualParameter("y")
    xnorm_cv = VirtualParameter("xnorm", range=(0, 127))
    ynorm_cv = VirtualParameter("ynorm", range=(0, 127))

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

        super().__init__(**kwargs)

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


#  Mackey–Glass (
# # buffer contains (t_i,x_i) sorted by t
# x_tau = interp(t - tau, buffer_times, buffer_values)
# dx = beta * x_tau / (1 + x_tau**n) - gamma * x_now
# x_next = x_now + dx * dt
# append_to_buffer(t+dt, x_next)
# Delay logistic / discrete delayed
