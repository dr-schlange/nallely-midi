"""
Generated configuration for the KORG - minilogue
"""

import nallely


class GeneralSection(nallely.Module):
    bank_select = nallely.ModuleParameter(0)
    voice_depth = nallely.ModuleParameter(27)
    cross_mod_depth = nallely.ModuleParameter(41)
    pitch_eg_intensity = nallely.ModuleParameter(42)
    sync = nallely.ModuleParameter(80)
    ring = nallely.ModuleParameter(81)
    velocity_key_track = nallely.ModuleParameter(82)
    keyboard_track = nallely.ModuleParameter(83)


class EnvelopesSection(nallely.Module):
    amp_eg_attack = nallely.ModuleParameter(16)
    amp_eg_decay = nallely.ModuleParameter(17)
    amp_eg_sustain = nallely.ModuleParameter(18)
    amp_eg_release = nallely.ModuleParameter(19)
    eg_attack = nallely.ModuleParameter(20)
    eg_decay = nallely.ModuleParameter(21, init_value=64)
    eg_sustain = nallely.ModuleParameter(22)
    eg_release = nallely.ModuleParameter(23)


class LfoSection(nallely.Module):
    rate = nallely.ModuleParameter(24)
    depth = nallely.ModuleParameter(26)
    target = nallely.ModuleParameter(56)
    eg_mod = nallely.ModuleParameter(57)
    wave = nallely.ModuleParameter(58)


class DelaySection(nallely.Module):
    hipass = nallely.ModuleParameter(29)
    time = nallely.ModuleParameter(30)
    feedback = nallely.ModuleParameter(31)
    output_routing = nallely.ModuleParameter(88)


class VcoSection(nallely.Module):
    vco_1_pitch = nallely.ModuleParameter(34)
    vco_2_pitch = nallely.ModuleParameter(35)
    vco_1_shape = nallely.ModuleParameter(36)
    vco_2_shape = nallely.ModuleParameter(37)
    vco_1_octave = nallely.ModuleParameter(48)
    vco_2_octave = nallely.ModuleParameter(49)
    vco_1_wave = nallely.ModuleParameter(50)
    vco_2_wave = nallely.ModuleParameter(51)


class MixSection(nallely.Module):
    noise_level = nallely.ModuleParameter(33)
    vco_1_level = nallely.ModuleParameter(39)
    vco_2_level = nallely.ModuleParameter(40)


class FilterSection(nallely.Module):
    cutoff = nallely.ModuleParameter(43, init_value=127)
    resonance = nallely.ModuleParameter(44)
    eg_intensity = nallely.ModuleParameter(45)
    type = nallely.ModuleParameter(84)


class KeySection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()


class Minilogue(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    envelopes: EnvelopesSection  # type: ignore
    lfo: LfoSection  # type: ignore
    delay: DelaySection  # type: ignore
    vco: VcoSection  # type: ignore
    mix: MixSection  # type: ignore
    filter: FilterSection  # type: ignore
    keys: KeySection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "minilogue _ SOUND",
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def envelopes(self) -> EnvelopesSection:
        return self.modules.envelopes

    @property
    def lfo(self) -> LfoSection:
        return self.modules.lfo

    @property
    def delay(self) -> DelaySection:
        return self.modules.delay

    @property
    def vco(self) -> VcoSection:
        return self.modules.vco

    @property
    def mix(self) -> MixSection:
        return self.modules.mix

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def keys(self) -> KeySection:
        return self.modules.keys
