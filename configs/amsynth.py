"""
Generated configuration for the nickdowell - amsynth
"""

import nallely


class GeneralSection(nallely.Module):
    bank_select = nallely.ModuleParameter(0, description="Change sound bank")
    preset_select = nallely.ModuleParameter(type="program_change")
    filter_velocity_sens = nallely.ModuleParameter(
        20, init_value=127, description="Filter Velocity Sensitivity"
    )
    amp_velocity_sens = nallely.ModuleParameter(
        21, init_value=127, description="Amp Velocity Sensitivity"
    )


class OscillatorsSection(nallely.Module):
    osc1_waveform = nallely.ModuleParameter(
        103,
        init_value=64,
        description="Oscillator 1 Waveform",
        accepted_values=[
            "Sine",
            "Square/Pulse",
            "Triangle/Sawtooth",
            "White Noise",
            "White Noise + Sample&Hold",
        ],
    )
    osc1_shape = nallely.ModuleParameter(
        104, init_value=64, description="Oscillator 1 Shape"
    )
    osc2_waveform = nallely.ModuleParameter(
        105,
        init_value=64,
        description="Oscillator 2 Waveform",
        accepted_values=[
            "Sine",
            "Square/Pulse",
            "Triangle/Sawtooth",
            "White Noise",
            "White Noise + Sample&Hold",
        ],
    )
    osc2_shape = nallely.ModuleParameter(
        106, init_value=64, description="Oscillator 2 Shape"
    )
    osc2_oct = nallely.ModuleParameter(
        108,
        init_value=64,
        description="Oscillator 2 Range",
        accepted_values=[
            "-3 oct",
            "-2 oct",
            "-1 oct",
            "+0 oct",
            "+1 oct",
            "+2 oct",
            "+3 oct",
            "+4 oct",
        ],
    )
    osc2_semitone = nallely.ModuleParameter(
        109,
        init_value=64,
        description="Oscillator 2 Pitch",
        accepted_values=[
            "-12 semitones",
            "-11 semitones",
            "-10 semitones",
            "-9 semitones",
            "-8 semitones",
            "-7 semitones",
            "-6 semitones",
            "-5 semitones",
            "-4 semitones",
            "-3 semitones",
            "-2 semitones",
            "-1 semitones",
            "+0 semitones",
            "+1 semitones",
            "+2 semitones",
            "+3 semitones",
            "+4 semitones",
            "+5 semitones",
            "+6 semitones",
            "+7 semitones",
            "+8 semitones",
            "+9 semitones",
            "+10 semitones",
            "+11 semitones",
            "+12 semitones",
        ],
    )
    osc2_detune = nallely.ModuleParameter(
        110, init_value=64, description="Oscillator 2 Detune"
    )
    sync_oscillators = nallely.ModuleParameter(
        107,
        init_value=64,
        description="Sync Oscillators",
        accepted_values=["OFF", "ON"],
    )
    mix = nallely.ModuleParameter(111, init_value=64, description="Oscillator Mix")
    ring_mod = nallely.ModuleParameter(112, init_value=64, description="Ring Modulator")


class AmpSection(nallely.Module):
    volume = nallely.ModuleParameter(7, init_value=64, description="Master Volume")
    panning = nallely.ModuleParameter(10, init_value=64, description="Panning sound")
    drive = nallely.ModuleParameter(15, description="Distortion Crunch")
    attack = nallely.ModuleParameter(57, init_value=64, description="Amp Attack")
    decay = nallely.ModuleParameter(58, init_value=64, description="Amp Decay")
    sustain = nallely.ModuleParameter(59, init_value=64, description="Amp Sustain")
    release = nallely.ModuleParameter(60, init_value=64, description="Amp Release")


class FilterSection(nallely.Module):
    type = nallely.ModuleParameter(
        47,
        init_value=64,
        description="Filter Type",
        accepted_values=["Low-pass", "High-pass", "Band-pass", "Notch", "Shortcut"],
    )
    slope = nallely.ModuleParameter(
        48, description="Filter Slope", accepted_values=["12dB/oct", "24dB/oct"]
    )
    cutoff = nallely.ModuleParameter(50, description="Filter Cutoff")
    resonance = nallely.ModuleParameter(49, description="Filter Resonnance")
    key_track = nallely.ModuleParameter(
        51, init_value=127, description="Filter Keyboard Track"
    )
    env_amount = nallely.ModuleParameter(
        52, init_value=127, description="Filter Env Amount"
    )
    attack = nallely.ModuleParameter(53, description="Filter Env Attack")
    decay = nallely.ModuleParameter(54, init_value=64, description="Filter Env Decay")
    sustain = nallely.ModuleParameter(
        55, init_value=64, description="Filter Env Sustain"
    )
    release = nallely.ModuleParameter(
        56, init_value=64, description="Filter Env Release"
    )


class LfoSection(nallely.Module):
    waveform = nallely.ModuleParameter(
        118,
        init_value=64,
        description="LFO Waveform",
        accepted_values=[
            "Sine",
            "Square",
            "Triangle",
            "Noise",
            "Noise + Sample&Hold",
            "Sawtooth",
            "Inverted Sawtooth",
        ],
    )
    speed = nallely.ModuleParameter(119, init_value=64, description="LFO Speed")
    target = nallely.ModuleParameter(
        117,
        init_value=64,
        description="LFO Target",
        accepted_values=["Osc 1+2", "Osc 1", "Osc 2"],
    )
    freq_mod_amount = nallely.ModuleParameter(1, description="LFO Freq Mod Amount")
    filter_mod_amount = nallely.ModuleParameter(
        116, init_value=64, description="Filter Mod Amount"
    )
    amp_mod_amount = nallely.ModuleParameter(
        115, init_value=64, description="Amp Mod Amount"
    )


class ReverbSection(nallely.Module):
    amount = nallely.ModuleParameter(91, init_value=64, description="Reverb Wet")
    size = nallely.ModuleParameter(92, init_value=64, description="Reverb Room Size")
    stereo = nallely.ModuleParameter(93, init_value=64, description="Reverb Width")
    damping = nallely.ModuleParameter(94, init_value=64, description="Reverb Damp")


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    portamento = nallely.ModuleParameter(22, description="Portamento Time")
    portamento_mode = nallely.ModuleParameter(
        23, description="Portamento Mode", accepted_values=["Always", "Legato"]
    )
    keyboard_mode = nallely.ModuleParameter(
        24, description="Keyboard Mode", accepted_values=["Poly", "Mono", "Legato"]
    )


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
