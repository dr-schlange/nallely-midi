from typing import Any

from .core import VirtualDevice, VirtualParameter, on
from .core.world import ThreadContext


class ADSREnvelope(VirtualDevice):
    """ADSR Envelope Generator

    Simple envelope generator with attack, decay, sustain, release.
    Generates an envelope from a gate:
      - when the gate is up -> triggers the envelope generation
      - when the gate is down -> closes the envelope

    inputs:
    * gate_cv [0, 1] !=0 <rising, falling>: Gate/control voltage input
    * attack_cv [0.0, 1.0] init=0.1: Attack time control in seconds
    * decay_cv [0.0, 1.0] init=0.2: Decay time control in seconds
    * sustain_cv [0.0, 1.0] init=0.7: Sustain level control (0 -> 0%, 1 -> 100%)
    * release_cv [0.0, 1.0] init=0.3: Release time control in seconds

    outputs:
    * output_cv [0, 1]: the generated envelope

    type: continuous
    category: envelope-generator
    """

    gate_cv = VirtualParameter(name="gate", range=(0, 1), conversion_policy="!=0")
    attack_cv = VirtualParameter(name="attack", range=(0.0, 1.0))
    decay_cv = VirtualParameter(name="decay", range=(0.0, 1.0))
    sustain_cv = VirtualParameter(name="sustain", range=(0.0, 1.0))
    release_cv = VirtualParameter(name="release", range=(0.0, 1.0))

    def __init__(self, attack=0.1, decay=0.2, sustain=0.7, release=0.3, **kwargs):
        self.attack = attack
        self.decay = decay
        self.sustain = sustain
        self.release = release
        self.gate = 0  # False
        super().__init__(**kwargs)

    def setup(self):
        ctx = super().setup()
        self._phase = "idle"  # 'attack', 'decay', 'sustain', 'release', 'idle'
        self._time_in_phase = 0.0
        self._level = 0.0
        self._release_start_level = 0.0
        return ctx

    def debug_print(self, ctx):
        super().debug_print(ctx)
        print(f" * {self._phase=}")
        print(f" * {self._time_in_phase=}")
        print(f" * {self._level=}")

    @on(gate_cv, edge="rising")
    def on_gate_1(self, _, ctx):
        if self._phase in ["idle", "release"]:
            self._phase = "attack"
            self._time_in_phase = 0.0

    @on(gate_cv, edge="falling")
    def on_gate_0(self, _, ctx):
        if self._phase not in ["release", "idle"]:
            self._phase = "release"
            self._time_in_phase = 0.0
            self._release_start_level = self._level

    def main(self, ctx):

        dt = self.target_cycle_time
        self._time_in_phase += dt

        if self._phase == "attack":
            if self.attack == 0:
                self._level = 1.0
                self._phase = "decay"
                self._time_in_phase = 0.0
            else:
                self._level = min(1.0, self._time_in_phase / self.attack)
                if self._level >= 1.0:
                    self._phase = "decay"
                    self._time_in_phase = 0.0

        elif self._phase == "decay":
            if self.decay == 0:
                self._level = self.sustain
                self._phase = "sustain"
            else:
                decay_progress = self._time_in_phase / self.decay
                self._level = 1.0 - (1.0 - self.sustain) * min(1.0, decay_progress)
                if decay_progress >= 1.0:
                    self._phase = "sustain"

        elif self._phase == "sustain":
            self._level = self.sustain

        elif self._phase == "release":
            if self.release == 0:
                self._level = 0.0
                self._phase = "idle"
            else:
                release_progress = min(1.0, self._time_in_phase / self.release)
                self._level = self._release_start_level * (1.0 - release_progress)
                if release_progress >= 1.0:
                    self._level = 0.0
                    self._phase = "idle"

        elif self._phase == "idle":
            self._level = 0.0

        return self._level

    @property
    def range(self):
        return (0.0, 1.0)


class VCA(VirtualDevice):
    """Voltage Controled Amplifier

    Simple VCA implementation with gain

    inputs:
    * input_cv [0, 127] <any>: Input signal
    * amplitude_cv [0.0, 1.0] init=0.0 <any>: Signal amplitude (0.0 -> 0%, 1.0 -> 100%)
    * gain_cv [1.0, 2.0] init=1.0: Signal gain (default is 1.0)

    outputs:
    * output_cv [0, 127]: The amplified signal

    type: ondemand
    category: amplitude-modulation
    """

    input_cv = VirtualParameter("input", range=(0, 127))
    amplitude_cv = VirtualParameter("amplitude", range=(0.0, 1.0))
    gain_cv = VirtualParameter("gain", range=(1.0, 2.0))

    @property
    def min_range(self):
        return 0.0

    @property
    def max_range(self):
        return 127.0

    @on(input_cv, edge="any")
    def sending_modulated_input(self, value, ctx):
        return value * self.amplitude * self.gain  # type: ignore

    @on(amplitude_cv, edge="any")
    def change_amplitude(self, value, ctx):
        if self.amplitude > 0:  # type: ignore
            return self.input * self.amplitude * self.gain  # type: ignore
        return 0


class Gate(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    gate_cv = VirtualParameter(name="gate", range=(0, 1))

    def __init__(self, **kwargs):
        self.input = 0
        self.gate = 0
        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        self._close_port("input")
        return super().setup()

    @on(input_cv, edge="both")
    def on_input(self, value, ctx):
        if self.gate > 0:
            return value

    @on(gate_cv, edge="rising")
    def opening(self, value, ctx):
        self._open_port("input")
        return self.input

    @on(gate_cv, edge="falling")
    def closing(self, value, ctx):
        self._close_port("input")
        return 0


class SampleHold(VirtualDevice):
    """Sample & Hold

    Samples a value and hold it when the trigger input is rising.

    inputs:
    * input_cv [0, 127] <both>: Input signal
    * trigger_cv [0, 1] >0 <rising>: Signal amplitude (0.0 -> 0%, 1.0 -> 100%)
    * reset_cv [0, 1] >0 <rising>: Signal gain (default is 1.0)

    outputs:
    * output_cv [0, 127]: The sampled value

    type: ondemand
    category: modulation
    """

    input_cv = VirtualParameter(name="input", range=(0, 127))
    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy=">0")

    def __init__(self, **kwargs):
        self.input = 0
        self.trigger = 0
        self.reset = 0
        super().__init__(target_cycle_time=0.005, **kwargs)

    @on(trigger_cv, edge="rising")
    def hold_value(self, value, ctx):
        return self.input

    @on(reset_cv, edge="rising")
    def reset_input(self, value, ctx):
        return 0


class EnvelopeSlew(VirtualDevice):
    """Envelope Follower & Slew Limiter

    Envelope Follower or Slew Limiter depending on the chosen type.
    The Envelope Follower tracks the amplitude of an input signal, producing a smooth envelope.
    The Slew Limiter restricts how quickly the signal can change, smoothing rapid variations.

    inputs:
    * input_cv [0, 127] <any>: Input signal.
    * attack_cv [0, 99.99] init=50.0: Attack control in %.
    * release_cv [0, 99.99] init=50.0: Release control in %.
    * type_cv [envelope, slew]: Choose between Envelope Follower and Slew Limiter
    * mode_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * output_cv [0, 127]: The filtered signal.

    type: ondemand, continuous
    category: filter
    """

    input_cv = VirtualParameter(name="input", range=(0, 127))
    attack_cv = VirtualParameter(name="attack", range=(0.0, 99.99), default=50.0)
    release_cv = VirtualParameter(name="release", range=(0.0, 99.99), default=50.0)
    type_cv = VirtualParameter(name="type", accepted_values=("envelope", "slew"))
    mode_cv = VirtualParameter(name="mode", accepted_values=("ondemand", "continuous"))

    def __post_init__(self, **kwargs):
        self.prev_value = 0

    def compute(self):
        half = self.input_cv.parameter.range[1] / 2  # type: ignore
        if self.type == "envelope":  # type: ignore
            rectified_input = abs(self.input)  # type: ignore
        else:
            rectified_input = self.input - half  # type: ignore
        prev_value = self.prev_value

        delta = rectified_input - prev_value
        smoothing = 1.0 - ((self.attack if delta > 0 else self.release) / 100.0)  # type: ignore
        output = prev_value + smoothing * delta
        self.prev_value = output

        # We need to rectify for the slew
        if self.type == "slew":  # type: ignore
            output += half
        return output

    @on(input_cv, edge="any")
    def change_input(self, value, ctx):
        if self.mode == "ondemand":  # type: ignore
            return self.compute()

    def main(self, ctx):
        if self.mode == "continuous":  # type: ignore
            return self.compute()
