"""
Generated configuration for the Nallely - Bridge
"""

import mido

##
# A Bridge device is a MIDI device that opens on a virtual port, exposing raw CC and notes as values.
# This kind of device let's the user create a special port that will be visible by Jack and other softwares.
from .midi_device import (
    MidiDevice,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
    ModulePitchwheel,
)
from .world import no_registration


@no_registration
class Bridge(MidiDevice):
    instance_number = 0

    def __init__(self, device_name=None, *args, **kwargs):
        self.virtual_port_name = device_name or f"NallelyBridge{self.instance_number}"
        kwargs.pop(
            "autoconnect", None
        )  # We ditch the auto-connect to avoid connection on the wrong port
        super().__init__(
            *args,
            device_name=self.virtual_port_name,
            autoconnect=False,
            **kwargs,
        )
        self.instance_uid = self.instance_number
        self.instance_number += 1
        # self.inport = mido.open_input(f"{self.virtual_port_name}", virtual=True)  # type: ignore mido error
        # self.outport = mido.open_output(f"{self.virtual_port_name}", virtual=True)  # type: ignore mido error
        self.inport = mido.open_ioport(f"{self.virtual_port_name}", virtual=True)
        self.outport = self.inport

    def uid(self):
        return f"{self.__class__.__name__}{self.instance_uid}"


class X0Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_1 = ModuleParameter(1)
    cc_2 = ModuleParameter(2)
    cc_3 = ModuleParameter(3)
    cc_4 = ModuleParameter(4)
    cc_5 = ModuleParameter(5)
    cc_6 = ModuleParameter(6)
    cc_7 = ModuleParameter(7)
    cc_8 = ModuleParameter(8)
    cc_9 = ModuleParameter(9)
    cc_10 = ModuleParameter(10)
    cc_11 = ModuleParameter(11)
    cc_12 = ModuleParameter(12)
    cc_13 = ModuleParameter(13)
    cc_14 = ModuleParameter(14)
    cc_15 = ModuleParameter(15)
    cc_16 = ModuleParameter(16)


class X1Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_17 = ModuleParameter(17)
    cc_18 = ModuleParameter(18)
    cc_19 = ModuleParameter(19)
    cc_20 = ModuleParameter(20)
    cc_21 = ModuleParameter(21)
    cc_22 = ModuleParameter(22)
    cc_23 = ModuleParameter(23)
    cc_24 = ModuleParameter(24)
    cc_25 = ModuleParameter(25)
    cc_26 = ModuleParameter(26)
    cc_27 = ModuleParameter(27)
    cc_28 = ModuleParameter(28)
    cc_29 = ModuleParameter(29)
    cc_30 = ModuleParameter(30)
    cc_31 = ModuleParameter(31)
    cc_32 = ModuleParameter(32)


class X2Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_33 = ModuleParameter(33)
    cc_34 = ModuleParameter(34)
    cc_35 = ModuleParameter(35)
    cc_36 = ModuleParameter(36)
    cc_37 = ModuleParameter(37)
    cc_38 = ModuleParameter(38)
    cc_39 = ModuleParameter(39)
    cc_40 = ModuleParameter(40)
    cc_41 = ModuleParameter(41)
    cc_42 = ModuleParameter(42)
    cc_43 = ModuleParameter(43)
    cc_44 = ModuleParameter(44)
    cc_45 = ModuleParameter(45)
    cc_46 = ModuleParameter(46)
    cc_47 = ModuleParameter(47)
    cc_48 = ModuleParameter(48)


class X3Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_49 = ModuleParameter(49)
    cc_50 = ModuleParameter(50)
    cc_51 = ModuleParameter(51)
    cc_52 = ModuleParameter(52)
    cc_53 = ModuleParameter(53)
    cc_54 = ModuleParameter(54)
    cc_55 = ModuleParameter(55)
    cc_56 = ModuleParameter(56)
    cc_57 = ModuleParameter(57)
    cc_58 = ModuleParameter(58)
    cc_59 = ModuleParameter(59)
    cc_60 = ModuleParameter(60)
    cc_61 = ModuleParameter(61)
    cc_62 = ModuleParameter(62)
    cc_63 = ModuleParameter(63)
    cc_64 = ModuleParameter(64)


class X4Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_65 = ModuleParameter(65)
    cc_66 = ModuleParameter(66)
    cc_67 = ModuleParameter(67)
    cc_68 = ModuleParameter(68)
    cc_69 = ModuleParameter(69)
    cc_70 = ModuleParameter(70)
    cc_71 = ModuleParameter(71)
    cc_72 = ModuleParameter(72)
    cc_73 = ModuleParameter(73)
    cc_74 = ModuleParameter(74)
    cc_75 = ModuleParameter(75)
    cc_76 = ModuleParameter(76)
    cc_77 = ModuleParameter(77)
    cc_78 = ModuleParameter(78)
    cc_79 = ModuleParameter(79)
    cc_80 = ModuleParameter(80)


class X5Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_81 = ModuleParameter(81)
    cc_82 = ModuleParameter(82)
    cc_83 = ModuleParameter(83)
    cc_84 = ModuleParameter(84)
    cc_85 = ModuleParameter(85)
    cc_86 = ModuleParameter(86)
    cc_87 = ModuleParameter(87)
    cc_88 = ModuleParameter(88)
    cc_89 = ModuleParameter(89)
    cc_90 = ModuleParameter(90)
    cc_91 = ModuleParameter(91)
    cc_92 = ModuleParameter(92)
    cc_93 = ModuleParameter(93)
    cc_94 = ModuleParameter(94)
    cc_95 = ModuleParameter(95)
    cc_96 = ModuleParameter(96)


class X6Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_97 = ModuleParameter(97)
    cc_98 = ModuleParameter(98)
    cc_99 = ModuleParameter(99)
    cc_100 = ModuleParameter(100)
    cc_101 = ModuleParameter(101)
    cc_102 = ModuleParameter(102)
    cc_103 = ModuleParameter(103)
    cc_104 = ModuleParameter(104)
    cc_105 = ModuleParameter(105)
    cc_106 = ModuleParameter(106)
    cc_107 = ModuleParameter(107)
    cc_108 = ModuleParameter(108)
    cc_109 = ModuleParameter(109)
    cc_110 = ModuleParameter(110)
    cc_111 = ModuleParameter(111)
    cc_112 = ModuleParameter(112)


class X7Section(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    cc_113 = ModuleParameter(113)
    cc_114 = ModuleParameter(114)
    cc_115 = ModuleParameter(115)
    cc_116 = ModuleParameter(116)
    cc_117 = ModuleParameter(117)
    cc_118 = ModuleParameter(118)
    cc_119 = ModuleParameter(119)
    cc_120 = ModuleParameter(120)
    cc_121 = ModuleParameter(121)
    cc_122 = ModuleParameter(122)
    cc_123 = ModuleParameter(123)
    cc_124 = ModuleParameter(124)
    cc_125 = ModuleParameter(125)
    cc_126 = ModuleParameter(126)
    cc_127 = ModuleParameter(127)


class GeneralSection(Module):
    notes = ModulePadsOrKeys()
    pitchwheel = ModulePitchwheel()
    mod = ModuleParameter(1)
    volume = ModuleParameter(7)
    panning = ModuleParameter(10)
    expression = ModuleParameter(11)
    sustain = ModuleParameter(64)
    portamento = ModuleParameter(65)
    portamento_time = ModuleParameter(5)
    filter_q = ModuleParameter(71)
    filter_freq = ModuleParameter(74)


class MIDIBridge(Bridge):
    X0: X0Section  # type: ignore
    X1: X1Section  # type: ignore
    X2: X2Section  # type: ignore
    X3: X3Section  # type: ignore
    X4: X4Section  # type: ignore
    X5: X5Section  # type: ignore
    X6: X6Section  # type: ignore
    X7: X7Section  # type: ignore
    general: GeneralSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or f"NallelyBridge{self.instance_number}",
            **kwargs,
        )

    @property
    def X0(self) -> X0Section:
        return self.modules.X0

    @property
    def X1(self) -> X1Section:
        return self.modules.X1

    @property
    def X2(self) -> X2Section:
        return self.modules.X2

    @property
    def X3(self) -> X3Section:
        return self.modules.X3

    @property
    def X4(self) -> X4Section:
        return self.modules.X4

    @property
    def X5(self) -> X5Section:
        return self.modules.X5

    @property
    def X6(self) -> X6Section:
        return self.modules.X6

    @property
    def X7(self) -> X7Section:
        return self.modules.X7

    @property
    def general(self) -> GeneralSection:
        return self.modules.general
