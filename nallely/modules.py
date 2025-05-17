from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from inspect import isfunction
from types import FunctionType
from typing import TYPE_CHECKING, Any, Literal, Type

if TYPE_CHECKING:
    from .core import MidiDevice, ParameterInstance, VirtualDevice


NOT_INIT = "uninitialized"


class Int(int):
    def __init__(self, val):
        super().__init__()
        self.__wrapped__: int
        self.device: MidiDevice
        self.parameter: ModuleParameter

    @classmethod
    def create(cls, val: int, device: MidiDevice, parameter: ModuleParameter) -> Int:
        result = cls(val)
        result.__wrapped__ = val
        result.device = device
        result.parameter = parameter
        return result

    def update(self, value):
        self.__wrapped__ = value

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin"] | Literal["log"] = "lin",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            # device=self.device,
            to_min=min,
            to_max=max,
            # from_min=self.parameter.range[0],
            # from_max=self.parameter.range[1],
            method=method,
            as_int=as_int,
            auto=min is None and max is None,
        )

    def __repr__(self):
        return str(self.__wrapped__)

    def __isub__(self, other):
        from .core import VirtualDevice

        other.device.unbind_link(other, self)

        return None  # we need to return None to avoid to trigger the __set__

    def install_fun(self, to_module, to_param):
        self.parameter.install_fun(to_module, to_param)

    def __int__(self):
        return int(self.__wrapped__)

    def __bool__(self):
        return bool(self.__wrapped__)

    def __float__(self):
        return float(self.__wrapped__)

    def repr(self):
        return (
            f"{id(self.device)}::{self.parameter.section_name}::{self.parameter.name}"
        )


@dataclass
class Scaler:
    data: Int | VirtualDevice | PadOrKey | ParameterInstance | PadsOrKeysInstance
    # device: Any
    to_min: int | float | None
    to_max: int | float | None
    method: str = "lin"
    as_int: bool = False
    # from_min: int | float | None = None
    # from_max: int | float | None = None
    auto: bool = False

    def __post_init__(self):
        if self.to_min == 0 and self.method == "log":
            self.to_min = 0.001
        self.as_int = (
            self.as_int or isinstance(self.to_min, int) and isinstance(self.to_max, int)
        )

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def convert_lin(self, value, from_min, from_max):
        if from_min is not None and value < from_min:
            value = from_min
        elif from_max is not None and value > from_max:
            value = from_max
        match from_min, from_max, self.to_min, self.to_max:
            case _, _, None, None:
                return value
            case None, from_max, to_min, None:
                offset = to_min
                v = value + offset
                return min(v, from_max + offset) if from_max is not None else v
            case None, None, to_min, to_max:
                return value
            case from_min, _, to_min, None:
                diff = abs(from_min - to_min)
                return value - diff if value > to_min else to_min
            case from_min, None, None, to_max:
                return value + from_min if value < to_max else to_max
            case from_min, None, to_min, to_max:
                return value if value < to_max else to_max
            case None, from_max, None, to_max:
                diff = abs(to_max - from_max)
                return value + diff if value + diff < to_max else to_max
            case from_min, from_max, None, to_max:
                return value - abs(to_max - from_min)
            case None, from_max, to_min, to_max:
                return (
                    to_max - (from_max - value)
                    if abs(value + to_min) < to_max
                    else to_max
                )
            case from_min, from_max, to_min, to_max:
                from_div = (from_max - from_min) if from_max != from_min else 1
                scaled_value = (value - from_min) / from_div
                return to_min + scaled_value * (to_max - to_min)

            case _:
                print(
                    f"No match: {self.from_min}, {self.from_max}, {self.to_min}, {self.to_max}"
                )
                return float(value)

    def convert_log(self, value, from_max) -> int | float:
        if self.to_min is None or self.to_max is None:
            print("Logarithmic scaling requires both min and max to be defined.")
            return value

        if value < 0:
            print(f"Logarithmic scaling is undefined for non-positive values {value}.")
            return value

        if self.to_min == 0:
            self.to_min = 0.001

        log_min = math.log(self.to_min)
        log_max = math.log(self.to_max)

        return math.exp(log_min + (value / from_max) * (log_max - log_min))

    def convert(self, value):
        from .core import VirtualDevice

        from_min, from_max = (
            self.data.range
            if isinstance(self.data, VirtualDevice)
            else self.data.parameter.range
        )
        if isinstance(value, Decimal):
            value = float(value)
        if self.method == "lin":
            res = self.convert_lin(value, from_min=from_min, from_max=from_max)
        elif self.method == "log":
            res = self.convert_log(value, from_max=from_max)
        else:
            raise Exception("Unknown conversion method")
        res = int(res) if self.as_int else res
        if isinstance(value, Int):
            value.update(res)
            return value
        return res

    def __call__(self, value, *args, **kwargs):
        return self.convert(value)


@dataclass
class ModuleParameter:
    type = "control_change"
    cc_note: int
    channel: int = 0
    name: str = NOT_INIT
    section_name: str = NOT_INIT
    init_value: int = 0
    description: str | None = None
    range: tuple[int, int] = (0, 127)

    def __post_init__(self):
        self.stream = False

    @property
    def min_range(self):
        return self.range[0]

    @property
    def max_range(self):
        return self.range[1]

    def __get__(self, instance, owner=None) -> Int | ModuleParameter:
        if instance is None:
            return self
        return instance.state[self.name]

    def install_fun(self, to_module, feeder, append=True):
        self.__set__(to_module, feeder, send=False)

    def generate_inner_fun_virtual(self, to_device, to_param):
        if to_param.consumer:
            from .core import ThreadContext

            return lambda value, ctx: to_device.receiving(
                value,
                on=to_param.name,
                ctx=ThreadContext({**ctx, "param": self.name}),
            )
        else:
            return lambda value, ctx: to_device.set_parameter(to_param.name, value)

    def generate_inner_fun_normal(self, to_device, to_param):
        return lambda value, ctx: setattr(to_device, to_param.name, value)

    def generate_fun(self, to_device, to_param):
        from .core import VirtualParameter

        if isinstance(to_param, VirtualParameter):
            return self.generate_inner_fun_virtual(to_device, to_param)
        return self.generate_inner_fun_normal(to_device, to_param)

    def __set__(self, to_module, feeder, send=True):
        if feeder is None:
            return

        from .core import ParameterInstance, VirtualDevice

        if isinstance(
            feeder,
            (
                ParameterInstance,
                Int,
                PadOrKey,
                PadsOrKeysInstance,
                VirtualDevice,
                Scaler,
            ),
        ):
            feeder.bind(getattr(to_module, self.name))
            return

        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            to_module.device.control_change(self.cc_note, feeder, channel=self.channel)
        to_module.state[self.name].update(feeder)

    def basic_set(self, device: MidiDevice, value):
        getattr(device.modules, self.section_name).state[self.name].update(value)


class padproperty(property):
    def __set__(self, instance, inner_function, owner=""):
        # pad: PadOrKey = getattr(instance, self.__name__)  # only works on python >= 3.13
        pad: PadOrKey = getattr(instance, self.fget.__name__)  # type: ignore
        if pad.mode == "latch":
            # raise Exception(
            #     "Latch mode is not supported when binding a pad/key to a function"
            # )
            print("Latch mode is not supported when binding a pad/key to a function")
        elif pad.mode == "hold":
            from .core import ThreadContext

            pad.device.bind(
                lambda value, ctx: (
                    inner_function(value, ctx) if ctx.type == "note_on" else ...
                ),
                type=pad.type,
                cc_note=pad.cc_note,
                param=pad,
                to=pad.device,
                from_=pad,
            )


@dataclass
class PadOrKey:
    device: MidiDevice
    pads_or_keys: "ModulePadsOrKeys"
    type: str = "note"
    cc_note: int = -1
    mode: str = "note"
    description: str | None = None
    range: tuple[int, int] = (0, 127)

    @property
    def section_name(self):
        if self.pads_or_keys:
            return self.pads_or_keys.section_name
        return NOT_INIT

    @property
    def min_range(self):
        return self.range[0]

    @property
    def max_range(self):
        return self.range[1]

    def __post_init__(self):
        self.triggered = False
        self.last_value = 0
        self.parameter = self
        self.name = f"#{self.cc_note}"
        self.stream = False

    def repr(self):
        return (
            f"{id(self.device)}::{self.parameter.section_name}::{self.parameter.name}"
        )

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def copy(self, device, cc_note, type, mode="note"):
        return self.__class__(
            device=device,
            cc_note=cc_note,
            type=type,
            mode=mode,
            pads_or_keys=self.pads_or_keys,
        )

    @padproperty
    def velocity(self):
        return self.copy(self.device, cc_note=self.cc_note, type="velocity")

    @padproperty
    def velocity_latch(self):
        return self.copy(
            self.device, cc_note=self.cc_note, type="velocity", mode="latch"
        )

    @padproperty
    def velocity_hold(self):
        return self.copy(
            self.device, cc_note=self.cc_note, type="velocity", mode="hold"
        )

    def set_last(self, value):
        self.last_value = value
        return self

    def toggle(self):
        self.triggered = not self.triggered
        return self

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin"] | Literal["log"] = "lin",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            # device=self.device,
            to_min=min,
            to_max=max,
            # from_min=self.range[0],
            # from_max=self.range[1],
            method=method,
            as_int=as_int,
            auto=min is None and max is None,
        )

    def generate_inner_fun_virtual_consumer(self, to_device, to_param):
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
                                "param": f"key/pad #{self.cc_note}",
                                "mode": self.mode,
                            }
                        ),
                    )
                    if ctx.type == "note_on"
                    else ...
                )
            )
        if self.mode == "latch":

            def foo(value, ctx, to_module, to_param, pad):
                if ctx.type == "note_off":
                    return
                if pad.toggle().triggered:
                    pad.set_last(value)
                    to_module.receiving(
                        value,
                        on=to_param.name,
                        ctx=ThreadContext(
                            {
                                **ctx,
                                "param": f"key/pad #{self.cc_note}",
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
                                "param": f"key/pad #{self.cc_note}",
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
                    "param": f"key/pad #{self.cc_note}",
                    "mode": self.mode,
                }
            ),
        )

    def generate_inner_fun_virtual_normal(self, to_device, to_param):
        if self.mode == "hold":
            lambda value, ctx: (
                to_device.set_parameter(to_param.name, value)
                if ctx.type == "note_on"
                else ...
            )
        if self.mode == "latch":
            ...
        return lambda value, ctx: to_device.set_parameter(to_param.name, value)

    def generate_inner_fun_midiparam(self, to_module, to_param):
        if self.mode == "latch":

            def foo(value, ctx, to_module, name, pad):
                if ctx.type == "note_off":
                    return
                if pad.toggle().triggered:
                    pad.set_last(int(getattr(to_module, name)))
                    setattr(to_module, name, value)
                else:
                    setattr(to_module, name, pad.last_value)

            return lambda value, ctx: foo(value, ctx, to_module, to_param.name, self)
        elif self.mode == "hold":
            return lambda value, ctx: (
                setattr(to_module, to_param.name, value)
                if ctx.type == "note_on"
                else ...
            )
        return lambda value, ctx: setattr(to_module, to_param.name, value)

    def generate_fun(self, to_device, to_param):
        from .core import VirtualParameter

        if isinstance(to_param, VirtualParameter):
            if to_param.consumer:
                return self.generate_inner_fun_virtual_consumer(to_device, to_param)
            else:
                return self.generate_inner_fun_virtual_normal(to_device, to_param)
        else:
            return self.generate_inner_fun_midiparam(to_device, to_param)

    def __isub__(self, other):
        other.device.unbind_link(other, self)

        # we need to return None here, otherwise we trigger again the __set__
        return None


class PadsOrKeysInstance:
    def __init__(self, parameter: ModulePadsOrKeys, device: MidiDevice):
        self.parameter = parameter
        self.device = device

    def repr(self):
        return (
            f"{id(self.device)}::{self.parameter.section_name}::{self.parameter.name}"
        )

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def __isub__(self, other):
        other.device.unbind_link(other, self)

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin"] | Literal["log"] = "lin",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            # device=self.device,
            to_min=min,
            to_max=max,
            # from_min=self.range[0],
            # from_max=self.range[1],
            method=method,
            as_int=as_int,
            auto=min is None and max is None,
        )


@dataclass
class ModulePadsOrKeys:
    type = "note"
    channel: int = 0
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
        return instance.state[self.section_name]

    def __set__(self, target, feeder):
        if feeder is None:
            return

        if isinstance(feeder, list):
            for f in feeder:
                f.bind(getattr(target, self.name))
        else:
            feeder.bind(getattr(target, self.name))

    def basic_send(self, type, note, velocity): ...


def debug(l):
    return lambda value, ctx: (print("->", value, ctx), l(value, ctx))


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
    state: dict[str, Int | PadsOrKeysInstance] = field(default_factory=dict)

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        parameters = []
        pads = None
        for name, value in vars(cls).items():
            if isinstance(value, ModuleParameter):
                value.name = name
                # value.section_name = cls.state_name
                parameters.append(value)
            if isinstance(value, ModulePadsOrKeys):
                pads = value
                value.name = name
                # pads.section_name = cls.state_name
        cls.meta = MetaModule(cls.__name__, parameters, pads)

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
            # self.state[state_name] = self.device  # type: ignore (special key)
            self.state[state_name] = PadsOrKeysInstance(
                self.meta.pads_or_keys, self.device
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
        pads = self[key]
        if not isinstance(pads, list):
            pads = [pads]
        match value:
            case PadOrKey():
                from_pad = value
                for to_pad in pads:
                    from_pad.bind(to_pad)
            case list():
                from_pads = value
                for from_pad, to_pad in zip(from_pads, pads):
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
        for state_name, ModuleCls in modules.items():
            ModuleCls.state_name = state_name
            moduleInstance = ModuleCls(device)
            init_modules[state_name] = moduleInstance
            for param in moduleInstance.meta.parameters:
                device.reverse_map[("control_change", param.cc_note)] = param
            if moduleInstance.meta.pads_or_keys:
                device.reverse_map[("note", None)] = moduleInstance.meta.pads_or_keys
        self.modules = init_modules

    def __getattr__(self, name):
        return self.modules[name]

    def as_dict_patch(self, with_meta=False):
        d = {}
        for name, module in self.modules.items():
            module_state = {}
            d[name] = module_state
            for parameter in module.meta.parameters:
                value = getattr(getattr(self, name), parameter.name)
                module_state[parameter.name] = int(value)
                if with_meta:
                    module_state[parameter.name] = {
                        "section_name": parameter.section_name,
                        "value": int(value),
                    }
            if not module_state:
                del d[name]
        return d

    def from_dict_patch(self, d):
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
