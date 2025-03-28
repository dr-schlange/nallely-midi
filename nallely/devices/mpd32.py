from dataclasses import dataclass

from ..core import MidiDevice
from ..modules import Module, ModulePadsOrKeys, ModuleParameter


@dataclass
class ButtonSection(Module):
    state_name = "buttons"
    k1 = ModuleParameter(3)
    k2 = ModuleParameter(9)
    k3 = ModuleParameter(14)
    k4 = ModuleParameter(15)
    k5 = ModuleParameter(16)
    k6 = ModuleParameter(17)
    k7 = ModuleParameter(18)
    k8 = ModuleParameter(19)


@dataclass
class SliderSection(Module):
    state_name = "sliders"
    f1 = ModuleParameter(20)
    f2 = ModuleParameter(21)
    f3 = ModuleParameter(22)
    f4 = ModuleParameter(23)
    f5 = ModuleParameter(24)
    f6 = ModuleParameter(25)
    f7 = ModuleParameter(26)
    f8 = ModuleParameter(27)
    s1 = ModuleParameter(20)
    s2 = ModuleParameter(21)
    s3 = ModuleParameter(22)
    s4 = ModuleParameter(23)
    s5 = ModuleParameter(24)
    s6 = ModuleParameter(25)
    s7 = ModuleParameter(26)
    s8 = ModuleParameter(27)


@dataclass
class PadSection(Module):
    state_name = "pads"
    pads = ModulePadsOrKeys()


class MPD32(MidiDevice):
    def __init__(self, device_name=None, **kwargs):
        super().__init__(
            device_name=device_name or "MPD32",
            read_input_only=True,
            modules_descr=[ButtonSection, PadSection, SliderSection],
            **kwargs
        )
