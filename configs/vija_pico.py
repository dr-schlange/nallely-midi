"""
Generated configuration for the ledlaux - vija
"""
import nallely

class GeneralSection(nallely.Module):
    master_volume = nallely.ModuleParameter(7, description='General Volume')
    engine_select = nallely.ModuleParameter(8, description='Engine Selection')
    sustain = nallely.ModuleParameter(64, description='Sustain (Hold notes)')


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


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()


class Vija(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    envelope: EnvelopeSection  # type: ignore
    filter: FilterSection  # type: ignore
    modulation: ModulationSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'Vija',
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

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
    def keys(self) -> KeysSection:
        return self.modules.keys
