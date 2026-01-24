import json
import traceback
from collections import defaultdict
from dataclasses import InitVar, asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Counter, Literal, Type

import mido

from .parameter_instances import Int, PadOrKey, PadsOrKeysInstance, PitchwheelInstance
from .virtual_device import VirtualParameter
from .world import (
    DeviceNotFound,
    DeviceSerializer,
    ThreadContext,
    all_links,
    connected_devices,
    midi_device_classes,
)

NOT_INIT = "uninitialized"


@dataclass
class ModuleParameter:
    cc_note: int | str = -1
    channel: int | None = None
    name: str = NOT_INIT
    section_name: str = NOT_INIT
    init_value: int = 0
    description: str | None = None
    range: tuple[int, int] = (0, 127)
    type: Literal["program_change", "control_change"] = "control_change"

    def __post_init__(self):
        self.stream = False

    @property
    def min_range(self):
        return self.range[0]

    @property
    def max_range(self):
        return self.range[1]

    def __get__(self, instance, owner=None) -> "Int | ModuleParameter":
        if instance is None:
            return self
        return instance.state[self.name]

    def install_fun(self, to_module, feeder, append=True):
        self.__set__(to_module, feeder, send=False)

    def generate_inner_fun_virtual(self, to_device, to_param):
        if to_param.consumer:

            return lambda value, ctx: to_device.receiving(
                value,
                on=to_param.name,
                ctx=ThreadContext({**ctx, "param": self.name}),
            )
        else:
            return lambda value, ctx: to_device.set_parameter(to_param.name, value, ctx)

    def generate_inner_fun_normal(self, to_device, to_param):
        return lambda value, ctx: setattr(to_device, to_param.name, value)

    def generate_fun(self, to_device, to_param):

        if isinstance(to_param, VirtualParameter):
            return self.generate_inner_fun_virtual(to_device, to_param)
        return self.generate_inner_fun_normal(to_device, to_param)

    def __set__(self, to_module, feeder, send=True):
        if feeder is None:
            return

        if hasattr(feeder, "bind"):
            feeder.bind(getattr(to_module, self.name))
            return

        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            if self.type == "control_change":
                to_module.device.control_change(
                    self.cc_note, feeder, channel=self.channel
                )
            else:
                to_module.device.program_change(feeder, channel=self.channel)
        to_module.state[self.name].update(feeder)

    def basic_set(self, device: "MidiDevice", value):
        # TODO update later when we will deal with multi-channels instruments
        getattr(device.modules, self.section_name).state[self.name].update(value)


@dataclass
class ModulePadsOrKeys:
    type = "note"
    channel: int | None = None
    keys: dict[int, PadOrKey] = field(default_factory=dict)
    section_name: str = NOT_INIT
    name: str = NOT_INIT
    cc_note: int = -1
    range: tuple[int, int] = (0, 127)

    def __post_init__(self):
        self.stream = False

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return instance.state[f"{self.section_name}_note"]

    def __set__(self, target, feeder):
        if feeder is None:
            return

        if isinstance(feeder, list):
            for f in feeder:
                f.bind(getattr(target, self.name))
        else:
            feeder.bind(getattr(target, self.name))

    def basic_send(self, type, note, velocity): ...


@dataclass
class ModulePitchwheel:
    type = "pitchwheel"
    channel: int | None = None
    section_name: str = NOT_INIT
    name: str = NOT_INIT
    cc_note: int = -1
    range: tuple[int, int] = (-8192, 8192)

    def __post_init__(self):
        self.stream = False

    def __get__(self, instance, owner=None):
        if instance is None:
            return self
        return instance.state[f"{self.section_name}_pitch"]

    def __set__(self, target, feeder):
        if feeder is None:
            return

        if isinstance(feeder, list):
            for f in feeder:
                f.bind(getattr(target, self.name))
        else:
            feeder.bind(getattr(target, self.name))

    def basic_send(
        self, type, note, velocity
    ): ...  # no need to keep state, behavior of pitchwheel is to reset to 0


@dataclass
class MetaModule:
    name: str
    parameters: list[ModuleParameter]
    pads_or_keys: ModulePadsOrKeys | None
    pitchwheel: ModulePitchwheel | None


@dataclass
class Module:
    device: "MidiDevice"
    meta: Any = None
    state_name: str = NOT_INIT
    state: dict[str, Int | PadsOrKeysInstance | PitchwheelInstance] = field(
        default_factory=dict
    )

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        parameters = []
        pads = None
        pitchwheel = None
        for name, value in vars(cls).items():
            if isinstance(value, ModuleParameter):
                value.name = name
                parameters.append(value)
            if isinstance(value, ModulePadsOrKeys):
                pads = value
                value.name = name
            if isinstance(value, ModulePitchwheel):
                pitchwheel = value
                value.name = name
        cls.meta = MetaModule(cls.__name__, parameters, pads, pitchwheel)

    def __post_init__(self):
        self.meta = self.__class__.meta
        for param in self.meta.parameters:
            param.section_name = self.__class__.state_name
            self.state[param.name] = Int.create(
                param.init_value, parameter=param, device=self.device
            )
        if self.meta.pads_or_keys:
            self.meta.pads_or_keys.section_name = self.__class__.state_name
            state_name = self.meta.pads_or_keys.section_name
            self.state[f"{state_name}_note"] = PadsOrKeysInstance(
                self.meta.pads_or_keys, self.device
            )
        if self.meta.pitchwheel:
            self.meta.pitchwheel.section_name = self.__class__.state_name
            state_name = self.meta.pitchwheel.section_name
            self.state[f"{state_name}_pitch"] = PitchwheelInstance(
                self.meta.pitchwheel, self.device
            )
        self._keys_notes = {}

    def setup_function(self, control, lfo): ...

    def main_function(self, control):
        return lambda value, _: (
            setattr(self, control.name, value) if value is not None else None
        )

    def __getitem__(self, key) -> PadOrKey | list[PadOrKey]:
        if not self.meta.pads_or_keys:
            raise Exception("Your section doesn't have a key/pad section")
        if isinstance(key, int):
            if key not in self._keys_notes:
                self._keys_notes[key] = PadOrKey(
                    device=self.device, cc_note=key, pads_or_keys=self.meta.pads_or_keys
                )
            return self._keys_notes[key]
        if isinstance(key, slice):
            indices = key.indices(128)
            return [self[i] for i in range(*indices)]  # type: ignore
        raise Exception(f"Don't know what to look for key of type {key.__class__}")

    def __setitem__(self, key, value):
        if value is None:
            return
        pads = self[key]
        if not isinstance(pads, list):
            pads = [pads]

        if isinstance(value, list):
            from_pads = value
            for from_pad, to_pad in zip(from_pads, pads):
                from_pad.bind(to_pad)
            return

        from_pad = value
        for to_pad in pads:
            from_pad.bind(to_pad)

    def __isub__(self, other):
        # The only way to be here is from a callback removal on the section
        # that is supposed to own a KeysOrPads
        if not self.meta.pads_or_keys:
            raise Exception("Your section doesn't have a key/pad section")

        if isinstance(other, list):
            for o in other:
                o.device.unbind_link(o, None)
        else:
            other.device.unbind_link(other, None)
        return self

    def all_parameters(self):
        return self.meta.parameters


class DeviceState:
    def __init__(self, device, modules: dict[str, Type[Module]]):
        init_modules = {}
        self.program_change = None
        self.possible_bank = None
        for state_name, ModuleCls in modules.items():
            ModuleCls.state_name = state_name
            moduleInstance = ModuleCls(device)
            init_modules[state_name] = moduleInstance
            for param in moduleInstance.meta.parameters:
                device.reverse_map[(param.type, param.cc_note, param.channel)] = param
                if param.type == "program_change":
                    self.program_change = param
                elif param.cc_note == 0:
                    self.possible_bank = param
            if moduleInstance.meta.pads_or_keys:
                param = moduleInstance.meta.pads_or_keys
                device.reverse_map[(param.type, None, param.channel)] = param
            if moduleInstance.meta.pitchwheel:
                param = moduleInstance.meta.pitchwheel
                device.reverse_map[(param.type, None, param.channel)] = param
        self.modules = init_modules

    def __getattr__(self, name):
        return self.modules[name]

    def as_dict_patch(self, with_meta=False, save_defaultvalues=False):
        d = {}
        for name, module in self.modules.items():
            module_state = {}
            d[name] = module_state
            for parameter in module.meta.parameters:
                value = getattr(getattr(self, name), parameter.name)
                value = round(value)
                if value != parameter.init_value or save_defaultvalues:
                    module_state[parameter.name] = value
                if with_meta:
                    module_state[parameter.name] = {
                        "section_name": parameter.section_name,
                        "value": value,
                    }
            if not module_state:
                del d[name]
        return d

    def from_dict_patch(self, d):
        d = {**d}
        if self.program_change:
            try:
                param = self.program_change
                name = param.name
                section_name = param.section_name
                value = d[section_name][name]
                setattr(self.modules[section_name], name, value)
                del d[section_name][name]
            except Exception as e:
                pass
        if self.possible_bank:
            try:
                param = self.possible_bank
                name = param.name
                section_name = param.section_name
                value = d[section_name][name]
                setattr(self.modules[section_name], name, value)
                del d[section_name][name]
            except Exception as e:
                pass
        for sec_name, section in d.items():
            for param, value in section.items():
                setattr(self.modules[sec_name], param, value)

    def to_list(self):
        l = []
        for name, module in self.modules.items():
            module_state = {
                "name": name,
                "section_name": module.state_name,
                "parameters": [
                    asdict(parameter) for parameter in module.meta.parameters
                ],
            }
            l.append(module_state)
        return l


@dataclass
class MidiDevice:
    device_name: str
    uuid: int = 0
    modules_descr: dict[str, Type[Module]] | None = None
    autoconnect: InitVar[bool] = True
    read_input_only: InitVar[bool] = False
    played_notes: Counter = field(default_factory=Counter)
    outport: mido.ports.BaseOutput | None = None
    inport: mido.ports.BaseInput | None = None
    debug: bool = False
    channel: int = 0
    on_midi_message: (
        Callable[["MidiDevice", mido.Message, ModuleParameter | None], None] | None
    ) = None

    def __init_subclass__(cls) -> None:
        midi_device_classes.append(cls)
        return super().__init_subclass__()

    def __post_init__(self, autoconnect, read_input_only):
        from .links import Link

        if not self.uuid:
            self.uuid = id(self)

        if self not in connected_devices:
            connected_devices.append(self)
        self.reverse_map = {}
        self.links: defaultdict[tuple[str, int | str, int | None], list[Link]] = (
            defaultdict(list)
        )  # if the channel is None, we consider the device channel
        self.links_registry: dict[tuple[str, str], Link] = {}
        if self.modules_descr is None:
            self.modules_descr = {
                k: v
                for k, v in self.__class__.__annotations__.items()
                if isinstance(v, type) and issubclass(v, Module)
            }
        self.modules = DeviceState(self, self.modules_descr)
        self.listening = False
        self.outport_name = self.device_name
        self.inport_name = self.device_name
        if autoconnect:
            try:
                self.outport_name = next(
                    (
                        dev_name
                        for dev_name in mido.get_output_names()  # type: ignore
                        if self.device_name == dev_name or self.device_name in dev_name
                    ),
                )
            except StopIteration:
                raise DeviceNotFound(self.device_name)
            if not read_input_only:
                self.connect()
            self.listen()

    def connect(self):
        self.outport = mido.open_output(self.outport_name, autoreset=True)  # type: ignore

    def listen(self, start=True):
        if not start:
            self.listening = False
            self.inport.callback = None  # type: ignore
            return
        if not self.listening:
            try:
                self.inport = mido.open_input(self.inport_name)  # type: ignore
            except OSError:
                try:
                    self.inport_name = next(
                        (
                            dev_name
                            for dev_name in mido.get_input_names()  # type: ignore
                            if self.device_name == dev_name
                            or self.device_name in dev_name
                        ),
                    )
                    self.inport = mido.open_input(self.inport_name)  # type: ignore
                except StopIteration:
                    raise DeviceNotFound(self.device_name)
            self.inport.callback = self._sync_state  # type: ignore
            self.listening = True

    def close_out(self):
        if self.outport:
            self.outport.close()
            self.outport = None
            self.outport_name = None

    def close_in(self):
        if self.inport:
            self.listen(False)
            self.inport = None
            self.inport_name = None

    def close(self, delete=True):
        self.all_notes_off()
        self.close_in()
        self.close_out()
        # flush all callbacks and registry
        for link in all_links().values():
            if link.dest.device is self or link.src.device is self:
                link.uninstall()
        self.links.clear()
        self.links_registry.clear()
        if delete and self in connected_devices:
            connected_devices.remove(self)

    stop = close

    def _get_control(self, cc, channel):
        channel = None if channel == self.channel else channel
        return self.reverse_map.get(("control_change", cc, channel))

    def _update_state(self, cc, value, msg):
        control: ModuleParameter | None = self._get_control(cc, msg.channel)
        if control:
            control.basic_set(self, value)
            if self.on_midi_message:
                try:
                    self.on_midi_message(self, msg, control)
                except:
                    traceback.print_exc()

    def _sync_state(self, msg):
        if msg.type == "clock":
            # TODO create special clock/sync hook
            return
        if self.debug:
            print(msg)
        # None marks the device channel
        channel = None if msg.channel == self.channel else msg.channel
        if msg.type == "control_change":
            control = msg.control
            try:
                for link in self.links.get((msg.type, control, channel), []):
                    value = msg.value
                    ctx = ThreadContext({"debug": self.debug})
                    link.trigger(value, ctx)
                self._update_state(control, msg.value, msg)
            except:
                traceback.print_exc()
        if msg.type == "note_on" or msg.type == "note_off":
            note = msg.note
            try:
                # We look first if there are links at the "global level" for keys
                for link in self.links.get(("note", -1, channel), []):
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "velocity": msg.velocity,
                        }
                    )
                    link.trigger(note, ctx)
                for link in self.links.get(("note", note, channel), []):
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "velocity": msg.velocity,
                        }
                    )
                    link.trigger(note, ctx)
                for link in self.links.get(("velocity", note, channel), []):
                    ctx = ThreadContext(
                        {
                            "debug": self.debug,
                            "type": msg.type,
                            "note": note,
                        }
                    )
                    value = msg.velocity
                    link.trigger(value, ctx)
                pads: ModulePadsOrKeys | None = self.reverse_map.get(
                    ("note", None, channel)
                )
                if pads:
                    pads.basic_send(msg.type, note, msg.velocity)
            except:
                traceback.print_exc()
        if msg.type == "pitchwheel":
            try:
                for link in self.links.get((msg.type, -1, channel), []):
                    pitch = msg.pitch
                    ctx = ThreadContext({"debug": self.debug, "type": msg.type})
                    link.trigger(pitch, ctx)
            except:
                traceback.print_exc()

    def send(self, msg):
        if not self.outport:
            return
        self.outport.send(msg)

    def note(self, type, note, velocity=127 // 2, channel=None):
        channel = channel if channel is not None else self.channel
        getattr(self, type)(note, velocity=velocity, channel=channel)

    def note_on(self, note, velocity=127 // 2, channel=None):
        if not self.outport:
            return
        channel = channel if channel is not None else self.channel
        note = round(note)
        if note > 127:
            note = 127
        elif note < 0:
            note = 0
        self.played_notes[note] += 1
        self.outport.send(
            mido.Message("note_on", channel=channel, note=note, velocity=velocity)
        )
        if self.played_notes[note] > 40:
            for _ in range(20):
                self.note_off(note, velocity=0)

    def note_off(self, note, velocity=127 // 2, channel=None):
        if not self.outport:
            return
        channel = channel if channel is not None else self.channel
        note = round(note)
        if note > 127:
            note = 127
        elif note < 0:
            note = 0
        self.outport.send(
            mido.Message("note_off", channel=channel, note=note, velocity=velocity)
        )
        if self.played_notes[note]:
            self.played_notes[note] -= 1

    def pitchwheel(self, pitch, channel=None):
        if not self.outport:
            return
        channel = channel if channel is not None else self.channel
        pitch = round(pitch)
        if pitch > 8191:
            pitch = 8191
        elif pitch < -8192:
            pitch = -8192
        self.outport.send(mido.Message("pitchwheel", channel=channel, pitch=pitch))

    def all_notes_off(self):
        for note, occurence in self.played_notes.items():
            for _ in range(occurence):
                self.note_off(note, velocity=0)
        self.played_notes.clear()

    def force_all_notes_off(self, times=1):
        for _ in range(times + 1):
            for note in range(0, 128):
                self.note_off(note, velocity=0)

    def control_change(self, control, value=0, channel=None):
        if not self.outport:
            return
        channel = channel if channel is not None else self.channel
        value = round(value)
        if value > 127:
            value = 127
        elif value < 0:
            value = 0
        msg = mido.Message(
            "control_change", channel=channel, control=control, value=value
        )
        self._update_state(control, value, msg)
        self.outport.send(msg)

    def program_change(self, program, channel=None):
        if not self.outport:
            return
        channel = channel if channel is not None else self.channel
        channel = min(max(0, int(channel)), 15)
        program = min(max(0, int(program)), 127)
        msg = mido.Message("program_change", channel=channel, program=program)
        self.outport.send(msg)

    def unbind_all(self):
        for link in self.links_registry.values():
            link.cleanup()
        self.links.clear()
        self.links_registry.clear()

    def bind_link(self, link):
        type = link.src.parameter.type
        cc_note = link.src.parameter.cc_note
        channel = link.src.parameter.channel
        self.links[(type, cc_note, channel)].append(link)
        self.links_registry[(link.src_repr(), link.dest_repr())] = link

    def bounce_link(self, from_, value, ctx):
        src_path = from_.repr()
        for (src, _), link in list(self.links_registry.items()):
            if src == src_path:
                link.trigger(value, ctx)

    def unbind_link(self, from_, target):
        if from_ is None:
            to_remove = []
            link_to_remove = []
            target_path = target.repr()
            for (src, dst), link in self.links_registry.items():
                if dst == target_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                type = from_.parameter.type
                cc_note = from_.parameter.cc_note
                channel = from_.parameter.channel
                self.links[(type, cc_note, channel)].remove(link)
                link.cleanup()
            return
        if target is None:
            to_remove = []
            link_to_remove = []
            src_path = from_.repr()
            for (src, dst), link in self.links_registry.items():
                if src == src_path:
                    to_remove.append((src, dst))
                    link_to_remove.append(link)
            for key in to_remove:
                del self.links_registry[key]
            for link in link_to_remove:
                for key in list(self.links.keys()):
                    try:
                        self.links[key].remove(link)
                        link.cleanup()
                    except ValueError:
                        ...
            return

        key = (from_.repr(), target.repr())
        link = self.links_registry.get(key)
        if not link:
            # print(f"Cannot unbind {from_} and {target}, they are not bound in {self}")
            return

        del self.links_registry[key]
        type = from_.parameter.type
        cc_note = from_.parameter.cc_note
        channel = from_.parameter.channel
        self.links[(type, cc_note, channel)].remove(link)
        link.cleanup()

    @property
    def outgoing_links(self):
        return list(self.links_registry.values())

    @property
    def incoming_links(self):
        from .world import all_devices

        links = []
        self_repr = f"{self.uuid}::"
        for device in all_devices():
            for (_, dst), link in device.links_registry.items():
                if dst.startswith(self_repr):
                    links.append(link)
        return links

    def __isub__(self, other):
        # The only way to be here is from a callback removal on the key/pad section
        other.device.unbind_link(other, self)
        self.all_notes_off()
        return self

    def current_preset(self, save_defaultvalues=False):
        return self.modules.as_dict_patch(save_defaultvalues)

    def save_preset(self, file: Path | str):
        Path(file).write_text(
            json.dumps(self.current_preset(), indent=2, cls=DeviceSerializer)
        )

    def load_preset(
        self,
        file: Path | str | None = None,
        dct: dict[str, dict[str, int]] | None = None,
    ):
        if file:
            p = Path(file)
            self.modules.from_dict_patch(json.loads(p.read_text()))
        if dct:
            self.modules.from_dict_patch(dct)

    def to_dict(self, save_defaultvalues=False):
        d = {
            "id": self.uuid,
            "repr": self.uid(),
            "ports": {
                "input": self.inport.name if self.inport else None,
                "output": self.outport.name if self.outport else None,
            },
            "channel": self.channel,
            "meta": {
                "name": self.__class__.__name__,
                "sections": [
                    asdict(module.meta) for module in self.modules.modules.values()
                ],
            },
            "config": self.modules.as_dict_patch(
                with_meta=False, save_defaultvalues=save_defaultvalues
            ),
        }
        return d

    def uid(self):
        return f"{self.__class__.__name__}"

    def all_sections(self):
        return self.modules.modules.values()

    def all_parameters(self):
        parameters = []
        for section in self.all_sections():
            parameters.extend(section.all_parameters())
        return parameters

    def pads_or_keys(self):
        for section in self.all_sections():
            if section.meta.pads_or_keys:
                return section.meta.pads_or_keys
        return None

    def pitchwheel_meta(self):
        for section in self.all_sections():
            if section.meta.pitchwheel:
                return section.meta.pitchwheel
        return None

    def random_preset(self):
        import random

        for parameter in self.all_parameters():
            setattr(
                getattr(self, parameter.section_name),
                parameter.name,
                random.randint(0, 127),
            )
