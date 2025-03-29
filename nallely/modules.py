from __future__ import annotations

import math
from dataclasses import dataclass, field
from decimal import Decimal
from inspect import isfunction
from typing import TYPE_CHECKING, Any, Literal, Type

import wrapt

if TYPE_CHECKING:
    from .core import MidiDevice, ThreadContext


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

    def install_fun(self, to_module, to_param):
        self.parameter.install_fun(to_module, to_param)


@dataclass
class Scaler:
    data: Int
    device: Any
    min: int | float
    max: int | float
    method: str = "log"
    as_int: bool = False
    max_range: int | float = 127

    def __post_init__(self):
        if self.min == 0 and self.method == "log":
            self.min = 0.001
        self.as_int = (
            self.as_int or isinstance(self.min, int) and isinstance(self.max, int)
        )

    def convert_lin(self, value, max_range):
        return self.min + (value / max_range) * (self.max - self.min)

    def convert_log(self, value, max_range):
        return math.exp(
            math.log(self.min)
            + (value / max_range) * (math.log(self.max) - math.log(self.min))
        )

    def convert(self, value):
        if isinstance(value, Decimal):
            value = float(value)
        if self.method == "lin":
            res = self.convert_lin(value, self.max_range)
        elif self.method == "log":
            res = self.convert_log(value, self.max_range)
        else:
            raise Exception("Unknown conversion method")
        res = int(res) if self.as_int else res
        if isinstance(value, Int):
            value.update(res)
            return value
        return res

    def install_fun(self, to_device, to_parameter):
        from .core import VirtualDevice

        if isinstance(self.data, VirtualDevice):
            self.data.bind(
                lambda value, ctx: (
                    setattr(to_device, to_parameter.name, self.convert(value))
                ),
                to=to_device,
            )
            return
        pad: ModuleParameter = self.data.parameter
        fun = pad.generate_fun(to_device, to_parameter)
        self.data.device.bind(
            lambda value, ctx: fun(self.convert(value), ctx),
            type=pad.type,
            value=pad.cc,  # equiv pad.note
            to=to_device,
        )


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

    def install_fun(self, to_module, feeder):
        self.__set__(to_module, feeder, send=False)

    def generate_inner_fun_virtual(self, to_device, to_param):
        if to_param.consummer:
            from .core import ThreadContext

            return lambda value, ctx: to_device.receiving(
                value,
                on=to_param.name,
                ctx=ThreadContext({**ctx, "param": self.name}),
            )
        else:
            return lambda value, ctx: to_device.set_parameter(to_param.name, value)

    def generate_inner_fun_normal(self, to_device, to_param):
        return lambda value, ctx: to_device.set_parameter(to_param.name, value)

    def generate_fun(self, to_device, to_param):
        from .core import VirtualParameter

        if isinstance(to_param, VirtualParameter):
            return self.generate_inner_fun_virtual(to_device, to_param)
        return self.generate_inner_fun_normal(to_device, to_param)

    def __set__(self, to_module, feeder, send=True, debug=False, force=False):
        if not force and isinstance(feeder, Int):
            device_value = feeder
            from_module: MidiDevice = device_value.device  # type: ignore
            # we create a callback on from_module that will "set" the module parameter to value of to_module
            # finally triggering the code that sends the cc and sync the state lower in this class.
            from_module.bind(
                lambda value, ctx: setattr(to_module, self.name, value),
                type=device_value.parameter.type,
                value=device_value.parameter.cc,
                to=to_module.device,
            )
            return

        from .core import VirtualDevice

        if isinstance(feeder, VirtualDevice):
            device = feeder
            device.bind(
                lambda value, ctx: setattr(to_module, self.name, value),
                to=to_module.device,
            )
            return
        if isfunction(feeder):
            fun = feeder
            to_module.device.bind(
                fun, type=self.type, value=self.cc, to=to_module.device
            )
            return
        if isinstance(feeder, Scaler):
            scaler = feeder
            scaler.install_fun(to_device=to_module, to_parameter=self)
            return
        if isinstance(feeder, PadOrKey):
            pad: PadOrKey = feeder
            from_module: MidiDevice = pad.device
            from_module.bind(
                pad.generate_fun(to_module, self),
                type=pad.type,
                value=pad.note,
                to=to_module.device,
            )
            return

        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            to_module.device.control_change(self.cc, feeder, channel=self.channel)
        to_module.state[self.name].update(feeder)

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
        self.last_value = 0
        self.parameter = self
        self.cc = self.note
        self.name = f"#{self.note}"

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

    def generate_inner_fun_virtual_consummer(self, to_device, to_param):
        from .core import ThreadContext

        if self.mode == "hold":
            return lambda value, ctx: (
                (
                    to_device.receiving(
                        value,
                        on=to_param.name,
                        ctx=ThreadContext(
                            {
                                **ctx,
                                "param": f"key/pad #{self.note}",
                                "mode": self.mode,
                            }
                        ),
                    )
                    if ctx["type"] == "note_on"
                    else ...
                )
            )
        if self.mode == "latch":

            def foo(value, ctx, to_module, to_param, pad):
                if ctx["type"] == "note_off":
                    return
                if pad.toggle().triggered:
                    pad.set_last(value)
                    to_module.receiving(
                        value,
                        on=to_param.name,
                        ctx=ThreadContext(
                            {
                                **ctx,
                                "param": f"key/pad #{self.note}",
                                "mode": self.mode,
                            }
                        ),
                    )
                else:
                    to_device.receiving(
                        pad.last_value,
                        on=to_param.name,
                        ctx=ThreadContext(
                            {
                                **ctx,
                                "param": f"key/pad #{self.note}",
                                "mode": self.mode,
                            }
                        ),
                    )

            return lambda value, ctx: foo(value, ctx, to_device, to_param, self)

        return lambda value, ctx: to_device.receiving(
            value,
            on=to_param.name,
            ctx=ThreadContext(
                {
                    **ctx,
                    "param": f"key/pad #{self.note}",
                    "mode": self.mode,
                }
            ),
        )

    def generate_inner_fun_virtual_normal(self, to_device, to_param):
        if self.mode == "hold":
            lambda value, ctx: (
                to_device.set_parameter(to_param.name, value)
                if ctx["type"] == "note_on"
                else ...
            )
        if self.mode == "latch":
            ...
        return lambda value, ctx: to_device.receiving(
            value,
            on=to_param.name,
            ctx=ThreadContext(
                {
                    **ctx,
                    "param": f"key/pad #{self.note}",
                    "mode": self.mode,
                }
            ),
        )

    def generate_inner_fun_midiparam(self, to_module, to_param):
        if self.mode == "latch":

            def foo(value, ctx, to_module, name, pad):
                if ctx["type"] == "note_off":
                    return
                if pad.toggle().triggered:
                    pad.set_last(int(getattr(to_module, name)))
                    setattr(to_module, name, value)
                else:
                    setattr(to_module, name, pad.last_value)

            return lambda value, ctx: foo(value, ctx, to_module, to_param.name, self)
        elif self.mode == "hold":
            return lambda value, ctx: (
                setattr(to_module, self.name, value)
                if ctx["type"] == "note_on"
                else ...
            )
        return lambda value, ctx: setattr(to_module, self.name, value)

    def generate_fun(self, to_device, to_param):
        from .core import VirtualParameter

        if isinstance(to_param, VirtualParameter):
            if to_param.consummer:
                return self.generate_inner_fun_virtual_consummer(to_device, to_param)
            else:
                return self.generate_inner_fun_virtual_normal(to_device, to_param)
        else:
            return self.generate_inner_fun_midiparam(to_device, to_param)


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

    # def __setitem__(self, key, value):
    #     if isinstance(key, int):
    #         self[key].bind(value)
    #         return
    #     if isinstance(key, slice):
    #         for k in self[key]:
    #             k.bind(value)

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

    def as_dict(self):
        d = {}
        for name, module in self.modules.items():
            module_state = {}
            d[name] = module_state
            for parameter in module.meta.parameters:
                module_state[parameter.name] = getattr(
                    getattr(self, name), parameter.name
                )
            if not module_state:
                del d[name]
        return d

    def from_dict(self, d):
        for sec_name, section in d.items():
            for param, value in section.items():
                setattr(self.modules[sec_name], param, value)
