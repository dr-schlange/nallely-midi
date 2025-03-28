from dataclasses import dataclass

from ..core import MidiDevice
from ..modules import KeySection, Module, ModuleParameter


@dataclass
class ModSection(Module):
    state_name = "mod"
    type = ModuleParameter(88)
    time = ModuleParameter(28)
    depth = ModuleParameter(29)


@dataclass
class EGSection(Module):
    state_name = "eg"
    type = ModuleParameter(14)
    attack = ModuleParameter(16)
    release = ModuleParameter(19)
    tremolo_depth = ModuleParameter(20)
    tremolo_rate = ModuleParameter(21)


@dataclass
class OSCSection(Module):
    state_name = "osc"
    type = ModuleParameter(53)
    shape = ModuleParameter(54)
    alt = ModuleParameter(55)
    lfo_date = ModuleParameter(24)
    lfo_depth = ModuleParameter(26)


@dataclass
class FilterSection(Module):
    state_name = "filter"
    type = ModuleParameter(42)
    cutoff = ModuleParameter(43)
    resonance = ModuleParameter(44)
    sweep_depth = ModuleParameter(45)
    sweep_rate = ModuleParameter(46)


@dataclass
class DelaySection(Module):
    state_name = "delay"
    type = ModuleParameter(89)
    time = ModuleParameter(30)
    depth = ModuleParameter(31)
    mix = ModuleParameter(32)


@dataclass
class ReverbSection(Module):
    state_name = "reverb"
    type = ModuleParameter(90)
    time = ModuleParameter(34)
    depth = ModuleParameter(35)
    mix = ModuleParameter(36)


@dataclass
class ArpSection(Module):
    state_name = "arp"
    pattern = ModuleParameter(117)
    intervals = ModuleParameter(118)
    length = ModuleParameter(119)


class NTS1(MidiDevice):
    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "NTS-1",
            modules_descr=[
                OSCSection,
                FilterSection,
                EGSection,
                ModSection,
                DelaySection,
                ReverbSection,
                ArpSection,
                KeySection,
            ],
            **kwargs,
        )
