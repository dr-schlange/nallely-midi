"""
Generated configuration for the drschlange - lisa
"""
import nallely

class GeneralSection(nallely.Module):
    master_volume = nallely.ModuleParameter(7, description='General Volume')
    engine_select = nallely.ModuleParameter(8, description='Engine Selection')
    sustain = nallely.ModuleParameter(64, description='Sustain (Hold notes)')
    midi_dev = nallely.ModuleParameter(127, description='Dev functions')


class ButtonsSection(nallely.Module):
    b1 = nallely.ModuleParameter(100, description='B1')
    b2 = nallely.ModuleParameter(101, description='B2')
    b3 = nallely.ModuleParameter(102, description='B3')
    b4 = nallely.ModuleParameter(103, description='B4')
    b5 = nallely.ModuleParameter(104, description='B5')


class EnvelopeSection(nallely.Module):
    attack = nallely.ModuleParameter(11, description='Envelope Attack')
    release = nallely.ModuleParameter(12, description='Envelope Release')


class FilterSection(nallely.Module):
    cutoff = nallely.ModuleParameter(74, description='Filter Cutoff')
    resonance = nallely.ModuleParameter(71, description='Filter Resonance')


class ModulationSection(nallely.Module):
    timbre = nallely.ModuleParameter(9, description='Timbre')
    timbre_mod = nallely.ModuleParameter(16, description='Timbre Modulation')
    color = nallely.ModuleParameter(10, description='Color')
    color_mod = nallely.ModuleParameter(17, description='Color Modulation')
    FM_mod = nallely.ModuleParameter(15, description='FM Modulation')


class WavetableSection(nallely.Module):
    stream_table1 = nallely.ModulePitchwheel(stream=True, channel=0)
    stream_table2 = nallely.ModulePitchwheel(stream=True, channel=1)
    stream_table3 = nallely.ModulePitchwheel(stream=True, channel=2)
    stream_table4 = nallely.ModulePitchwheel(stream=True, channel=3)
    capture_mode = nallely.ModuleParameter(122, description='Selects the type of capture mode', accepted_values=['independent wavetables', 'forward', 'backward', 'rolling', 'buf-forward-rl', 'buf-backward-lr', 'rolling-backward'])
    phase_reset = nallely.ModuleParameter(126, description='Reset the phase')
    phase_offset = nallely.ModuleParameter(125, description='Add an offset to the phase')
    retrigger = nallely.ModuleParameter(124, description='Reset the phase on note strike', accepted_values=['OFF', 'ON'])
    freeze = nallely.ModuleParameter(123, description='Freeze the current wavetables', accepted_values=['OFF', 'ON'])


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()


class Lisa(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    buttons: ButtonsSection  # type: ignore
    envelope: EnvelopeSection  # type: ignore
    filter: FilterSection  # type: ignore
    modulation: ModulationSection  # type: ignore
    wavetable: WavetableSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'LISA',
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def buttons(self) -> ButtonsSection:
        return self.modules.buttons

    @property
    def envelope(self) -> EnvelopeSection:
        return self.modules.envelope

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def modulation(self) -> ModulationSection:
        return self.modules.modulation

    @property
    def wavetable(self) -> WavetableSection:
        return self.modules.wavetable

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
