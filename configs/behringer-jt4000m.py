"""
Generated configuration for the Behringer - JT-4000M MICRO
"""

import nallely


class OscillatorSection(nallely.Module):
    osc1_wave = nallely.ModuleParameter(
        24,
        accepted_values=[
            "OFF",
            "Triangle",
            "Square",
            "PWM",
            "Sawtooth",
            "Supersaw",
            "FM",
            "Noise",
        ],
    )
    osc1_type = nallely.ModuleParameter(113)
    osc1_coarse_tune = nallely.ModuleParameter(115)
    osc1_fine_tune = nallely.ModuleParameter(111)
    osc2_wave = nallely.ModuleParameter(
        25, accepted_values=["OFF", "Triangle", "Square", "PWM", "Sawtooth", "Noise"]
    )
    osc2_pwm = nallely.ModuleParameter(114)
    osc2_coarse_tune = nallely.ModuleParameter(116)
    osc2_fine_tune = nallely.ModuleParameter(112)
    balance = nallely.ModuleParameter(29, init_value=64)


class LfoSection(nallely.Module):
    lfo1_waveform = nallely.ModuleParameter(
        54, accepted_values=["Triangle", "Square", "Sawtooth"]
    )
    lfo1_rate = nallely.ModuleParameter(72)
    lfo1_amount = nallely.ModuleParameter(70)
    lfo1_destination = nallely.ModuleParameter(
        56, accepted_values=["VCF", "OSC", "PWM/Detune"]
    )
    lfo2_waveform = nallely.ModuleParameter(
        55, accepted_values=["Triangle", "Square", "Sawtooth"]
    )
    lfo2_rate = nallely.ModuleParameter(73)
    lfo2_amount = nallely.ModuleParameter(28)


class VcfSection(nallely.Module):
    cutoff = nallely.ModuleParameter(74)
    resonance = nallely.ModuleParameter(71)
    env_amount = nallely.ModuleParameter(47, range=(0, 99))
    attack = nallely.ModuleParameter(85, range=(0, 99))
    decay = nallely.ModuleParameter(86, range=(0, 99))
    sustain = nallely.ModuleParameter(87, range=(0, 99))
    release = nallely.ModuleParameter(88, range=(0, 99))


class VcaSection(nallely.Module):
    attack = nallely.ModuleParameter(81, range=(0, 99))
    decay = nallely.ModuleParameter(82, range=(0, 99))
    sustain = nallely.ModuleParameter(83, range=(0, 99))
    release = nallely.ModuleParameter(84, range=(0, 99))


class Ring_modSection(nallely.Module):
    on_off = nallely.ModuleParameter(96, accepted_values=["OFF", "ON"])
    amount = nallely.ModuleParameter(95)


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    modulation = nallely.ModuleParameter(1)
    portamento_time = nallely.ModuleParameter(5)


class Jt4000mmicro(nallely.MidiDevice):
    oscillator: OscillatorSection  # type: ignore
    lfo: LfoSection  # type: ignore
    vcf: VcfSection  # type: ignore
    vca: VcaSection  # type: ignore
    ring_mod: Ring_modSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "JT-4000M",
            **kwargs,
        )

    @property
    def oscillator(self) -> OscillatorSection:
        return self.modules.oscillator

    @property
    def lfo(self) -> LfoSection:
        return self.modules.lfo

    @property
    def vcf(self) -> VcfSection:
        return self.modules.vcf

    @property
    def vca(self) -> VcaSection:
        return self.modules.vca

    @property
    def ring_mod(self) -> Ring_modSection:
        return self.modules.ring_mod

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
