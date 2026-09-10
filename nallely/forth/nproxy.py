from nallely.core import (
    MidiDevice,
)
from nallely.core import Module as MidiSection
from nallely.core import (
    ModulePadsOrKeys,
    ModuleParameter,
    ModulePitchwheel,
    VirtualDevice,
    VirtualParameter,
)
from nallely.core.links import Link
from nallely.core.scaler import Scaler


class NProxy:
    def __init__(self, addr, obj):
        self.addr = addr
        self.obj = obj

    @classmethod
    def of(cls, component, uid):
        match component:
            case VirtualDevice():
                return NVirtDev(uid, component)
            case MidiDevice():
                return NMidiDev(uid, component)
            case VirtualParameter():
                return NVirtParameter(uid, component)
            case MidiSection():
                return NMidiSection(uid, component)
            case Link():
                return NLink(uid, component)
            case Scaler():
                return NScaler(uid, component)
            case ModuleParameter():
                return NMidiParameter(uid, component)
            case ModulePadsOrKeys():
                return NKeys(uid, component)
            case ModulePitchwheel():
                return NMidiPitchwheel(uid, component)

    @classmethod
    def generate_prelude(cls):
        return """
: nport
    :
    ['] lit ,
    latest @ >nfa ,
    ['] @ ,
    ['] exit ,
    0 state !
;
"""

    def generate_vocab(self):
        raise NotImplementedError(f"No vocab for {self.obj}")


class NMidiDev(NProxy): ...


class NVirtDev(NProxy):
    def generate_vocab(self):
        NL = "\n"
        # nport is temporary, until I implement strings
        return f"""
: {self.obj.uid()}@ {self.obj.uuid} nread ;
: {self.obj.uid()}! {self.obj.uuid} nwrite ;
{NL.join(self.generate_port_vocab())}
"""

    def generate_port_vocab(self):
        for port in self.obj.all_parameters():
            yield f"nport {port.name} ; "
            if port.accepted_values:
                for accepted_value in port.accepted_values:
                    yield f"nport {port.name}/{accepted_value}"

    def generate_vocab_hints(self):
        return (port.name for port in self.obj.all_parameters())

    def nread(self, port):
        return float(getattr(self.obj, port.lower()))

    def nwrite(self, port, value):
        self.obj.set_parameter(port.lower(), value)


class NMidiSection(NProxy): ...


class NVirtParameter(NProxy): ...


class NKeys(NProxy): ...


class NMidiParameter(NProxy): ...


class NMidiPitchwheel(NProxy): ...


class NLink(NProxy): ...


class NScaler(NProxy): ...
