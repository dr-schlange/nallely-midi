from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from inspect import isfunction
from typing import TYPE_CHECKING, Any, Literal, Type

import wrapt

if TYPE_CHECKING:
    from .core import MidiDevice, VirtualDevice


NOT_INIT = "uninitialized"


class Int(wrapt.ObjectProxy):
    def __init__(self, obj, device, parameter):
        super().__init__(obj)
        object.__setattr__(self, "device", device)
        object.__setattr__(self, "parameter", parameter)

    def update(self, value):
        self.__wrapped__ = value

    def scale(
        self,
        min,
        max,
        method: Literal["lin"] | Literal["log"] = "log",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            device=self.device,
            min=min,
            max=max,
            method=method,
            as_int=as_int,
        )

    def __repr__(self):
        return str(self.__wrapped__)


@dataclass
class Scaler:
    data: Int
    device: Any
    min: int | float
    max: int | float
    method: str = "log"
    as_int: bool = False

    def __post_init__(self):
        if self.min == 0 and self.method == "log":
            self.min = 0.001

    def convert(self, value):
        if self.method == "lin":
            convert = lambda x: self.min + (x / 127) * (self.max - self.min)
        elif self.method == "log":
            convert = lambda x: math.exp(
                math.log(self.min)
                + (x / 127) * (math.log(self.max) - math.log(self.min))
            )
        else:
            raise Exception("Unknown conversion method")
        res = int(convert(value)) if self.as_int else convert(value)
        if isinstance(value, Int):
            value.update(res)
            return value
        # else:
        #     res = Int(value, device=self.device, parameter=self.data.parameter)
        return res


@dataclass
class ModuleParameter:
    type = "control_change"
    cc: int
    channel: int = 0
    name: str = NOT_INIT
    module_state_name: str = NOT_INIT
    stream: bool = False

    def __get__(self, instance, owner=None) -> Int:
        return instance.state[self.name]

    def __set__(self, module, value, send=True, debug=False, force=False):
        if not force and isinstance(value, Int):
            device_value = value
            to_module: MidiDevice = module
            from_module: MidiDevice = device_value.device  # type: ignore
            # we create a callback on from_module that will "set" the module parameter to value of to_module
            # finally triggering the code that sends the cc and sync the state lower in this class.
            from_module.bind(
                lambda value, ctx: setattr(to_module, self.name, value),
                type=device_value.parameter.type,
                value=device_value.parameter.cc,
                to=module.device,
            )
            return

        from .core import VirtualDevice

        if isinstance(value, VirtualDevice):
            device = value
            device.bind(
                lambda value, ctx: setattr(module, self.name, value), to=module.device
            )
            return
        if isfunction(value):
            fun = value
            module.device.bind(fun, type=self.type, value=self.cc, to=module.device)
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
        if isinstance(value, PadOrKey):
            pad: PadOrKey = value
            if pad.type == "velocity":
                to_module: MidiDevice = module
                from_module: MidiDevice = pad.device
                if pad.mode == "note":
                    from_module.bind(
                        lambda value, ctx: setattr(to_module, self.name, value),
                        type=pad.type,
                        value=pad.note,
                        to=module.device,
                    )
                elif pad.mode == "latch":

                    def foo(value, ctx, to_module, name, pad):
                        if ctx["type"] == "note_off":
                            return
                        if pad.toggle().triggered:
                            pad.set_last(int(getattr(to_module, name)))
                            setattr(to_module, name, value)
                        else:
                            setattr(to_module, name, pad.last_value)

                    from_module.bind(
                        # lambda value, ctx: (
                        #     (
                        #         pad.set_last(getattr(to_module, self.name)),
                        #         setattr(to_module, self.name, value),
                        #     )
                        #     if ctx["type"] == "note_on" and pad.toggle().triggered
                        #     else setattr(to_module, self.name, pad.last_value)
                        # ),
                        lambda value, ctx: foo(value, ctx, to_module, self.name, pad),
                        type=pad.type,
                        value=pad.note,
                        to=module.device,
                    )
                elif pad.mode == "hold":
                    from_module.bind(
                        lambda value, ctx: (
                            setattr(to_module, self.name, value)
                            if ctx["type"] == "note_on"
                            else ...
                        ),
                        type=pad.type,
                        value=pad.note,
                        to=module.device,
                    )
            else:
                ...
            return

        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            module.device.control_change(self.cc, value, channel=self.channel)
        module.state[self.name].update(value)

    def basic_set(self, device: MidiDevice, value):
        getattr(device.modules, self.module_state_name).state[self.name].update(value)


@dataclass
class PadOrKey:
    device: MidiDevice
    type: str = "note"
    note: int = -1
    mode: str = "note"

    def __post_init__(self):
        self.triggered = False
        self.last_value = None
        self.parameter = self
        self.cc = self.note
        self.name = f"#{self.note}"

    def bind(self, value):
        if isfunction(value):
            self.device.bind(value, type=self.type, value=self.note, to=self.device)

    @property
    def velocity(self):
        return PadOrKey(self.device, note=self.note, type="velocity")

    @property
    def velocity_latch(self):
        return PadOrKey(self.device, note=self.note, type="velocity", mode="latch")

    @property
    def velocity_hold(self):
        return PadOrKey(self.device, note=self.note, type="velocity", mode="hold")

    def set_last(self, value):
        self.last_value = value
        return self

    def toggle(self):
        self.triggered = not self.triggered
        return self

    def scale(
        self,
        min,
        max,
        method: Literal["lin"] | Literal["log"] = "log",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            device=self.device,
            min=min,
            max=max,
            method=method,
            as_int=as_int,
        )


@dataclass
class ModulePadsOrKeys:
    type = "note"
    channel: int = 0
    keys: dict[int, PadOrKey] = field(default_factory=dict)
    module_state_name: str = NOT_INIT

    def __get__(self, instance, owner=None):
        print("Get GET")
        # for i in range(127):
        #     setattr(instance.__class__, "note_"
        return instance.state[self.module_state_name]

    def __set__(self, instance, value):
        if isinstance(value, PadOrKey):
            pad: PadOrKey = value
            pad.device.bind(
                lambda value, ctx: instance.device.note(
                    note=value, velocity=ctx["velocity"], type=ctx["type"]
                ),
                type=self.type,
                value=pad.note,
                to=instance.device,
            )
            return
        if isinstance(value, list):
            for e in value:
                pad: PadOrKey = e
                assert isinstance(pad, PadOrKey)
                self.__set__(instance, e)

    def basic_send(self, type, note, velocity): ...


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
                pads.module_state_name = cls.state_name
        cls.meta = MetaModule(cls.__name__, parameters, pads)

    def __post_init__(self):
        self.meta = self.__class__.meta
        for param in self.meta.parameters:
            self.state[param.name] = Int(0, parameter=param, device=self.device)
        if self.meta.pads_or_keys:
            self.state[self.meta.pads_or_keys.module_state_name] = self.device  # type: ignore (special key)
        self._keys_notes = {}

    def setup_function(self, control, lfo): ...

    def main_function(self, control):
        return lambda value, _: (
            setattr(self, control.name, value) if value is not None else None
        )

    def __getitem__(self, key) -> PadOrKey | list[PadOrKey]:
        if not self.meta.pads_or_keys:
            raise Exception("Your device doesn't have a key/pad section")
        if isinstance(key, int):
            if key not in self._keys_notes:
                self._keys_notes[key] = PadOrKey(device=self.device, note=key)
            return self._keys_notes[key]
        if isinstance(key, slice):
            indices = key.indices(128)
            return [self[i] for i in range(*indices)]  # type: ignore
        raise Exception(f"Don't know what to look for key of type {key.__class__}")

    def __setitem__(self, key, value):
        if isinstance(key, int):
            self[key].bind(value)
            return
        if isinstance(key, slice):
            for k in self[key]:
                k.bind(value)

    # def __setattr__(self, key, value):
    #     if key in ["device", "meta", "state_name", "state"]:
    #         return super().__setattr__(key, value)
    #     return self.state[key].update(value)


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
