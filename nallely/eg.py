import math

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
    * mode_cv [curve, linear]: Type of transition between the states, curve or linear
    * attack_curve_cv [-6.0, 6.0] init=-4.0: Shapes the curve response of the attack in curve-mode
    * decay_curve_cv [-6.0, 6.0] init=-4.0: Shapes the curve response of the attack in curve-mode
    * release_curve_cv [-6.0, 6.0] init=-4.0: Shapes the curve response of the attack in curve-mode

    outputs:
    * output_cv [0, 1]: the generated envelope
    * soa_cv [0, 1]: rise edge at start of attack
    * sod_cv [0, 1]: rise edge at start of decay
    * sos_cv [0, 1]: rise edge at start of sustain
    * sor_cv [0, 1]: rise edge at start of release
    * eoa_cv [0, 1]: rise edge at end of attack
    * eod_cv [0, 1]: rise edge at end of decay
    * eos_cv [0, 1]: rise edge at end of sustain
    * eor_cv [0, 1]: rise edge at end of release

    type: continuous
    category: envelope-generator
    """

    gate_cv = VirtualParameter(name="gate", range=(0.0, 1.0), conversion_policy="!=0")
    attack_cv = VirtualParameter(name="attack", range=(0.0, 1.0), default=0.101)
    decay_cv = VirtualParameter(name="decay", range=(0.0, 1.0), default=0.201)
    sustain_cv = VirtualParameter(name="sustain", range=(0.0, 1.0), default=0.701)
    release_cv = VirtualParameter(name="release", range=(0.0, 1.0), default=0.301)
    mode_cv = VirtualParameter(name="mode", accepted_values=["curve", "linear"])
    attack_curve_cv = VirtualParameter(
        name="attack_curve", range=(-6.0, 6.0), default=-4.0
    )
    decay_curve_cv = VirtualParameter(
        name="decay_curve", range=(-6.0, 6.0), default=-4.0
    )
    release_curve_cv = VirtualParameter(
        name="release_curve", range=(-6.0, 6.0), default=-4.0
    )
    eor_cv = VirtualParameter(name="eor", range=(0.0, 1.0))
    eos_cv = VirtualParameter(name="eos", range=(0.0, 1.0))
    eod_cv = VirtualParameter(name="eod", range=(0.0, 1.0))
    eoa_cv = VirtualParameter(name="eoa", range=(0.0, 1.0))
    sor_cv = VirtualParameter(name="sor", range=(0.0, 1.0))
    sos_cv = VirtualParameter(name="sos", range=(0.0, 1.0))
    sod_cv = VirtualParameter(name="sod", range=(0.0, 1.0))
    soa_cv = VirtualParameter(name="soa", range=(0.0, 1.0))
    output_cv = VirtualParameter(name="output", range=(0.0, 1.0))

    def setup(self):
        ctx = super().setup()
        self._phase = "idle"
        self._time_in_phase = 0.0
        self._level = 0.0
        self._release_start_level = 0.0
        return ctx

    def debug_print(self, ctx):
        super().debug_print(ctx)
        print(f" * self._phase={self._phase!r}")
        print(f" * self._time_in_phase={self._time_in_phase!r}")
        print(f" * self._level={self._level!r}")

    @classmethod
    def _curve(cls, t: float, curve: float = 4.0) -> float:
        if abs(curve) < 1e-6:
            return t  # fallback to linear
        return (math.exp(curve * t) - 1.0) / (math.exp(curve) - 1.0)

    def sync_starts(self, soa, sod, sos, sor):
        yield soa, [self.soa_cv]
        yield sod, [self.sod_cv]
        yield sos, [self.sos_cv]
        yield sor, [self.sor_cv]

    def sync_ends(self, eoa, eod, eos, eor):
        yield eoa, [self.eoa_cv]
        yield eod, [self.eod_cv]
        yield eos, [self.eos_cv]
        yield eor, [self.eor_cv]

    @on(gate_cv, edge="rising")
    def on_gate_1(self, _, ctx):
        if self._phase in ["idle", "release"]:
            yield from self.sync_ends(0, 0, 0, 0)
            self._phase = "attack"
            yield from self.sync_starts(1, 0, 0, 0)
            self._time_in_phase = 0.0

    @on(gate_cv, edge="falling")
    def on_gate_0(self, _, ctx):
        if self._phase not in ["release", "idle"]:
            yield from self.sync_ends(0, 0, 1, 0)
            self._phase = "release"
            yield from self.sync_starts(0, 0, 0, 1)
            self._time_in_phase = 0.0
            self._release_start_level = self._level

    def main(self, ctx):
        dt = self.target_cycle_time
        self._time_in_phase += dt
        if self._phase == "attack":
            if self.attack == 0:
                self._level = 1.0
                yield from self.sync_ends(1, 0, 0, 0)
                self._phase = "decay"
                yield from self.sync_starts(0, 1, 0, 0)
                self._time_in_phase = 0.0
            else:
                t = min(1.0, self._time_in_phase / self.attack)
                if self.mode == "curve":
                    self._level = self._curve(t, curve=self.attack_curve)
                else:
                    self._level = t
                if self._level >= 1.0:
                    yield from self.sync_ends(1, 0, 0, 0)
                    self._phase = "decay"
                    yield from self.sync_starts(0, 1, 0, 0)
                    self._time_in_phase = 0.0
        elif self._phase == "decay":
            if self.decay == 0:
                self._level = self.sustain
                yield from self.sync_ends(0, 1, 0, 0)
                self._phase = "sustain"
                yield from self.sync_starts(0, 0, 1, 0)
            else:
                decay_progress = min(1.0, self._time_in_phase / self.decay)
                if self.mode == "curve":
                    shaped = self._curve(decay_progress, curve=self.decay_curve)
                else:
                    shaped = decay_progress
                self._level = 1.0 - (1.0 - self.sustain) * shaped
                if decay_progress >= 1.0:
                    yield from self.sync_ends(0, 1, 0, 0)
                    self._phase = "sustain"
                    yield from self.sync_starts(0, 0, 1, 0)
        elif self._phase == "sustain":
            self._level = self.sustain
        elif self._phase == "release":
            if self.release == 0:
                self._level = 0.0
                yield from self.sync_ends(0, 0, 0, 1)
                self._phase = "idle"
                yield from self.sync_starts(0, 0, 0, 0)
            else:
                release_progress = min(1.0, self._time_in_phase / self.release)
                if self.mode == "curve":
                    shaped = self._curve(release_progress, curve=self.release_curve)
                else:
                    shaped = release_progress
                self._level = self._release_start_level * (1.0 - shaped)
                if release_progress >= 1.0:
                    self._level = 0.0
                    yield from self.sync_ends(0, 0, 0, 1)
                    self._phase = "idle"
                    yield from self.sync_starts(0, 0, 0, 1)
        elif self._phase == "idle":
            self._level = 0.0
        return self._level


class VCA(VirtualDevice):
    """Voltage Controled Amplifier

    Simple VCA implementation with gain

    inputs:
    * input_cv [-1, 1] <any>: Input signal
    * amplitude_cv [0.0, 1.0] init=0.0 <any>: Signal amplitude (0.0 -> 0%, 1.0 -> 100%)
    * gain_cv [1.0, 2.0] init=1.0: Signal gain (default is 1.0)

    outputs:
    * output_cv [-1, 1]: The amplified signal

    type: ondemand
    category: amplitude-modulation
    """

    output_cv = VirtualParameter("output", range=(-1.0, 1.0))
    input_cv = VirtualParameter("input", range=(-1.0, 1.0))
    amplitude_cv = VirtualParameter("amplitude", range=(0.0, 1.0))
    gain_cv = VirtualParameter("gain", range=(1.0, 2.0))

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
    * input_cv [-1, 1] <any>: Input signal.
    * attack_cv [0, 99.99] init=50.0: Attack control in %.
    * release_cv [0, 99.99] init=50.0: Release control in %.
    * type_cv [envelope, slew]: Choose between Envelope Follower and Slew Limiter
    * mode_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                      ondemand = value produced when reacting to an input only.
                                      continuous = value produced at the cycle speed of the module.

    outputs:
    * output_cv [-1, 1]: The filtered signal.

    type: ondemand, continuous
    category: filter
    """

    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))
    input_cv = VirtualParameter(name="input", range=(-1.0, 1.0))
    attack_cv = VirtualParameter(name="attack", range=(0.0, 99.99), default=50.0)
    release_cv = VirtualParameter(name="release", range=(0.0, 99.99), default=50.0)
    type_cv = VirtualParameter(name="type", accepted_values=("envelope", "slew"))
    mode_cv = VirtualParameter(name="mode", accepted_values=("ondemand", "continuous"))

    def __post_init__(self, **kwargs):
        self.prev_value = 0

    def compute(self):
        prev_value = self.prev_value
        delta = self.input - prev_value  # type: ignore
        smoothing = 1.0 - ((self.attack if delta > 0 else self.release) / 100.0)  # type: ignore
        output = prev_value + smoothing * delta
        self.prev_value = output
        return output

    @on(input_cv, edge="any")
    def change_input(self, value, ctx):
        if self.mode == "ondemand":  # type: ignore
            return self.compute()

    def main(self, ctx):
        if self.mode == "continuous":  # type: ignore
            return self.compute()


class VolumeMixer(VirtualDevice):
    """Volume mixer

    Uses velocity to simulate a volume control

    inputs:
    * inA_cv [0, 127] round <any>: input A
    * volA_cv [0, 127] round <any>: volume A
    * inB_cv [0, 127] round <any>: input B
    * volB_cv [0, 127] round <any>: volume B
    * inC_cv [0, 127] round <any>: input C
    * volC_cv [0, 127] round <any>: volume C
    * inD_cv [0, 127] round <any>: input D
    * volD_cv [0, 127] round <any>: volume D

    outputs:
    * output_cv [0, 127]: the adjusted volume signal

    type: ondemand
    category: Volume
    """

    inA_cv = VirtualParameter(name="inA", range=(0.0, 127.0), conversion_policy="round")
    inB_cv = VirtualParameter(name="inB", range=(0.0, 127.0), conversion_policy="round")
    inC_cv = VirtualParameter(name="inC", range=(0.0, 127.0), conversion_policy="round")
    inD_cv = VirtualParameter(name="inD", range=(0.0, 127.0), conversion_policy="round")
    volA_cv = VirtualParameter(
        name="volA", range=(0.0, 127.0), conversion_policy="round", default=127
    )
    volB_cv = VirtualParameter(
        name="volB", range=(0.0, 127.0), conversion_policy="round", default=127
    )
    volC_cv = VirtualParameter(
        name="volC", range=(0.0, 127.0), conversion_policy="round", default=127
    )
    volD_cv = VirtualParameter(
        name="volD", range=(0.0, 127.0), conversion_policy="round", default=127
    )

    @property
    def min_range(self):
        return 0.0

    @property
    def max_range(self):
        return 127.0

    @on(volA_cv, edge="any")
    def on_volA_any(self, value, ctx):
        ctx.velocity = int(value)
        # ctx.free_note = True
        return self.inA

    @on(inA_cv, edge="any")
    def on_inA_any(self, value, ctx):
        ctx.velocity = int(self.volA)
        # ctx.free_note = True
        return value

    @on(volB_cv, edge="any")
    def on_volB_any(self, value, ctx):
        ctx.velocity = int(value)
        return self.inB

    @on(inB_cv, edge="any")
    def on_inB_any(self, value, ctx):
        ctx.velocity = int(self.volB)
        return value

    @on(volC_cv, edge="any")
    def on_volC_any(self, value, ctx):
        ctx.velocity = int(value)
        return self.inC

    @on(inC_cv, edge="any")
    def on_inC_any(self, value, ctx):
        ctx.velocity = int(self.volC)
        return value

    @on(volD_cv, edge="any")
    def on_volD_any(self, value, ctx):
        ctx.velocity = int(value)
        return self.inD

    @on(inD_cv, edge="any")
    def on_inD_any(self, value, ctx):
        ctx.velocity = int(self.volD)
        return value
