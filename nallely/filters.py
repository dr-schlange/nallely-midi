import math

from nallely.core.world import ThreadContext

from .core import VirtualDevice, VirtualParameter, on


class MultiPoleFilter(VirtualDevice):
    """Multi Pole Filter

    Multiple filters depending on a selected type of filter (lowpass, highpass, bandpass).


    inputs:
    * input_cv [0, 127] <any>: Input signal.
    * filter_cv [lowpass, highpass, bandpass]: The filter type (default=lowpass).
    * mode_cv [cutoff, smoothing]: Choose between cutoff control or smoothing control.
    * cutoff_cv [0.0, 3000.0] init=1.0: Control cutoff frequency.
    * smoothing_cv [0.0, 1.0] init=0.1: Control smoothing factor.
    * poles_cv [1, 4] init=1 round: Number of poles for the filter.
    * reset_cv [0, 1] >0 <rising>: Reset all internal states.
    * type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * output_cv [0, 127]: The filtered signal.

    type: ondemand, continuous
    category: filter
    """

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
    """Waveshaper

    Modulate a signal waveform to reshape it.

    inputs:
    * input_cv [0, 127] <any>: Input signal.
    * mode_cv [linear, exp, log, sigmoid, fold, quantize]: Choose how to shape the input waveform.
    * amount_cv [0, 1]: The filter type (default=lowpass).
    * symmetry_cv [-1.0, 1] init=0.0: Adjusts the balance between "positive" and "negative" portions of the reshaped waveform.
    * bias_cv [0.0, 5.0]: Offsets the input signal before applying the shaping function.
    * exp_power_cv [0.1, 50]: Controls the exponent used in the exponential shaping mode.
    * log_scale_cv [1, 30]: Scales the input for the logarithmic shaping mode.
    * sigmoid_gain_cv [0.5, 20]: Determines the steepness of the curve in sigmoid shaping mode.
    * fold_gain_cv [0.5, 10]: Controls how strongly the input signal is folded in fold mode.
    * quantize_steps_cv [2, 64]: Sets the number of discrete levels for the quantize shaping mode.
    * type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * output_cv [0, 127]: The reshaped signal.

    type: ondemand, continuous
    category: filter
    """

    input_cv = VirtualParameter(name="input", range=(-5, 5))
    mode_cv = VirtualParameter(
        name="mode",
        accepted_values=("linear", "exp", "log", "sigmoid", "fold", "quantize"),
    )
    amount_cv = VirtualParameter(name="amount", range=(0, 1))
    symmetry_cv = VirtualParameter(name="symmetry", range=(-1, 1), default=0)
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
    """Mixer

    Simple 4-in mixer.

    inputs:
    * in0_cv [0, 127] <any>: Input signal.
    * in1_cv [0, 127] <any>: Input signal.
    * in2_cv [0, 127] <any>: Input signal.
    * in3_cv [0, 127] <any>: Input signal.
    * level0_cv [0, 127] <any>: Input signal level.
    * level1_cv [0, 127] <any>: Input signal level.
    * level2_cv [0, 127] <any>: Input signal level.
    * level3_cv [0, 127] <any>: Input signal level.
    * nums_cv [2, 4] init=4 round <any>: The number of input to consider.
    * type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * output_cv [0, 127]: The filtered signal.

    type: ondemand, continuous
    category: mixing
    """

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

    @on(level0_cv, edge="any")
    def level0_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(level1_cv, edge="any")
    def level1_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(level2_cv, edge="any")
    def level2_change(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process()

    @on(level3_cv, edge="any")
    def level3_change(self, value, ctx):
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
    """Dual crossfader

    Dual crossfader, proposes 2 inputs and 2 outputs.

    inputs:
    * in0_cv [0, 127] <any>: Input signal.
    * in1_cv [0, 127] <any>: Input signal.
    * in2_cv [0, 127] <any>: Input signal.
    * in3_cv [0, 127] <any>: Input signal.
    * level_cv [0, 127] <any>: Crossfader level.
    * type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * out0_cv [0, 127]: The crossfaded signal for in0 and in1.
    * out1_cv [0, 127]: The filtered signal for in2 and in3.

    type: ondemand, continuous
    category: filter
    meta: disable default output
    """

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
