"""
Generated configuration for the Arturia - Minilab3 MIDI
"""
import nallely

class GeneralSection(nallely.Module):
    shift = nallely.ModuleParameter(9, description='Shift button')


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    mod = nallely.ModuleParameter(1)
    pitchwheel = nallely.ModulePitchwheel()


class PadsSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    p4 = nallely.ModuleParameter(105)
    p5 = nallely.ModuleParameter(106)
    p6 = nallely.ModuleParameter(107)
    p7 = nallely.ModuleParameter(108)


class ButtonsSection(nallely.Module):
    b1 = nallely.ModuleParameter(74)
    b2 = nallely.ModuleParameter(71)
    b3 = nallely.ModuleParameter(76)
    b4 = nallely.ModuleParameter(77)
    b5 = nallely.ModuleParameter(93)
    b6 = nallely.ModuleParameter(18)
    b7 = nallely.ModuleParameter(19)
    b8 = nallely.ModuleParameter(16)


class SlidersSection(nallely.Module):
    s1 = nallely.ModuleParameter(82)
    s2 = nallely.ModuleParameter(83)
    s3 = nallely.ModuleParameter(85)
    s4 = nallely.ModuleParameter(17)


class Minilab3(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    keys: KeysSection  # type: ignore
    pads: PadsSection  # type: ignore
    buttons: ButtonsSection  # type: ignore
    sliders: SlidersSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'Minilab3 MIDI',
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys

    @property
    def pads(self) -> PadsSection:
        return self.modules.pads

    @property
    def buttons(self) -> ButtonsSection:
        return self.modules.buttons

    @property
    def sliders(self) -> SlidersSection:
        return self.modules.sliders
