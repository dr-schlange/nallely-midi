import weakref
from decimal import Decimal

from nallely.core import (
    Int,
    MidiDevice,
    ModulePadsOrKeys,
    ModuleParameter,
    ModulePitchwheel,
    PadsOrKeysInstance,
    ParameterInstance,
    PitchwheelInstance,
    VirtualDevice,
    VirtualParameter,
)
from nallely.core import Module as MidiSection
from nallely.core.links import Link
from nallely.core.scaler import Scaler

NL = "\n"


_PRIMITIVES = set()


def primitive(foo):
    _PRIMITIVES.add(foo.__name__)
    return foo


class NProxy:
    _registry = {}

    def __init__(self, obj, addr=None):
        self.obj = weakref.proxy(obj, self.clean_ref)
        self.addr = addr

    def clean_ref(self, obj):
        try:
            del self._registry[obj.uuid]
        except ReferenceError:
            pass

    @classmethod
    def get(cls, addr):
        return cls._registry[addr]

    @classmethod
    def of(cls, component, uid=None):
        match component:
            case VirtualDevice():
                try:
                    return cls._registry[component.uuid]
                except KeyError:
                    device = NVirtDev(component, uid)
                    cls._registry[component.uuid] = device
                    return device
            case MidiDevice():
                try:
                    return cls._registry[component.uuid]
                except KeyError:
                    device = NMidiDev(component, uid)
                    cls._registry[component.uuid] = device
                    return device
            case VirtualParameter() | ParameterInstance():
                return NVirtParameter(component, uid)
            case MidiSection():
                return NMidiSection(component, uid)
            case Link():
                return NLink(component, uid)
            case Scaler():
                return NScaler(component, uid)
            case ModuleParameter() | Int():
                return NMidiParameter(component, uid)
            case ModulePadsOrKeys() | PadsOrKeysInstance():
                return NKeys(component, uid)
            case ModulePitchwheel() | PitchwheelInstance():
                return NMidiPitchwheel(component, uid)
        raise ValueError(
            f"Instance of {component.__class__} cannot be proxied by {cls.__name__}"
        )

    @classmethod
    def generate_prelude(cls):
        # nport is temporary, until I implement strings
        return """
: nport
    :
    ['] lit ,
    latest @ >nfa ,
    ['] @ ,
    ['] exit ,
    0 state !
;
: velocity
    8 LSHIFT OR
;
"""

    def generate_vocab(self, existing_vocab):
        raise NotImplementedError(f"No vocab for {self.obj}")


class NMidiDev(NProxy):
    def generate_vocab(self, existing_vocab):
        obj = self.obj
        return f"""
: {obj.uid()} {obj.uuid} ;
: {obj.uid()}@ {obj.uuid} nread ;
: {obj.uid()}! {obj.uuid} nwrite ;
: {obj.uid()}/noteon {obj.uuid} noteon ;
: {obj.uid()}/noteoff {obj.uuid} noteoff ;
{NL.join(self.generate_section_vocab(existing_vocab))}
"""

    def generate_section_vocab(self, existing_vocab):
        obj = self.obj
        for section in obj.all_sections():
            section_name = section.state_name
            if section_name in existing_vocab:
                continue
            yield f"nport {section_name}"
            section_proxy = NProxy.of(section)
            yield section_proxy.generate_vocab(existing_vocab)

    @primitive
    def nread(self, forthvm):
        obj = self.obj
        section = forthvm.popd().lower()
        port = forthvm.popd().lower()
        if not hasattr(obj, section):
            forthvm.print(f"Section {section} doesn't exist for {obj.uid()}")
            return None
        section_obj = getattr(obj, section)
        if not hasattr(section_obj, port):
            forthvm.print(
                f"Port {port} doesn't exist for section {section} of {obj.uid()}"
            )
            return None

        return getattr(section_obj, port)

    @primitive
    def nwrite(self, forthvm):
        obj = self.obj
        section = forthvm.popd().lower()
        port = forthvm.popd().lower()
        value = forthvm.popd()
        if not hasattr(obj, section):
            forthvm.print(f"Section {section} doesn't exist for {obj.uid()}")
            return None
        section_obj = getattr(obj, section)
        if not hasattr(section_obj, port):
            forthvm.print(
                f"Port {port} doesn't exist for section {section} of {obj.uid()}"
            )
            return None
        return setattr(section_obj, port, value)

    @primitive
    def noteon(self, forthvm):
        obj = self.obj
        notevelocity = forthvm.popd()
        note = notevelocity & 0xFF
        velocity = (notevelocity >> 8) & 0xFF
        obj.note_on(int(note), velocity=int(velocity) if velocity else 127)

    @primitive
    def noteoff(self, forthvm):
        obj = self.obj
        notevelocity = forthvm.popd()
        note = notevelocity & 0xFF
        velocity = (notevelocity >> 8) & 0xFF
        obj.note_off(int(note), velocity=int(velocity) if velocity else 127)

    @primitive
    def allnotesoff(self, forthvm):
        self.obj.all_notes_off()


class NVirtDev(NProxy):
    def generate_vocab(self, existing_vocab):
        obj = self.obj
        return f"""
: {obj.uid()}@ {obj.uuid} nread ;
: {obj.uid()}! {obj.uuid} nwrite ;
{NL.join(self.generate_port_vocab(existing_vocab))}
"""

    def generate_port_vocab(self, existing_vocab):
        obj = self.obj
        for port in obj.all_parameters():
            if port.name in existing_vocab:
                continue
            yield f"nport {port.name}"
            if port.accepted_values:
                for accepted_value in port.accepted_values:
                    yield f"nport {port.name}/{accepted_value}"

    @primitive
    def nread(self, forthvm):
        obj = self.obj
        port = forthvm.popd().lower()
        if not hasattr(obj, port):
            forthvm.print(f"Port {port} doesn't exist for {obj.uid()}")
            return None
        value = getattr(obj, port)
        if isinstance(value, Decimal):
            return float(value)
        return value

    @primitive
    def nwrite(self, forthvm):
        obj = self.obj
        port = forthvm.popd().lower()
        value = forthvm.popd()
        if not hasattr(obj, port):
            forthvm.print(f"Port {port} doesn't exist for {obj.uid()}")
            return
        obj.set_parameter(port.lower(), value)


class NMidiSection(NProxy):
    def generate_vocab(self, existing_vocab):
        return f"""
{NL.join(self.generate_port_vocab(existing_vocab))}
"""

    def generate_port_vocab(self, existing_vocab):
        obj = self.obj
        for port in obj.all_parameters():
            if port.name in existing_vocab:
                continue
            yield f"nport {port.name}"
        for port in obj.meta.pitchwheels:
            if port.name in existing_vocab:
                continue
            yield f"nport {port.name}"
        keys = obj.meta.pads_or_keys
        if keys:
            yield f"nport {keys.name}"


class NVirtParameter(NProxy): ...


class NKeys(NProxy): ...


class NMidiParameter(NProxy): ...


class NMidiPitchwheel(NProxy): ...


class NLink(NProxy): ...


class NScaler(NProxy): ...


class NBridge:
    def __init__(self, forth_display=None):
        self.forth_display = forth_display or print

    def init(self, forthvm):
        def dispatch(self, primitive_name, forthvm):
            addr = forthvm.popd()
            obj = None
            try:
                obj = NProxy.get(addr)
                value = getattr(obj, primitive_name)(forthvm)
                if value is not None:
                    forthvm.pushd(value)
            except KeyError:
                self.forth_display(f"Device at address {addr} doesn't exist")
            except AttributeError:
                self.forth_display(f"{obj} does not understands {primitive_name}")

        for k in _PRIMITIVES:
            forthvm._register_primitive(
                k.upper(), lambda k=k: dispatch(self, k, forthvm)
            )
