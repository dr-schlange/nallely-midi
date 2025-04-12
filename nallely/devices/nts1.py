from dataclasses import dataclass

from ..core import MidiDevice
from ..modules import Module, ModulePadsOrKeys, ModuleParameter


@dataclass
class ModSection(Module):
    type = ModuleParameter(88)
    time = ModuleParameter(28)
    depth = ModuleParameter(29)


@dataclass
class EGSection(Module):
    type = ModuleParameter(14)
    attack = ModuleParameter(16)
    release = ModuleParameter(19)
    tremolo_depth = ModuleParameter(20)
    tremolo_rate = ModuleParameter(21)


@dataclass
class OSCSection(Module):
    type = ModuleParameter(53)
    shape = ModuleParameter(54)
    alt = ModuleParameter(55)
    lfo_date = ModuleParameter(24)
    lfo_depth = ModuleParameter(26)


@dataclass
class FilterSection(Module):
    type = ModuleParameter(42)
    cutoff = ModuleParameter(43)
    resonance = ModuleParameter(44)
    sweep_depth = ModuleParameter(45)
    sweep_rate = ModuleParameter(46)


@dataclass
class DelaySection(Module):
    type = ModuleParameter(89)
    time = ModuleParameter(30)
    depth = ModuleParameter(31)
    mix = ModuleParameter(32, init_value=128 // 2)


@dataclass
class ReverbSection(Module):
    type = ModuleParameter(90)
    time = ModuleParameter(34)
    depth = ModuleParameter(35)
    mix = ModuleParameter(36, init_value=128 // 2)


@dataclass
class ArpSection(Module):
    pattern = ModuleParameter(117)
    intervals = ModuleParameter(118)
    length = ModuleParameter(119)


@dataclass
class KeysSection(Module):
    notes = ModulePadsOrKeys()


class NTS1(MidiDevice):
    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "NTS-1",
            modules_descr={
                "ocs": OSCSection,
                "filter": FilterSection,
                "eg": EGSection,
                "mod": ModSection,
                "delay": DelaySection,
                "reverb": ReverbSection,
                "arp": ArpSection,
                "keys": KeysSection,
            },
            **kwargs,
        )

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def ocs(self) -> OSCSection:
        return self.modules.ocs

    @property
    def eg(self) -> EGSection:
        return self.modules.eg

    @property
    def mod(self) -> ModSection:
        return self.modules.mod

    @property
    def delay(self) -> DelaySection:
        return self.modules.delay

    @property
    def reverb(self) -> ReverbSection:
        return self.modules.reverb

    @property
    def arp(self) -> ArpSection:
        return self.modules.arp

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
