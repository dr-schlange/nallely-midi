import math
from collections import deque

from nallely import VirtualDevice, VirtualParameter, on
from nallely.codegen import gencode


class CircularBuffer:
    def __init__(self, N, fill=0.0):
        self.fillval = fill
        self.buf = deque([fill] * N, N)
        self.N = N
        self.pos = 0

    def push(self, value):
        self.pos = (self.pos + 1) % self.N
        self.buf[self.pos] = value

    def center_on(self, i):
        self.buf.rotate(i)

    def __getitem__(self, k):
        return self.buf[k]

    def __setitem__(self, k, v):
        self.buf[k] = v

    def reset(self):
        self.buf.clear()
        self.buf.extend([self.fillval] * self.N)

    def fill(self, value):
        self.buf.clear()
        self.buf.extend([value] * self.N)

    def astuple(self):
        return tuple(self.buf)

    def copy(self):
        cpy = self.__class__(self.N, fill=self.fillval)
        cpy.pos = self.pos
        return cpy


class ScannedString(VirtualDevice):
    """Scanned String

    Scanned synthesis one dimentional string model

    Physics update runs once every N (256) samples

    inputs:
    * stiffness_cv [0.0, 1.0] init=0.1 <any>: spring coupling constant k
    * damping_cv [0.0, 1.0] init=0.01 <any>: energy loss d
    * mass_cv [0.0, 2.0] init=0.5 <any>: element's mass
    * restoring_cv [0, 1] init=0.01 <any>: spring constant to earth
    * model_mode_cv [FILL, STREAM, FREEZE]: freeze model parameters
    * hammer_cv [gauss, cos, triangle, square, free] <any>: hammer shape
    * hammer_shape_cv [-1, 1] init=0 <any>: hammer shape streamed
    * freeze_hammer_cv [OFF, ON]: freeze the streamed hammer shape
    * excite_cv [0, 1] >0 <rising>: trigger a pluck at excite_pos
    * excite_pos_cv [0, 255] init=127 round <any>: position on string to pluck (0-255)
    * excite_amp_cv [-1.0, 1.0] init=0.8 <any>: amplitude of the pluck
    * excite_width_cv [1, 64] init=22 round <any>: Gaussian width (std dev in samples) of the pluck
    * retrigger_cv [OFF, ON]: Hard retrigger on excitation
    * excite_on_change_cv [OFF, ON]: excites the model when pos/amp/width changes
    * write_rate_cv [64, 4096] init=256 round <any>: Write rate in the table
    * reset_cv [0, 1] init=0 round <rising>: resets

    outputs:
    * output_cv [-1.0, 1.0]: current string displacement sample

    type: hybrid
    category: synthesis
    """

    stiffness_cv = VirtualParameter(
        name="stiffness", range=(0.0, 1.0), default=0.1, stream=True
    )
    damping_cv = VirtualParameter(
        name="damping", range=(0.0, 1.0), default=0.01, stream=True
    )
    mass_cv = VirtualParameter(name="mass", range=(0.0, 2.0), default=0.5, stream=True)
    restoring_cv = VirtualParameter(
        name="restoring", range=(0.0, 1.0), default=0.5, stream=True
    )
    model_mode_cv = VirtualParameter(
        name="model_mode", accepted_values=["FILL", "STREAM", "FREEZE"]
    )
    hammer_cv = VirtualParameter(
        name="hammer", accepted_values=["gauss", "cos", "triangle", "square", "free"]
    )
    hammer_shape_cv = VirtualParameter(
        name="hammer_shape", range=(-1.0, 1.0), default=0.0
    )
    freeze_hammer_cv = VirtualParameter(
        name="freeze_hammer", accepted_values=["OFF", "ON"]
    )
    write_rate_cv = VirtualParameter(
        name="write_rate",
        range=(64.0, 4096.0),
        conversion_policy="round",
        default=256.0,
    )
    retrigger_cv = VirtualParameter(name="retrigger", accepted_values=["OFF", "ON"])
    excite_on_change_cv = VirtualParameter(
        name="excite_on_change", accepted_values=["OFF", "ON"]
    )
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
    reset_cv = VirtualParameter(
        name="reset", range=(0.0, 1.0), conversion_policy="round", default=0.0
    )
    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))
    N = 256

    def __post_init__(self, **kwargs):
        self.x_curr = [0.0] * self.N
        self.x_prev = [0.0] * self.N
        self.k_arr = CircularBuffer(self.N, fill=0.1)
        self.d_arr = CircularBuffer(self.N, fill=0.01)
        self.c_arr = CircularBuffer(self.N, fill=0.01)
        self.m_arr = CircularBuffer(self.N, fill=0.5)
        self.ham_arr = CircularBuffer(self.N)
        self.pos = 0
        self.target_cycle_time = 1 / 256
        self.recompute = False

    def _physics_step(self):
        k = self.k_arr
        d = self.d_arr
        c = self.c_arr
        m = self.m_arr
        x = list(self.x_curr)
        xp = self.x_prev
        N = self.N
        for i in range(N):
            coupling = k[i] * (x[(i - 1) % N] - 2 * x[i] + x[(i + 1) % N])
            accel = (coupling - c[i] * x[i] - d[i] * (x[i] - xp[i])) / m[i]
            newx = 2.0 * x[i] - xp[i] + accel
            self.x_curr[i] = max(-1.0, min(1.0, newx))
        self.x_prev = x

    def _reset_tabs(self):
        self.x_curr = [0.0] * self.N
        self.x_prev = [0.0] * self.N
        self.pos = 0
        self.k_arr.reset()
        self.d_arr.reset()
        self.c_arr.reset()
        self.m_arr.reset()
        self.ham_arr.reset()

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
        self.recompute = self.excite_on_change == "ON"

    @on(excite_amp_cv, edge="any")
    def on_excite_amp_any(self, value, ctx):
        self.recompute = self.excite_on_change == "ON"

    @on(excite_pos_cv, edge="any")
    def on_excite_pos_any(self, value, ctx):
        self.recompute = self.excite_on_change == "ON"

    @on(write_rate_cv, edge="any")
    def on_write_rate_any(self, value, ctx):
        self.target_cycle_time = 1 / (value if value != 0 else 1)

    @on(hammer_shape_cv, edge="any")
    def on_hammer_shape_any(self, value, ctx):
        if self.freeze_hammer == "ON":
            return
        self.ham_arr.push(value)

    @on(hammer_cv, edge="any")
    def on_hammer_any(self, value, ctx):
        # self.recompute = self.excite_on_change == "ON"
        ...

    @on(restoring_cv, edge="any")
    def on_restoring_any(self, value, ctx):
        if self.model_mode == "FREEZE":
            return
        if self.model_mode == "STREAM":
            self.c_arr.push(value)
        else:
            self.c_arr.fill(value)

    @on(mass_cv, edge="any")
    def on_mass_any(self, value, ctx):
        if self.model_mode == "FREEZE":
            return
        if self.model_mode == "STREAM":
            self.m_arr.push(value)
        else:
            self.m_arr.fill(value)

    @on(damping_cv, edge="any")
    def on_damping_any(self, value, ctx):
        if self.model_mode == "FREEZE":
            return
        if self.model_mode == "STREAM":
            self.d_arr.push(value)
        else:
            self.d_arr.fill(value)

    @on(stiffness_cv, edge="any")
    def on_stiffness_any(self, value, ctx):
        if self.model_mode == "FREEZE":
            return
        if self.model_mode == "STREAM":
            self.k_arr.push(value)
        else:
            self.k_arr.fill(value)
