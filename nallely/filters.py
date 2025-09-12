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
