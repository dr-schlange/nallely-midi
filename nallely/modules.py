from __future__ import annotations
from dataclasses import dataclass, field
from inspect import isfunction
import math
from typing import Any, Literal, Type
from typing import TYPE_CHECKING
import wrapt

if TYPE_CHECKING:
    from .core import MidiDevice


NOT_INIT = "uninitialized"


class Int(wrapt.ObjectProxy):
    def __init__(self, obj, device, parameter):
        super().__init__(obj)
        object.__setattr__(self, "device", device)
        object.__setattr__(self, "parameter", parameter)

    def update(self, value):
        self.__wrapped__ = value

    def scale(self, min, max, method: Literal["lin"] | Literal["log"] = "log"):
        return Scaler(data=self, device=self.device, min=min, max=max, method=method)

    def __repr__(self):
        return str(self.__wrapped__)


@dataclass
class Scaler:
    data: Int
    device: Any
    min: int
    max: int
    method: str = "log"

    def __post_init__(self):
        if self.min == 0:
            self.min = 1

    def convert(self, value):
        if self.method == "lin":
            convert = lambda x: min + (x / 127) * (self.max - self.min)
        elif self.method == "log":
            convert = lambda x: math.exp(
                math.log(self.min)
                + (x / 127) * (math.log(self.max) - math.log(self.min))
            )
        else:
            raise Exception("Unknown conversion method")
        res = convert(value)
        if isinstance(value, Int):
            value.update(res)
            return value
        return res


@dataclass
class ModuleParameter:
    cc: int
    channel: int = 0
    name: str = NOT_INIT
    module_state_name: str = NOT_INIT
    stream: bool = False

    def __get__(self, instance, owner=None) -> Int:
        return instance.state[self.name]

    def __set__(self, instance, value, send=True, debug=False, force=False):
        if not force and isinstance(value, Int):
            to_module: MidiDevice = instance
            from_module: MidiDevice = value.device  # type: ignore
            # we create a callback on from_module that will "set" the module parameter to value of to_module
            # finally triggering the code that sends the cc and sync the state lower in this class.
            from_module.bind(
                lambda value, ctx: setattr(to_module, self.name, value),
                type="control_change",
                value=value.parameter.cc,
            )
            return

        from .core import VirtualDevice

        if isinstance(value, VirtualDevice):
            if debug:
                value.bind(
                    lambda lfo_value, ctx: print(
                        f"[{instance.meta.name} #{self.name}]",
                        ctx.parent.waveform,
                        "t =",
                        ctx.ticks,
                        "v =",
                        lfo_value,
                    )
                )
                return
            value.bind(lambda value, ctx: setattr(instance, self.name, value))
            return
        if isfunction(value):
            instance.device.bind(value, type="control_change", value=self.cc)
            return
        if isinstance(value, Scaler):
            # scaler = value
            # scaler.device.bind(
            #     lambda value, ctx: setattr(instance, self.name, scaler.convert(value)),
            #     type="control_change",
            #     value=self.cc,
            # )

            # Currently, scaler are not supported for non virtual device parameter, but will be in the future
            return
        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            instance.device.control_change(self.cc, value, channel=self.channel)
        instance.state[self.name].update(value)

    def basic_set(self, device: MidiDevice, value):
        getattr(device.modules, self.module_state_name).state[self.name].update(value)


@dataclass
class PadOrKey:
    note: int = -1


@dataclass
class ModulePadsOrKeys:
    channel: int = 0
    keys: dict[int, PadOrKey] = field(default_factory=dict)

    def __getitem__(self, key):
        if key in dict:
            return self.keys[key]
        pad = PadOrKey(key)
        self.keys[key] = pad
        return pad

    # def __post_init__(self):
    #     self.callbacks = []

    # def bind_to(self, module, control):
    #     module.setup_function(control, FAKE())
    #     self.bind(module.main_function(control))

    # def bind(self, fun):
    #     self.callbacks.append(fun)

    def __get__(self, instance, owner=None):
        return self

    def __set__(self, instance, value):
        # if isinstance(value, ModulePadsOrKeys):
        #     value.bind(
        #         lambda note, params: instance.device.send(
        #             mido.Message(
        #                 params[2], note=note, velocity=params[1], channel=self.channel
        #             )
        #         )
        #     )
        #     return
        # if hasattr(value, "callback"):
        #     self.bind(value.callback)
        ...

    def basic_send(self, type, note, velocity):
        ...
        # for callback in self.callbacks:
        #     try:
        #         callback(note, (self, velocity, type))
        #     except:
        #         print_exc()


@dataclass
class MetaModule:
    name: str
    parameters: list[ModuleParameter]
    pads_or_keys: ModulePadsOrKeys | None


@dataclass
class Module:
    device: MidiDevice
    meta: Any = None
    state_name: str = NOT_INIT
    state: dict[str, Int] = field(default_factory=dict)

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        parameters = []
        pads = None
        for name, value in vars(cls).items():
            if isinstance(value, ModuleParameter):
                value.name = name
                value.module_state_name = cls.state_name
                parameters.append(value)
            if isinstance(value, ModulePadsOrKeys):
                pads = value
        cls.meta = MetaModule(cls.__name__, parameters, pads)

    def __post_init__(self):
        self.meta = self.__class__.meta
        for param in self.meta.parameters:
            self.state[param.name] = Int(0, parameter=param, device=self.device)

    def setup_function(self, control, lfo): ...

    def main_function(self, control):
        return lambda value, _: (
            setattr(self, control.name, value) if value is not None else None
        )

    # def __setattr__(self, key, value):
    #     if key in ["device", "meta", "state_name", "state"]:
    #         return super().__setattr__(key, value)
    #     return self.state[key].update(value)


@dataclass
class KeySection(Module):
    state_name = "keys"
    notes = ModulePadsOrKeys()


class DeviceState:
    def __init__(self, device, modules: list[Type[Module]]):
        init_modules = {}
        for ModuleCls in modules:
            moduleInstance = ModuleCls(device)
            init_modules[ModuleCls.state_name] = moduleInstance
            for param in moduleInstance.meta.parameters:
                device.reverse_map[("cc", param.cc)] = param
            if moduleInstance.meta.pads_or_keys:
                device.reverse_map[("note", None)] = moduleInstance.meta.pads_or_keys
        self.modules = init_modules

    def __getattr__(self, name):
        return self.modules[name]
