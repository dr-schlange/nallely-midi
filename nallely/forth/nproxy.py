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

    def __init__(self, obj):
        if hasattr(obj, "uuid"):
            self.obj = weakref.proxy(
                obj, lambda o, uuid=obj.uuid: self.clean_ref(o, uuid)
            )
        else:
            self.obj = weakref.proxy(obj)

    def clean_ref(self, obj, uuid):
        try:
            del self._registry[obj.uuid]
        except ReferenceError:
            del self._registry[uuid]

    @classmethod
    def get(cls, uuid):
        return cls._registry[uuid]

    @classmethod
    def of(cls, component, uid=None):
        match component:
            case VirtualDevice():
                try:
                    return cls._registry[component.uuid]
                except KeyError:
                    device = NVirtDev(component)
                    cls._registry[component.uuid] = device
                    return device
            case MidiDevice():
                try:
                    return cls._registry[component.uuid]
                except KeyError:
                    device = NMidiDev(component)
                    cls._registry[component.uuid] = device
                    return device
            case VirtualParameter() | ParameterInstance():
                return NVirtParameter(component)
            case MidiSection():
                return NMidiSection(component)
            case Link():
                return NLink(component)
            case Scaler():
                return NScaler(component)
            case ModuleParameter() | Int():
                return NMidiParameter(component)
            case ModulePadsOrKeys() | PadsOrKeysInstance():
                return NKeys(component)
            case ModulePitchwheel() | PitchwheelInstance():
                return NMidiPitchwheel(component)
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
: {obj.uid()}/allnotesoff {obj.uuid} allnotesoff ;
: {obj.uid()}/kill {obj.uuid} nkill ;
{NL.join(self.generate_section_vocab(existing_vocab))}
"""

    def generate_section_vocab(self, existing_vocab):
        obj = self.obj
        for section in obj.all_sections():
            section_proxy = NProxy.of(section)
            yield section_proxy.generate_vocab(existing_vocab)

    @primitive
    def nread(self, forthvm):
        obj = self.obj
        port_section = forthvm.popd()
        port, section = port_section.rsplit("/", 1)
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
        port_section = forthvm.popd()
        port, section = port_section.rsplit("/", 1)
        if not hasattr(obj, section):
            forthvm.print(f"Section {section} doesn't exist for {obj.uid()}")
            return
        section_obj = getattr(obj, section)
        value = forthvm.popd()
        if not hasattr(section_obj, port):
            forthvm.print(
                f"Port {port} doesn't exist for section {section} of {obj.uid()}"
            )
            return
        try:
            setattr(section_obj, port, value)
        except (TypeError, ValueError):
            forthvm.print(
                f"Value {value} cannot be set to {port} in section {section} for {obj.uid()}"
            )

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

    @primitive
    def nkill(self, forthvm):
        self.obj.stop()

    @primitive
    def ncreate(self, forthvm): ...


class NVirtDev(NProxy):
    def generate_vocab(self, existing_vocab):
        obj = self.obj
        return f"""
: {obj.uid()} {obj.uuid} ;
: {obj.uid()}@ {obj.uuid} nread ;
: {obj.uid()}! {obj.uuid} nwrite ;
: {obj.uid()}/kill {obj.uuid} nkill ;
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
                    value_name = accepted_value.replace(" ", "_")
                    if value_name in existing_vocab:
                        continue
                    yield f"nport {value_name}"

    @primitive
    def nread(self, forthvm):
        obj = self.obj
        port = forthvm.popd()
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
        port = forthvm.popd()
        value = forthvm.popd()
        if not hasattr(obj, port):
            forthvm.print(f"Port {port} doesn't exist for {obj.uid()}")
            return
        try:
            obj.set_parameter(port, value)
        except (TypeError, ValueError):
            forthvm.print(f"Value {value} cannot be set to {port.name} for {obj.uid()}")

    @primitive
    def nkill(self, forthvm):
        self.obj.stop()

    @primitive
    def ncreate(self, forthvm): ...


class NMidiSection(NProxy):
    def generate_vocab(self, existing_vocab):
        return f"""
{NL.join(self.generate_port_vocab(existing_vocab))}
"""

    def generate_port_vocab(self, existing_vocab):
        obj = self.obj
        section_name = obj.state_name
        for port in obj.all_parameters():
            for accepted_value in port.accepted_values:
                value_name = accepted_value.replace(" ", "_")
                if value_name in existing_vocab:
                    continue
                yield f"nport {value_name}"
            if port.name in existing_vocab:
                continue
            yield f"nport {port.name}/{section_name}"
        for port in obj.meta.pitchwheels:
            if port.name in existing_vocab:
                continue
            yield f"nport {port.name}/{section_name}"
        keys = obj.meta.pads_or_keys
        if keys:
            yield f"nport {keys.name}/{section_name}"


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
                self.forth_display(
                    f"Device at address {addr} doesn't exist or have been killed"
                )
            except AttributeError as e:
                self.forth_display(
                    f"{obj} does not understands {primitive_name} or doesn't have the right parameter types"
                )
                print(e)

        for k in _PRIMITIVES:
            forthvm._register_primitive(
                k.upper(), lambda k=k: dispatch(self, k, forthvm)
            )
