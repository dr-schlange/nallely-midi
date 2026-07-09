import math
from nallely import VirtualDevice, VirtualParameter, on
from nallely.codegen import gencode


@gencode()
class ScannedString(VirtualDevice):
    """Scanned String

    Scanned synthesis one dimentional string model

    Physics update runs once every N (256) samples

    inputs:
    * stiffness_cv [0.0, 1.0] init=0.1: spring coupling constant k
    * damping_cv [0.0, 1.0] init=0.01: energy loss per physics step d
    * excite_cv [0, 1] >0 <rising>: trigger a pluck at excite_pos
    * excite_pos_cv [0, 255] init=127 round <any>: position on string to pluck (0-255)
    * excite_amp_cv [-1.0, 1.0] init=0.8 <any>: amplitude of the pluck
    * excite_width_cv [1, 64] init=22 round <any>: Gaussian width (std dev in samples) of the pluck
    * retrigger_cv [OFF, ON]: Hard retrigger on excitation
    * reset_cv [0, 1] init=0 round <rising>: resets

    outputs:
    * output_cv [-1.0, 1.0]: current string displacement sample

    type: hybrid
    category: synthesis
    """

    retrigger_cv = VirtualParameter(name="retrigger", accepted_values=["OFF", "ON"])
    reset_cv = VirtualParameter(
        name="reset", range=(0.0, 1.0), conversion_policy="round", default=0.0
    )
    stiffness_cv = VirtualParameter(name="stiffness", range=(0.0, 1.0), default=0.1)
    damping_cv = VirtualParameter(name="damping", range=(0.0, 1.0), default=0.01)
    excite_cv = VirtualParameter(
        name="excite", range=(0.0, 1.0), conversion_policy=">0"
    )
    excite_pos_cv = VirtualParameter(
        name="excite_pos", range=(0.0, 255.0), conversion_policy="round", default=127.0
    )
    excite_amp_cv = VirtualParameter(name="excite_amp", range=(-1.0, 1.0), default=0.8)
    excite_width_cv = VirtualParameter(
        name="excite_width", range=(1.0, 64.0), conversion_policy="round", default=22.0
    )
    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))
    N = 256

    def __post_init__(self, **kwargs):
            self.x_curr = [0.0] * self.N
            self.x_prev = [0.0] * self.N
            self.pos = 0
            self.target_cycle_time = 0.00000000001
            self.recompute = False

    def _physics_step(self):
        k = self.stiffness
        d = self.damping
        x = list(self.x_curr)
        xp = self.x_prev
        N = self.N
        for i in range(N):
            coupling = k * (x[(i + 1) % N] - 2 * x[i] + x[(i - 1) % N])
            newx = (1.0 - d) * (2.0 * x[i] - xp[i] + coupling)
            self.x_curr[i] = max(-1.0, min(1.0, newx))
        self.x_prev = x

    def _reset_tabs(self):
        self.x_curr = [0.0] * self.N
        self.x_prev = [0.0] * self.N
        self.pos = 0

    def _recompute_excitation(self):
        pos = int(self.excite_pos)
        amp = self.excite_amp
        width = max(1, int(self.excite_width))
        N = self.N
        inv_2w2 = 1.0 / (2.0 * width * width)
        for i in range(N):
            dist = min(abs(i - pos), N - abs(i - pos))
            self.x_curr[i] += amp * math.exp(-dist * dist * inv_2w2)
            self.x_curr[i] = max(-1.0, min(1.0, self.x_curr[i]))
        self.x_prev = list(self.x_curr)

    @on(excite_cv, edge="rising")
    def on_excite_rising(self, value, ctx):
        if self.retrigger == "ON":
            self._reset_tabs()
        self._recompute_excitation()

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self._reset_tabs()

    def main(self, ctx):
        sample = self.x_curr[self.pos]
        self.pos = (self.pos + 1) % self.N
        if self.pos == 0:
            if self.recompute:
                self._recompute_excitation()
                self.recompute = False
            self._physics_step()
        return max(-1.0, min(1.0, sample))

    @on(excite_width_cv, edge="any")
    def on_excite_width_any(self, value, ctx):
        self.recompute = True

    @on(excite_amp_cv, edge="any")
    def on_excite_amp_any(self, value, ctx):
        self.recompute = True

    @on(excite_pos_cv, edge="any")
    def on_excite_pos_any(self, value, ctx):
        self.recompute = True
