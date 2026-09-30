import time

from nallely import VirtualDevice, VirtualParameter, on
from nallely.codegen import gencode
from nallely.core import get_virtual_devices, no_registration


@no_registration
class THATConfig(VirtualDevice):
    def __init__(self, *args, **kwargs):
        kwargs.pop("target_cycle_time", None)
        super().__init__(*args, target_cycle_time=1 / 255, **kwargs)


class THATSummer(THATConfig):
    """Summer

    inputs:
    * X1_cv [-1, 1] init=0 <any>: entry 1 gain 1
    * X2_cv [-1, 1] init=0 <any>: entry 2 gain 1
    * X3_cv [-1, 1] init=0 <any>: entry 3 gain 1
    * X4_cv [-1, 1] init=0 <any>: entry 4 gain 1
    * X5_cv [-1, 1] init=0 <any>: entry 5 gain 10
    * X6_cv [-1, 1] init=0 <any>: entry 6 gain 10
    * X7_cv [-1, 1] init=0 <any>: entry 7 gain 10
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation

    outputs:
    * OUT_cv [-1, 1]: the normalized output
    * OVERLOAD_cv [0, 1]: overload output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    X1_cv = VirtualParameter(name="X1", range=(-1.0, 1.0), default=0.0)
    X2_cv = VirtualParameter(name="X2", range=(-1.0, 1.0), default=0.0)
    X3_cv = VirtualParameter(name="X3", range=(-1.0, 1.0), default=0.0)
    X4_cv = VirtualParameter(name="X4", range=(-1.0, 1.0), default=0.0)
    X5_cv = VirtualParameter(name="X5", range=(-1.0, 1.0), default=0.0)
    X6_cv = VirtualParameter(name="X6", range=(-1.0, 1.0), default=0.0)
    X7_cv = VirtualParameter(name="X7", range=(-1.0, 1.0), default=0.0)
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    OVERLOAD_cv = VirtualParameter(name="OVERLOAD", range=(0.0, 1.0))
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    def process(self, X1, X2, X3, X4, X5, X6, X7):
        res = -1 * (X1 + X2 + X3 + X4 + 10 * (X5 + X6 + X7))
        if res > 1:
            res = 1
            yield (1, [self.OVERLOAD_cv])
        elif res < -1:
            res = -1
            yield (1, [self.OVERLOAD_cv])
        else:
            yield (0, [self.OVERLOAD_cv])
        yield (res, [self.OUT_cv])

    @on(X7_cv, edge="any")
    def on_X7_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, self.X2, self.X3, self.X4, self.X5, self.X6, value
            )

    @on(X6_cv, edge="any")
    def on_X6_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, self.X2, self.X3, self.X4, self.X5, value, self.X7
            )

    @on(X5_cv, edge="any")
    def on_X5_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, self.X2, self.X3, self.X4, value, self.X6, self.X7
            )

    @on(X4_cv, edge="any")
    def on_X4_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, self.X2, self.X3, value, self.X5, self.X6, self.X7
            )

    @on(X3_cv, edge="any")
    def on_X3_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, self.X2, value, self.X4, self.X5, self.X6, self.X7
            )

    @on(X2_cv, edge="any")
    def on_X2_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                self.X1, value, self.X3, self.X4, self.X5, self.X6, self.X7
            )

    @on(X1_cv, edge="any")
    def on_X1_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(
                value, self.X2, self.X3, self.X4, self.X5, self.X6, self.X7
            )

    def main(self, ctx):
        if self.mode == "continuous":
            yield from self.process(
                self.X1, self.X2, self.X3, self.X4, self.X5, self.X6, self.X7
            )


class THATIntegrator(THATConfig):
    """Integrator

    inputs:
    * X1_cv [-1, 1] init=0 <any>: entry 1 gain 1
    * X2_cv [-1, 1] init=0 <any>: entry 2 gain 1
    * X3_cv [-1, 1] init=0 <any>: entry 3 gain 10
    * X4_cv [-1, 1] init=0 <any>: entry 4 gain 10
    * IC_cv [-1, 1] init=0 <any>: initial condition
    * gain_cv [0.01, 10] init=1: general gain (dt gain)
    * state_cv [OP, IC, HALT]: switch between IC forced, normal integration, and temp disconnected integration
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation
    * reset_cv [0, 1] <rising>: reset the integrator internal value

    outputs:
    * OUT_cv [-1, 1]: the normalized output
    * OVERLOAD_cv [0, 1]: overload output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    X1_cv = VirtualParameter(name="X1", range=(-1.0, 1.0), default=0.0)
    X2_cv = VirtualParameter(name="X2", range=(-1.0, 1.0), default=0.0)
    X3_cv = VirtualParameter(name="X3", range=(-1.0, 1.0), default=0.0)
    X4_cv = VirtualParameter(name="X4", range=(-1.0, 1.0), default=0.0)
    IC_cv = VirtualParameter(name="IC", range=(-1.0, 1.0), default=0.0)
    gain_cv = VirtualParameter(name="gain", range=(0.01, 10.0), default=1.0)
    state_cv = VirtualParameter(name="state", accepted_values=["OP", "IC", "HALT"])
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0))
    OVERLOAD_cv = VirtualParameter(name="OVERLOAD", range=(0.0, 1.0))
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        self.last_time = time.time()
        self.value = self.IC
        return {"disable_output": True}

    def process(self, X1, X2, X3, X4):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now
        if self.state == "IC":
            self.value = self.IC
            yield (-self.value, [self.OUT_cv])
            return
        if self.state == "HALT":
            yield (-self.value, [self.OUT_cv])
            return
        self.value += (X1 + X2 + 10 * X3 + 10 * X4) * dt * self.gain
        if self.value > 1:
            yield (1, [self.OVERLOAD_cv])
            self.value = 1
        elif self.value < -1:
            yield (1, [self.OVERLOAD_cv])
            self.value = -1
        else:
            yield (0, [self.OVERLOAD_cv])
        yield (-self.value, [self.OUT_cv])

    @on(X4_cv, edge="any")
    def on_X4_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(self.X1, self.X2, self.X3, value)

    @on(X3_cv, edge="any")
    def on_X3_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(self.X1, self.X2, value, self.X4)

    @on(X2_cv, edge="any")
    def on_X2_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(self.X1, value, self.X3, self.X4)

    @on(X1_cv, edge="any")
    def on_X1_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(value, self.X2, self.X3, self.X4)

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.reset = 0
        self.__post_init__()

    @on(IC_cv, edge="any")
    def on_IC_any(self, value, ctx):
        self.value = value

    def main(self, ctx):
        if self.mode == "continuous":
            yield from self.process(self.X1, self.X2, self.X3, self.X4)


class THATInverter(THATConfig):
    """Inverter

    inputs:
    * X_cv [-1, 1] init=0 <any>: entry
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation

    outputs:
    * OUT_cv [-1, 1]: the normalized output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    X_cv = VirtualParameter(name="X", range=(-1.0, 1.0), default=0.0)
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(X_cv, edge="any")
    def on_X_any(self, value, ctx):
        if self.mode == "ondemand":
            return (-value, [self.OUT_cv])

    def main(self, ctx):
        if self.mode == "continuous":
            return (-self.X, [self.OUT_cv])


class THATMultiplier(THATConfig):
    """Multiplier

    inputs:
    * X_cv [-1, 1] init=0 <any>: entry 1 gain 1
    * Y_cv [-1, 1] init=0 <any>: entry 2 gain 1
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation

    outputs:
    * OUT_cv [-1, 1]: the normalized output
    * OVERLOAD_cv [0, 1]: overload output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    X_cv = VirtualParameter(name="X", range=(-1.0, 1.0), default=0.0)
    Y_cv = VirtualParameter(name="Y", range=(-1.0, 1.0), default=0.0)
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    OVERLOAD_cv = VirtualParameter(name="OVERLOAD", range=(0.0, 1.0))
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    def process(self, X, Y):
        res = X * Y
        if res > 1:
            yield (1, [self.OVERLOAD_cv])
            res = 1
        elif res < -1:
            yield (1, [self.OVERLOAD_cv])
            res = -1
        else:
            yield (0, [self.OVERLOAD_cv])
        yield (res, [self.OUT_cv])

    @on(Y_cv, edge="any")
    def on_Y_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(self.X, value)

    @on(X_cv, edge="any")
    def on_X_any(self, value, ctx):
        if self.mode == "ondemand":
            yield from self.process(value, self.Y)

    def main(self, ctx):
        if self.mode == "continuous":
            yield from self.process(self.X, self.Y)


class THATCoefPot(THATConfig):
    """Coeficient-potentiometer

    inputs:
    * X_cv [-1, 1] init=0 <any>: entry 1 gain 1
    * k_cv [0, 1] init=0.5 <any>: coeficient
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation

    outputs:
    * OUT_cv [-1, 1]: the normalized output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    X_cv = VirtualParameter(name="X", range=(-1.0, 1.0), default=0.0)
    k_cv = VirtualParameter(name="k", range=(0.0, 1.0), default=0.5)
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    def process(self, X, k):
        return (X * k, [self.OUT_cv])

    @on(k_cv, edge="any")
    def on_k_any(self, value, ctx):
        if self.mode == "ondemand":
            return self.process(self.X, value)

    @on(X_cv, edge="any")
    def on_X_any(self, value, ctx):
        if self.mode == "ondemand":
            return self.process(value, self.k)

    def main(self, ctx):
        if self.mode == "continuous":
            return self.process(self.X, self.k)


class THATComparator(VirtualDevice):
    """Comparator

    inputs:
    * A_cv [-1, 1] init=0 <any>: entry A gain 1
    * B_cv [-1, 1] init=0 <any>: entry B gain 1
    * sup_cv [-1, 1] init=0: > 0 entry
    * inf_cv [-1, 1] init=0: <= 0 entry
    * mode_cv [continuous, ondemand]: switch between discrete/continuous computation

    outputs:
    * OUT_cv [-1, 1]: the normalized output

    type: hybrid
    category: THAT
    meta: disable default output
    """

    A_cv = VirtualParameter(name="A", range=(-1.0, 1.0), default=0.0)
    B_cv = VirtualParameter(name="B", range=(-1.0, 1.0), default=0.0)
    sup_cv = VirtualParameter(name="sup", range=(-1.0, 1.0), default=0.0)
    inf_cv = VirtualParameter(name="inf", range=(-1.0, 1.0), default=0.0)
    mode_cv = VirtualParameter(name="mode", accepted_values=["continuous", "ondemand"])
    OUT_cv = VirtualParameter(name="OUT", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    def process(self, a, b, sup, inf):
        return (sup if a + b > 0 else inf, [self.OUT_cv])

    @on(B_cv, edge="any")
    def on_B_any(self, value, ctx):
        if self.mode == "ondemand":
            return self.process(self.A, value, self.sup, self.inf)

    @on(A_cv, edge="any")
    def on_A_any(self, value, ctx):
        if self.mode == "ondemand":
            return self.process(self.B, value, self.sup, self.inf)

    def main(self, ctx):
        if self.mode == "continuous":
            return self.process(self.A, self.B, self.sup, self.inf)


class THATGeneralPanel(VirtualDevice):
    """General panel to control all the THAT instances at once

    inputs:
    * gain_integrators_cv [0.01, 10] init=1 <any>: gain of all integrators in the patch
    * state_integrators_cv [OP, IC, HALT] <any>: the state of all integrators in the patch
    * reset_integrators_cv [0, 1] init=0 <rising>: resets all the integrators in the patch

    type: ondemand
    category: THAT
    meta: disable default output
    """

    gain_integrators_cv = VirtualParameter(
        name="gain_integrators", range=(0.01, 10.0), default=1.0
    )
    state_integrators_cv = VirtualParameter(
        name="state_integrators", accepted_values=["OP", "IC", "HALT"]
    )
    reset_integrators_cv = VirtualParameter(
        name="reset_integrators", range=(0.0, 1.0), default=0.0
    )

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(reset_integrators_cv, edge="rising")
    def on_reset_integrators_rising(self, value, ctx):
        for vdev in get_virtual_devices():
            if isinstance(vdev, THATIntegrator):
                vdev.set_parameter("reset", 1)
                vdev.set_parameter("reset", 0)

    @on(state_integrators_cv, edge="any")
    def on_state_integrators_any(self, value, ctx):
        for vdev in get_virtual_devices():
            if isinstance(vdev, THATIntegrator):
                vdev.set_parameter("state", value)

    @on(gain_integrators_cv, edge="any")
    def on_gain_integrators_any(self, value, ctx):
        for vdev in get_virtual_devices():
            if isinstance(vdev, THATIntegrator):
                vdev.set_parameter("gain", value)
