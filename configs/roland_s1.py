"""
Generated configuration for the Roland - S-1
"""
import nallely

class GeneralSection(nallely.Module):
    pan = nallely.ModuleParameter(10)
    poly_mode = nallely.ModuleParameter(80)
    transpose_sw = nallely.ModuleParameter(77)


class OscillatorSection(nallely.Module):
    ᴧ_level = nallely.ModuleParameter(19)
    ꟺ_level = nallely.ModuleParameter(20)
    bend_sens = nallely.ModuleParameter(18)
    chop_comb = nallely.ModuleParameter(104)
    chop_overtone = nallely.ModuleParameter(103)
    draw_sw = nallely.ModuleParameter(107)
    draw_multiply = nallely.ModuleParameter(102)
    lfo = nallely.ModuleParameter(13)
    pulse_width = nallely.ModuleParameter(15)
    pwm_source = nallely.ModuleParameter(16)
    range = nallely.ModuleParameter(14)
    sub_oct_type = nallely.ModuleParameter(22)
    sub_osc_level = nallely.ModuleParameter(21)
    noise_mode = nallely.ModuleParameter(78)
    noise_level = nallely.ModuleParameter(23)


class FilterSection(nallely.Module):
    frequency = nallely.ModuleParameter(74)
    resonance = nallely.ModuleParameter(71)
    envelope = nallely.ModuleParameter(24)
    lfo = nallely.ModuleParameter(25)
    keyboard_follow = nallely.ModuleParameter(26)
    bend_sens = nallely.ModuleParameter(27)


class AmpSection(nallely.Module):
    amp_envelope_mode_sw = nallely.ModuleParameter(28)


class EnvSection(nallely.Module):
    attack = nallely.ModuleParameter(73)
    decay = nallely.ModuleParameter(75)
    sustain = nallely.ModuleParameter(30)
    release = nallely.ModuleParameter(72)
    trigger_mode = nallely.ModuleParameter(29)


class LfoSection(nallely.Module):
    key_trigger = nallely.ModuleParameter(105)
    mode = nallely.ModuleParameter(79)
    modulation_depth = nallely.ModuleParameter(17)
    rate = nallely.ModuleParameter(3)
    sync = nallely.ModuleParameter(106)
    wave_form = nallely.ModuleParameter(12)


class ChordSection(nallely.Module):
    voice_2_sw = nallely.ModuleParameter(81)
    voice_2_key_shift = nallely.ModuleParameter(85)
    voice_3_sw = nallely.ModuleParameter(82)
    voice_3_key_shift = nallely.ModuleParameter(86)
    voice_4_sw = nallely.ModuleParameter(83)
    voice_4_key_shift = nallely.ModuleParameter(87)


class EffectsSection(nallely.Module):
    reverb_level = nallely.ModuleParameter(91)
    reverb_time = nallely.ModuleParameter(89)
    chorus = nallely.ModuleParameter(93)
    delay_level = nallely.ModuleParameter(92)
    delay_time = nallely.ModuleParameter(90)


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    portamento = nallely.ModuleParameter(65)
    portamento_mode = nallely.ModuleParameter(31, description='Portamento mode')
    portamento_time = nallely.ModuleParameter(5)
    modulation_wheel = nallely.ModuleParameter(1)
    fine_tune = nallely.ModuleParameter(76)
    damper_pedal = nallely.ModuleParameter(64)
    expression_pedal = nallely.ModuleParameter(11)


class S1(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    oscillator: OscillatorSection  # type: ignore
    filter: FilterSection  # type: ignore
    amp: AmpSection  # type: ignore
    env: EnvSection  # type: ignore
    lfo: LfoSection  # type: ignore
    chord: ChordSection  # type: ignore
    effects: EffectsSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'S-1',
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def oscillator(self) -> OscillatorSection:
        return self.modules.oscillator

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def amp(self) -> AmpSection:
        return self.modules.amp

    @property
    def env(self) -> EnvSection:
        return self.modules.env

    @property
    def lfo(self) -> LfoSection:
        return self.modules.lfo

    @property
    def chord(self) -> ChordSection:
        return self.modules.chord

    @property
    def effects(self) -> EffectsSection:
        return self.modules.effects

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
