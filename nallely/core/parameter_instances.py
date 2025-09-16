from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from .scaler import Scaler
from .world import ThreadContext

if TYPE_CHECKING:
    from .midi_device import (
        MidiDevice,
        ModulePadsOrKeys,
        ModuleParameter,
        ModulePitchwheel,
    )
    from .virtual_device import VirtualDevice, VirtualParameter


class ParameterInstance:
    def __init__(self, parameter: "VirtualParameter", device: "VirtualDevice"):
        self.parameter = parameter
        self.device = device

    @property
    def name(self):
        return self.parameter.name

    def repr(self):
        return f"{self.device.uuid}::{self.parameter.section_name}::{self.parameter.cv_name}"

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def __isub__(self, other):
        other.device.unbind_link(other, self)
        #  we need to return None to avoid to trigger the __set__ again
        return None

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin", "log"] = "lin",
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

    def value(self):
        return object.__getattribute__(self.device, self.parameter.name)


class Int(int):
    def __init__(self, val):
        super().__init__()
        self.__wrapped__: int
        self.device: "MidiDevice"
        self.parameter: "ModuleParameter"

    @classmethod
    def create(
        cls, val: int, device: "MidiDevice", parameter: "ModuleParameter"
    ) -> "Int":
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
        method: Literal["lin", "log"] = "lin",
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

    def __round__(self, ndigits=None) -> int:
        return round(self.__wrapped__, ndigits)

    def repr(self):
        return (
            f"{self.device.uuid}::{self.parameter.section_name}::{self.parameter.name}"
        )


class PadsOrKeysInstance:
    def __init__(self, parameter: "ModulePadsOrKeys", device: "MidiDevice"):
        self.parameter = parameter
        self.device = device

    def repr(self):
        return (
            f"{self.device.uuid}::{self.parameter.section_name}::{self.parameter.name}"
        )

    def bind(self, target):
        from .links import Link

        Link.create(self, target)

    def __isub__(self, other):
        other.device.unbind_link(other, self)

    def __getitem__(self, key):
        return getattr(self.device.modules, self.parameter.section_name)[key]

    def __setitem__(self, key, value):
        getattr(self.device.modules, self.parameter.section_name)[key] = value

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin", "log"] = "lin",
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


class PitchwheelInstance:
    def __init__(self, parameter: "ModulePitchwheel", device: "MidiDevice"):
        self.parameter = parameter
        self.device = device

    def repr(self):
        return (
            f"{self.device.uuid}::{self.parameter.section_name}::{self.parameter.name}"
        )

    def __isub__(self, other):
        other.device.unbind_link(other, self)

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin", "log"] = "lin",
        as_int: bool = False,
    ):
        return Scaler(
            data=self,
            to_min=min,
            to_max=max,
            method=method,
            as_int=as_int,
            auto=min is None and max is None,
        )


class padproperty(property):
    def __set__(self, instance, inner_function, owner=""):
        ...  # This would be called if function binding is reactivated (currently removed)
        # # pad: PadOrKey = getattr(instance, self.__name__)  # only works on python >= 3.13
        # pad: PadOrKey = getattr(instance, self.fget.__name__)  # type: ignore
        # if pad.mode == "latch":
        #     # raise Exception(
        #     #     "Latch mode is not supported when binding a pad/key to a function"
        #     # )
        #     print("Latch mode is not supported when binding a pad/key to a function")
        # elif pad.mode == "hold":
        #     from .core import ThreadContext

        #     pad.device.bind(
        #         lambda value, ctx: (
        #             inner_function(value, ctx) if ctx.type == "note_on" else ...
        #         ),
        #         type=pad.type,
        #         cc_note=pad.cc_note,
        #         param=pad,
        #         to=pad.device,
        #         from_=pad,
        #     )


@dataclass
class PadOrKey:
    device: "MidiDevice"
    pads_or_keys: "ModulePadsOrKeys"
    type: str = "note"
    cc_note: int = -1
    mode: str = "note"
    description: str | None = None
    channel: int | None = None
    range: tuple[int, int] = (0, 127)

    @property
    def section_name(self):
        from .midi_device import NOT_INIT

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
            f"{self.device.uuid}::{self.parameter.section_name}::{self.parameter.name}"
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
        method: Literal["lin", "log"] = "lin",
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
                to_device.set_parameter(to_param.name, value, ctx)
                if ctx.type == "note_on"
                else ...
            )
        if self.mode == "latch":
            ...
        return lambda value, ctx: to_device.set_parameter(to_param.name, value, ctx)

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
        from .virtual_device import VirtualParameter

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
