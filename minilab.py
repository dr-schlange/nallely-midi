import nallely


class Set1Section(nallely.Module):
    b1 = nallely.ModuleParameter(7)
    b2 = nallely.ModuleParameter(74)
    b3 = nallely.ModuleParameter(71)
    b4 = nallely.ModuleParameter(76)


class Set2Section(nallely.Module):
    b5 = nallely.ModuleParameter(77)
    b6 = nallely.ModuleParameter(93)
    b7 = nallely.ModuleParameter(73)
    b8 = nallely.ModuleParameter(75)


class Set3Section(nallely.Module):
    b9 = nallely.ModuleParameter(114)
    b10 = nallely.ModuleParameter(18)
    b11 = nallely.ModuleParameter(19)
    b12 = nallely.ModuleParameter(16)


class Set4Section(nallely.Module):
    b13 = nallely.ModuleParameter(17)
    b14 = nallely.ModuleParameter(91)
    b15 = nallely.ModuleParameter(79)
    b16 = nallely.ModuleParameter(72)


class PadSection(nallely.Module):
    state_name = "pads"
    pads = nallely.ModulePadsOrKeys()
    p9 = nallely.ModuleParameter(22)
    p10 = nallely.ModuleParameter(23)
    p11 = nallely.ModuleParameter(24)
    p12 = nallely.ModuleParameter(25)
    p13 = nallely.ModuleParameter(26)
    p14 = nallely.ModuleParameter(27)
    p15 = nallely.ModuleParameter(28)
    p16 = nallely.ModuleParameter(29)


class KeysSection(nallely.Module):
    state_name = "keys"
    notes = nallely.ModulePadsOrKeys()
    mod = nallely.ModuleParameter(1)


class Minilab(nallely.MidiDevice):
    set1: Set1Section  # type: ignore
    set2: Set2Section  # type: ignore
    set3: Set3Section  # type: ignore
    set4: Set4Section  # type: ignore
    pads: PadSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name="MINILAB", *args, **kwargs):
        super().__init__(device_name=device_name, *args, **kwargs)

    @property
    def set1(self) -> Set1Section:
        return self.modules.set1

    @property
    def set2(self) -> Set2Section:
        return self.modules.set2

    @property
    def set3(self) -> Set3Section:
        return self.modules.set3

    @property
    def set4(self) -> Set4Section:
        return self.modules.set4

    @property
    def pads(self) -> PadSection:
        return self.modules.pads

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys