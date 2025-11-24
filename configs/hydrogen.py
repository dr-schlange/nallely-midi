"""
Generated configuration for the hydrogen-music - hydrogen
"""
import nallely

class GeneralSection(nallely.Module):
    select_instrument = nallely.ModuleParameter(type='program_change')
    filter_cutoff = nallely.ModuleParameter(1, description='Filter cutoff')
    effect_level_absolute = nallely.ModuleParameter(2, description='Effect level absolute')
    effect_level_relative = nallely.ModuleParameter(3, description='Effect level relative')
    mute_toggle = nallely.ModuleParameter(4, description='Mute (toggle)')
    pitch = nallely.ModuleParameter(5, description='Instrument pitch')
    volume_absolute = nallely.ModuleParameter(6, description='Master volume absolute')
    volume_relative = nallely.ModuleParameter(7, description='Master volume relative')
    pan_absolute = nallely.ModuleParameter(8, description='Pan absolute')
    pan_relative = nallely.ModuleParameter(9, description='Pan relative')


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    portamento = nallely.ModuleParameter(22, description='Portamento Time')
    portamento_mode = nallely.ModuleParameter(23, description='Portamento Mode')
    keyboard_mode = nallely.ModuleParameter(24, description='Keyboard Mode')


class Hydrogen(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'hydrogen',
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys

