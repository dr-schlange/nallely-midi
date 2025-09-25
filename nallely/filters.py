import math

from nallely.core.world import ThreadContext

from .core import VirtualDevice, VirtualParameter, on


class MultiPoleFilter(VirtualDevice):
    MAX_POLES = 4
    input_cv = VirtualParameter(name="input", range=(0, 127))

    filter_cv = VirtualParameter(
        name="filter", accepted_values=("lowpass", "highpass", "bandpass")
    )
    mode_cv = VirtualParameter(name="mode", accepted_values=("cutoff", "smoothing"))

    cutoff_cv = VirtualParameter(name="cutoff", range=(0, 3000))
    smoothing_cv = VirtualParameter(name="smoothing", range=(0.0, 1.0))

    poles_cv = VirtualParameter(
        name="poles", range=(1, MAX_POLES), conversion_policy="round"
    )
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy=">0")
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    def __init__(
        self,
        input: int | float = 0,
        filter="lowpass",
        mode="cutoff",
        cutoff=1.0,
        smoothing=0.1,
        poles=1,
        type="continuous",
        **kwargs,
    ):
        self.input = input
        self.filter = filter
        self.mode = mode
        self.cutoff = cutoff
        self.smoothing = smoothing
        self.poles = poles
        self.type = type

        self._states = [input] * self.MAX_POLES
        self._prev_input = input
        super().__init__(**kwargs)

    def store_input(self, param: str, value):
        if param == "poles" and value > self.MAX_POLES:
            value = self.MAX_POLES
        return super().store_input(param, value)

    @on(reset_cv, edge="rising")
    def reset_filter(self, value, ctx):
        # Reset all internal states to current input
        self._states = [self.input] * self.MAX_POLES
        return self._states[self.poles - 1]  # output last pole

    def _compute_alpha(self):
        if self.mode == "cutoff":
            # We use target cycle time as sample rate approximation
            fs = 1.0 / self.target_cycle_time
            omega = 2.0 * math.pi * self.cutoff
            alpha = omega / (omega + fs)
            return max(0.0, min(alpha, 1.0))
        # smoothing factor mode
        return max(0.0, min(self.smoothing, 1.0))

    @on(input_cv, edge="any")
    def input_variation(self, value, ctx):
        if self.type == "ondemand":
            return self._process(value)

    def main(self, ctx: ThreadContext):
        if self.type == "continuous":
            return self._process(self.input)

    def _process(self, x):
        alpha = self._compute_alpha()
        states = self._states

        if self.filter == "lowpass":
            for i in range(self.poles):
                states[i] = states[i] + alpha * (x - states[i])
                x = states[i]
        elif self.filter == "highpass":
            prev_input = self._prev_input
            for i in range(self.poles):
                states[i] = alpha * (states[i] + x - prev_input)
                x = states[i]
                prev_input = x if i == 0 else prev_input
            self._prev_input = self.input
        else:
            # lowpass branch
            lp = x
            lp_states = list(states)
            for i in range(self.poles):
                lp_states[i] = lp_states[i] + alpha * (lp - lp_states[i])
                lp = lp_states[i]

            # highpass branch
            hp = x
            hp_states = list(states)
            prev_input = self._prev_input
            for i in range(self.poles):
                hp_states[i] = alpha * (hp_states[i] + hp - prev_input)
                hp = hp_states[i]
                prev_input = hp if i == 0 else prev_input
            self._prev_input = self.input

            # bandpass output = lowpass - highpass
            y = lp - hp

        self._states = states
        return states[self.poles - 1]  # output last pole


class Waveshaper(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(-5, 5))
    mode_cv = VirtualParameter(
        name="mode",
        accepted_values=("linear", "exp", "log", "sigmoid", "fold", "quantize"),
    )
    amount_cv = VirtualParameter(name="amount", range=(0, 1))
    symmetry_cv = VirtualParameter(name="symmetry", range=(-1, 1))
    bias_cv = VirtualParameter(name="bias", range=(0, 5))
    exp_power_cv = VirtualParameter(name="exp_power", range=(0.1, 50))
    log_scale_cv = VirtualParameter(name="log_scale", range=(1, 30))
    sigmoid_gain_cv = VirtualParameter(name="sigmoid_gain", range=(0.5, 20))
    fold_gain_cv = VirtualParameter(name="fold_gain", range=(0.5, 10))
    quantize_steps_cv = VirtualParameter(
        name="quantize_steps", range=(2, 64), conversion_policy="round"
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    def __init__(self, *args, **kwargs):
        self.mode = "linear"
        self.bias = 0
        self.symmetry = 0
        self.input = 0
        self.amount = 0.5
        self.quantize_steps = 8
        self.log_scale = 4
        self.sigmoid_gain = 3
        self.fold_gain = 1
        self.type = "ondemand"
        self.exp_power = 2
        super().__init__(*args, **kwargs)

    def process(self):
        # Normalize input to -1..1
        norm = self.input / 5.0
        norm = max(-1.0, min(1.0, norm))

        # Apply bias in normalized space (-1..1)
        bias_norm = self.bias / 5.0
        x = norm + bias_norm
        x = max(-1.0, min(1.0, x))

        # Apply shaping function
        y = self.apply_shaping(x, self.mode)

        # Apply symmetry
        if y >= 0:
            y *= 1 + self.symmetry
        else:
            y *= 1 - self.symmetry
        y = max(-1.0, min(1.0, y))

        # Dry/Wet blending (0 = wet, 1 = dry)
        blended = self.amount * norm + (1 - self.amount) * y

        # Map back to 0..5V output
        output = (blended + 1) * 5 / 2
        return output

    def apply_shaping(self, x, mode):
        if mode == "linear":
            return x
        elif mode == "exp":
            return math.copysign(abs(x) ** self.exp_power, x)
        elif mode == "log":
            return math.copysign(
                math.log1p(abs(x) * self.log_scale) / math.log1p(self.log_scale), x
            )
        elif mode == "sigmoid":
            return math.tanh(self.sigmoid_gain * x)
        elif mode == "fold":
            return abs(((x * self.fold_gain + 1) % 2) - 1) * 2 - 1
        elif mode == "quantize":
            steps = int(self.quantize_steps)
            if steps == 0:
                steps = 0.001
            return round(x * steps) / steps
        return x

    @on(input_cv, edge="any")
    def compute_input(self, value, ctx):
        if self.type == "ondemand":
            return self.process()

    def main(self, ctx):
        if self.type == "continuous":
            return self.process()


class Mixer(VirtualDevice):
    in0_cv = VirtualParameter(name="in0", range=(0, 127))
    in1_cv = VirtualParameter(name="in1", range=(0, 127))
    in2_cv = VirtualParameter(name="in2", range=(0, 127))
    in3_cv = VirtualParameter(name="in3", range=(0, 127))

    level0_cv = VirtualParameter(name="level0", range=(0, 100), default=50)
    level1_cv = VirtualParameter(name="level1", range=(0, 100), default=50)
    level2_cv = VirtualParameter(name="level2", range=(0, 100), default=50)
    level3_cv = VirtualParameter(name="level3", range=(0, 100), default=50)

    nums_cv = VirtualParameter(
        name="nums", range=(2, 4), conversion_policy="round", default=4
    )
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    @on(in0_cv, edge="any")
    def in0_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(in1_cv, edge="any")
    def in1_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(in2_cv, edge="any")
    def in2_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(in3_cv, edge="any")
    def in3_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(nums_cv, edge="any")
    def nums_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    def main(self, ctx):
        if self.type == "continuous":  # type: ignore
            return self.process()

    def process(self):
        nums = self.nums  # type: ignore
        inputs = (getattr(self, f"in{i}") for i in range(nums))
        levels = (getattr(self, f"level{i}") / 100.0 for i in range(nums))
        return (1 / nums) * sum(w * x for w, x in zip(levels, inputs))


class Crossfade(VirtualDevice):
    in0_cv = VirtualParameter(name="in0", range=(0, 127))
    in1_cv = VirtualParameter(name="in1", range=(0, 127))
    in2_cv = VirtualParameter(name="in2", range=(0, 127))
    in3_cv = VirtualParameter(name="in3", range=(0, 127))
    level_cv = VirtualParameter(name="level", range=(0, 100), default=50)
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    out0_cv = VirtualParameter(name="out0", range=(0, 127))
    out1_cv = VirtualParameter(name="out1", range=(0, 127))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(in0_cv, edge="any")
    def in0_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            yield from self.process()

    @on(in1_cv, edge="any")
    def in1_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            yield from self.process()

    @on(in2_cv, edge="any")
    def in2_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            yield from self.process()

    @on(in3_cv, edge="any")
    def in3_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            yield from self.process()

    @on(level_cv, edge="any")
    def level_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            yield from self.process()

    def main(self, ctx):
        if self.type == "continuous":  # type: ignore
            yield from self.process()

    def process(self):
        level = self.level  # type: ignore
        in0, in1, in2, in3 = self.in0, self.in1, self.in2, self.in3  # type: ignore
        alpha = level / 100.0
        yield (1 - alpha) * in0 + alpha * in1, [self.out0_cv]
        yield (1 - alpha) * in2 + alpha * in3, [self.out1_cv]
