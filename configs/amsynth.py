"""
Generated configuration for the nickdowell - amsynth
"""

import nallely


class GeneralSection(nallely.Module):
    bank_select = nallely.ModuleParameter(0)
    filter_velocity_sens = nallely.ModuleParameter(20, init_value=127)
    amp_velocity_sens = nallely.ModuleParameter(21, init_value=127)


class OscillatorsSection(nallely.Module):
    osc1_waveform = nallely.ModuleParameter(103, init_value=64)
    osc1_shape = nallely.ModuleParameter(104, init_value=64)
    osc2_waveform = nallely.ModuleParameter(105, init_value=64)
    osc2_shape = nallely.ModuleParameter(106, init_value=64)
    osc2_oct = nallely.ModuleParameter(108, init_value=64)
    osc2_semitone = nallely.ModuleParameter(109, init_value=64)
    osc2_detune = nallely.ModuleParameter(110, init_value=64)
    sync_oscillators = nallely.ModuleParameter(107, init_value=64)
    mix = nallely.ModuleParameter(111, init_value=64)
    ring_mod = nallely.ModuleParameter(112, init_value=64)


class AmpSection(nallely.Module):
    volume = nallely.ModuleParameter(7, init_value=64)
    drive = nallely.ModuleParameter(15)
    attack = nallely.ModuleParameter(57, init_value=64)
    decay = nallely.ModuleParameter(58, init_value=64)
    sustain = nallely.ModuleParameter(59, init_value=64)
    release = nallely.ModuleParameter(60, init_value=64)


class FilterSection(nallely.Module):
    type = nallely.ModuleParameter(47, init_value=64)
    slope = nallely.ModuleParameter(48)
    cutoff = nallely.ModuleParameter(50)
    resonance = nallely.ModuleParameter(49)
    key_track = nallely.ModuleParameter(51, init_value=127)
    env_amount = nallely.ModuleParameter(52, init_value=127)
    attack = nallely.ModuleParameter(53)
    decay = nallely.ModuleParameter(54, init_value=64)
    sustain = nallely.ModuleParameter(55, init_value=64)
    release = nallely.ModuleParameter(56, init_value=64)


class LfoSection(nallely.Module):
    waveform = nallely.ModuleParameter(118, init_value=64)
    speed = nallely.ModuleParameter(119, init_value=64)
    target = nallely.ModuleParameter(117, init_value=64)
    freq_mod_amount = nallely.ModuleParameter(1, description="LFO Freq Mod Amount")
    filter_mod_amount = nallely.ModuleParameter(116, init_value=64)
    amp_mod_amount = nallely.ModuleParameter(115, init_value=64)


class ReverbSection(nallely.Module):
    amount = nallely.ModuleParameter(91, init_value=64)
    size = nallely.ModuleParameter(92, init_value=64)
    stereo = nallely.ModuleParameter(93, init_value=64)
    damping = nallely.ModuleParameter(94, init_value=64)


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    portamento = nallely.ModuleParameter(22)
    portamento_mode = nallely.ModuleParameter(23)
    keyboard_mode = nallely.ModuleParameter(24)


class Amsynth(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    oscillators: OscillatorsSection  # type: ignore
    amp: AmpSection  # type: ignore
    filter: FilterSection  # type: ignore
    lfo: LfoSection  # type: ignore
    reverb: ReverbSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "amsynth",
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def oscillators(self) -> OscillatorsSection:
        return self.modules.oscillators

    @property
    def amp(self) -> AmpSection:
        return self.modules.amp

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def lfo(self) -> LfoSection:
        return self.modules.lfo

    @property
    def reverb(self) -> ReverbSection:
        return self.modules.reverb

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
