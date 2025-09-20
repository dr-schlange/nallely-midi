from dataclasses import asdict
from typing import cast

from ..utils import get_note_name
from .parameter_instances import (
    Int,
    PadOrKey,
    PadsOrKeysInstance,
    ParameterInstance,
    PitchwheelInstance,
)
from .scaler import Scaler
from .virtual_device import VirtualDevice, VirtualParameter
from .world import ThreadContext

DEFAULT_VELOCITY = 64


# Callback compilation Matrix
#   (1) Int                -> MIDI CC
#   (2) PadOrKey           -> MIDI device single pad/key
#   (3) PadsOrKeysInstance -> MIDI device whole pads/keys as one entity
#   (4) ParameterInstance  -> Virtual device input or output (depending if src or dst)
#   (5) PitchwheelInstance -> MIDI device pitch wheel
#
#  src\dest (1) (2) (3) (4) (5)
#    (1)     X   X   X   X   X
#    (2)     X   X   X   X   X
#    (3)     X       X   X   X
#    (4)     X       X   X   X
#    (5)     X       X   X   X
#
class Link:
    def __init__(
        self,
        src_feeder: (
            Int
            | PadOrKey
            | PadsOrKeysInstance
            | ParameterInstance
            | Scaler
            | VirtualDevice
            | PitchwheelInstance
        ),
        dest: (
            Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | PitchwheelInstance
        ),
        uuid: int = 0,
        bouncy: bool = False,
        muted: bool = False,
    ):
        self.src_feeder = src_feeder
        self.dest = dest
        self.bouncy = bouncy
        self.uuid = uuid if uuid else id(self)
        self.muted = muted
        self.__post_init__()

    @classmethod
    def create(cls, src_feeder, dest):
        link = cls(src_feeder, dest)
        link.install()
        return link

    def __post_init__(self):
        self.debug = False
        self.chain = None
        src = self.src_feeder
        if isinstance(src, Scaler):
            self.chain = src
            src = src.data
        if isinstance(src, VirtualDevice):
            src = src.output_cv
        self.src: (
            Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | PitchwheelInstance
        ) = src
        self.callback = None
        self.cleanup_callback = None

    def install(self):
        self._install_callback()
        return self

    def uninstall(self):
        self.src.device.unbind_link(self.src, self.dest)

    def cleanup(self):
        if not self.cleanup_callback:
            return
        self.cleanup_callback()

    def trigger(self, value, ctx):
        if self.muted:
            return
        assert self.callback
        ctx.raw_value = value
        if self.chain:
            value = self.chain(value, ctx)
        if self.debug:
            print(f"# {value} -- {self.callback.__qualname__}\n" f"  {ctx}\n")
        result = self.callback(value, ctx)
        if self.bouncy:
            self.dest.device.bounce_link(self.dest, value, ctx)
        return result

    def src_repr(self):
        return self.src.repr()

    def dest_repr(self):
        return self.dest.repr()

    @property
    def is_stream(self):
        return self.dest.parameter.stream

    # @staticmethod
    # def get_channel(prop: Int | PadOrKey | PadsOrKeysInstance | PitchwheelInstance):
    #     return (
    #         prop.parameter.channel
    #         if prop.parameter.channel is not None
    #         else prop.device.channel
    #     )

    def to_dict(self):
        src = self.src.parameter
        if isinstance(src, PadOrKey):
            from_ = {
                "note": src.cc_note,
                "type": src.type,
                "name": get_note_name(src.cc_note),
                "section_name": src.pads_or_keys.section_name,
                "mode": src.mode,
            }
        else:
            from_ = asdict(src)
        dst = self.dest.parameter
        if isinstance(dst, PadOrKey):
            to_ = {
                "note": dst.cc_note,
                "type": dst.type,
                "name": get_note_name(dst.cc_note),
                "section_name": dst.pads_or_keys.section_name,
                "mode": dst.mode,
            }
        else:
            to_ = asdict(dst)
        return {
            "id": self.uuid,
            "src": {
                "device": self.src.device.uuid,
                "repr": self.src.device.uid(),
                "parameter": from_,
                "explicit": src.cc_note,
                "chain": self.scaler_as_dict(),
                "type": ("virtual" if isinstance(src, VirtualParameter) else src.type),
            },
            "dest": {
                "device": self.dest.device.uuid,
                "repr": self.dest.device.uid(),
                "parameter": to_,
                "explicit": src.cc_note,
                "type": ("virtual" if isinstance(dst, VirtualParameter) else dst.type),
            },
            "bouncy": self.bouncy,
            "muted": self.muted,
        }

    def scaler_as_dict(self):
        scaler = self.chain
        if not scaler:
            return None
        # Scaler (chain) doesn't need to have an enforced UUID at the moment
        return {
            "id": id(scaler),
            "device": self.src.device.uuid,
            "to_min": scaler.to_min,
            "to_max": scaler.to_max,
            "auto": scaler.auto,
            "method": scaler.method,
            "as_int": scaler.as_int,
        }

    def _dispatch(self, domain):
        src_cls = (
            "VirtualDevice"
            if isinstance(self.src, VirtualDevice)
            else self.src.__class__.__name__
        )
        dest_cls = self.dest.__class__.__name__
        domain_name = f"_{domain}_{src_cls}__{dest_cls}"
        return getattr(self, domain_name)()

    def _install_callback(self):
        return self._dispatch("install")

    # MIDI Device CC -> MIDI Device CC
    def _install_Int__Int(self):
        src = cast(Int, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_Int__Int()
        src.device.bind_link(link=self)

    def _compile_Int__Int(self):
        dest = cast(Int, self.dest)
        section = getattr(dest.device.modules, dest.parameter.section_name)
        return lambda value, ctx: setattr(section, dest.parameter.name, value)

    # MIDI Device Key/Pad -> MIDI Device CC
    def _install_PadOrKey__Int(self):
        src = cast(PadOrKey, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_PadOrKey__Int()
        src.device.bind_link(self)

    def _compile_PadOrKey__Int(self):
        src = cast(PadOrKey, self.src)
        dest = cast(Int, self.dest)
        section = getattr(dest.device.modules, dest.parameter.section_name)
        return src.generate_inner_fun_midiparam(section, self.dest.parameter)

    # Virtual Device Output -> MIDI Device CC
    def _install_ParameterInstance__Int(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_ParameterInstance__Int()
        src.device.bind_link(self)

    def _compile_ParameterInstance__Int(self):
        dest = cast(Int, self.dest)
        section = getattr(dest.device.modules, dest.parameter.section_name)
        return lambda value, ctx: setattr(section, self.dest.parameter.name, value)

    # MIDI pads/keys -> MIDI Device CC
    def _install_PadsOrKeysInstance__Int(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_PadsOrKeysInstance__Int()
        src.device.bind_link(self)

    def _compile_PadsOrKeysInstance__Int(self):
        dest = cast(Int, self.dest)
        section = getattr(dest.device.modules, dest.parameter.section_name)
        return lambda value, ctx: setattr(section, dest.parameter.name, value)

    # MIDI Device CC -> Virtual Device Input
    def _install_Int__ParameterInstance(self):
        src = cast(Int, self.src)
        dest = cast(ParameterInstance, self.dest)

        self.callback = self._compile_Int__ParameterInstance()
        src.device.bind_link(self)

    def _compile_Int__ParameterInstance(self):
        src = cast(Int, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        if is_blocking_consummer:
            return lambda value, ctx: dest.device.receiving(
                value,
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.parameter.name}),
            )
        else:
            return lambda value, ctx: dest.device.set_parameter(
                dest.parameter.name, value, ctx
            )

    # MIDI pads/keys -> Virtual device input
    def _install_PadsOrKeysInstance__ParameterInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        self.callback = self._compile_PadsOrKeysInstance__ParameterInstance()
        src.device.bind_link(self)

    def _compile_PadsOrKeysInstance__ParameterInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        # This count is "global" to the link instance only
        count = {}

        def foo(value, ctx):
            nonlocal count
            type = ctx.get("type", "note_off" if ctx.raw_value == 0 else "note_on")
            if type == "note_on":
                count[value] = ctx.get("velocity", DEFAULT_VELOCITY)
                return dest.device.set_parameter(dest.parameter.name, value, ctx)
            elif type == "note_off" and value in count:
                ctx.velocity = count[value]
                del count[value]
                dest.device.set_parameter(dest.parameter.name, value, ctx)
                return dest.device.set_parameter(dest.parameter.name, 0, ctx)

        return foo

    # MIDI pad/key -> Virtual device input
    def _install_PadOrKey__ParameterInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(ParameterInstance, self.dest)

        self.callback = self._compile_PadOrKey__ParameterInstance()
        src.device.bind_link(self)

    def _compile_PadOrKey__ParameterInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        if is_blocking_consummer:
            return src.generate_inner_fun_virtual_consumer(dest.device, dest.parameter)
        else:
            return src.generate_inner_fun_virtual_normal(dest.device, dest.parameter)

    # Virtual Device Ouput -> Virtual Device Input
    def _install_ParameterInstance__ParameterInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        if src.parameter.cv_name == "output_cv":
            self.callback = (
                self._compile_ParameterInstanceDefaultOutput__ParameterInstance()
            )
        else:
            self.callback = self._compile_ParameterInstance__ParameterInstance()
        src.device.bind_link(self)

    def _compile_ParameterInstanceDefaultOutput__ParameterInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        if is_blocking_consummer:
            return lambda value, ctx: dest.device.receiving(
                value,
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.device.__class__.__name__}),
            )
        else:
            return lambda value, ctx: dest.device.set_parameter(
                dest.parameter.name, value, ctx
            )

    def _compile_ParameterInstance__ParameterInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        # src_section = getattr(src.device, src.parameter.section_name)
        # src_param = src.parameter.name
        # chain = self.chain or (lambda x: x)
        if is_blocking_consummer:
            return lambda value, ctx: dest.device.receiving(
                # chain(getattr(src_section, src_param)),
                value,
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.parameter.name}),
            )
        else:
            return lambda value, ctx: dest.device.set_parameter(
                # dest.parameter.name, chain(getattr(src_section, src_param)), ctx
                dest.parameter.name,
                value,
                ctx,
            )

    # MIDI key/pad -> MIDI key/pad
    def _install_PadOrKey__PadOrKey(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PadOrKey, self.dest)

        self.callback = self._compile_PadOrKey__PadOrKey()
        src.device.bind_link(self)

    def _compile_PadOrKey__PadOrKey(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PadOrKey, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            ctx.get("type", "note_off" if ctx.raw_value else "note_on"),
            dest.parameter.cc_note,
            ctx.velocity,
            channel=dest.parameter.channel,
        )

    # MIDI CC -> MIDI key/pad
    def _install_Int__PadOrKey(self):
        src = cast(Int, self.src)
        dest = cast(PadOrKey, self.dest)

        self.callback = self._compile_Int__PadOrKey()
        src.device.bind_link(self)

    def _compile_Int__PadOrKey(self):
        src = cast(Int, self.src)
        dest = cast(PadOrKey, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            "note_on" if value > 0 else "note_off",
            note=dest.parameter.cc_note,
            velocity=value,
            channel=dest.parameter.channel,
        )

    # MIDI pads/keys -> MIDI pads/keys
    def _install_PadsOrKeysInstance__PadsOrKeysInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.callback = self._compile_PadsOrKeysInstance__PadsOrKeysInstance()
        src.device.bind_link(self)

    def _compile_PadsOrKeysInstance__PadsOrKeysInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            note=value,
            velocity=ctx.get("velocity", DEFAULT_VELOCITY),
            type=ctx.get("type", "note_off" if ctx.raw_value else "note_on"),
            channel=dest.parameter.channel,
        )

    # MIDI pad/key -> MIDI pads/keys
    def _install_PadOrKey__PadsOrKeysInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.callback = self._compile_PadOrKey__PadsOrKeysInstance()
        src.device.bind_link(self)

    def _compile_PadOrKey__PadsOrKeysInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            note=value,
            velocity=ctx.get("velocity", DEFAULT_VELOCITY),
            type=ctx.get("type", "note_off" if ctx.raw_value else "note_on"),
            channel=dest.parameter.channel,
        )

    # Virtual device output -> MIDI pads/keys
    def _install_ParameterInstance__PadsOrKeysInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.callback = self._compile_ParameterInstance__PadsOrKeysInstance()
        src.device.bind_link(self)

    def _compile_ParameterInstance__PadsOrKeysInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.cleanup_callback = lambda: dest.device.all_notes_off()
        lower_range_value, _ = dest.parameter.range

        previous = None
        # get_channel = self.get_channel

        def foo(value, ctx):
            value = round(value)
            nonlocal previous
            # nonlocal get_channel
            if previous != value:
                if lower_range_value != value and ctx.raw_value != 0:
                    dest.device.note(
                        note=value,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_on",
                        channel=dest.parameter.channel,
                    )
                if previous:
                    dest.device.note(
                        note=previous,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_off",
                        channel=dest.parameter.channel,
                    )
                previous = value
            else:
                dest.device.note(
                    note=previous,
                    velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                    type="note_off",
                    channel=dest.parameter.channel,
                )
                previous = None

        return foo

    # MIDI CC -> MIDI pads/keys
    def _install_Int__PadsOrKeysInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.callback = self._compile_Int__PadsOrKeysInstance()
        src.device.bind_link(self)

    def _compile_Int__PadsOrKeysInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        previous = None
        # get_channel = self.get_channel

        def foo(value, ctx):
            value = round(value)
            nonlocal previous
            # nonlocal get_channel
            if previous != value:
                if round(ctx.raw_value) != 0:
                    dest.device.note(
                        note=value,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_on",
                        channel=dest.parameter.channel,
                    )
                if previous:
                    dest.device.note(
                        note=previous,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_off",
                        channel=dest.parameter.channel,
                    )
                previous = value

        return foo

    # MIDI Pitchwheel -> MIDI CC
    def _install_PitchwheelInstance__Int(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_PitchwheelInstance__Int()
        src.device.bind_link(self)

    def _compile_PitchwheelInstance__Int(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(Int, self.dest)

        section = getattr(dest.device.modules, dest.parameter.section_name)
        return lambda value, ctx: setattr(section, dest.parameter.name, value)

    # MIDI Pitchwheel -> MIDI pads/keys
    def _install_PitchwheelInstance__PadsOrKeysInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.callback = self._compile_PitchwheelInstance__PadsOrKeysInstance()
        src.device.bind_link(self)

    def _compile_PitchwheelInstance__PadsOrKeysInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(PadsOrKeysInstance, self.dest)

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        previous = None
        # get_channel = self.get_channel

        def foo(value, ctx):
            value = round(value)
            nonlocal previous
            # nonlocal get_channel
            if previous != value:
                if round(ctx.raw_value) != 0:
                    dest.device.note(
                        note=value,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_on",
                        channel=dest.parameter.channel,
                    )
                if previous:
                    dest.device.note(
                        note=previous,
                        velocity=ctx.get("velocity", DEFAULT_VELOCITY),
                        type="note_off",
                        channel=dest.parameter.channel,
                    )
                previous = value

        return foo

    # MIDI Pitchwheel -> Virtual Device Input
    def _install_PitchwheelInstance__ParameterInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        self.callback = self._compile_PitchwheelInstance__ParameterInstance()
        src.device.bind_link(self)

    def _compile_PitchwheelInstance__ParameterInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        if is_blocking_consummer:
            return lambda value, ctx: dest.device.receiving(
                value,
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.parameter.name}),
            )
        else:
            return lambda value, ctx: dest.device.set_parameter(
                dest.parameter.name, value, ctx
            )

    # MIDI Pitchwheel -> MIDI Pitchwheel
    def _install_PitchwheelInstance__PitchwheelInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)

        self.callback = self._compile_PitchwheelInstance__PitchwheelInstance()
        src.device.bind_link(self)

    def _compile_PitchwheelInstance__PitchwheelInstance(self):
        src = cast(PitchwheelInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.pitchwheel(
            0, channel=dest.parameter.channel
        )

        return lambda value, ctx: dest.device.pitchwheel(
            value, channel=dest.parameter.channel
        )

    # MIDI CC -> MIDI Pitchwheel
    def _install_Int__PitchwheelInstance(self):
        src = cast(Int, self.src)
        dest = cast(PitchwheelInstance, self.dest)

        self.callback = self._compile_Int__PitchwheelInstance()
        src.device.bind_link(self)

    def _compile_Int__PitchwheelInstance(self):
        src = cast(Int, self.src)
        dest = cast(PitchwheelInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.pitchwheel(
            0, channel=dest.parameter.channel
        )

        return lambda value, ctx: dest.device.pitchwheel(
            value, channel=dest.parameter.channel
        )

    # MIDI key/pad -> MIDI Pitchwheel
    def _install_PadOrKey__PitchwheelInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PitchwheelInstance, self.dest)

        self.callback = self._compile_PadOrKey__PitchwheelInstance()
        src.device.bind_link(self)

    def _compile_PadOrKey__PitchwheelInstance(self):
        src = cast(PadOrKey, self.src)
        dest = cast(PitchwheelInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.pitchwheel(
            0, channel=dest.parameter.channel
        )

        return lambda value, ctx: dest.device.pitchwheel(
            value, channel=dest.parameter.channel
        )

    # MIDI pads/keys -> MIDI Pitchwheel
    def _install_PadsOrKeysInstance__PitchwheelInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)

        self.callback = self._compile_PadsOrKeysInstance__PitchwheelInstance()
        src.device.bind_link(self)

    def _compile_PadsOrKeysInstance__PitchwheelInstance(self):
        src = cast(PadsOrKeysInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.pitchwheel(
            0, channel=dest.parameter.channel
        )

        return lambda value, ctx: dest.device.pitchwheel(
            value, channel=dest.parameter.channel
        )

    # Virtual output -> MIDI Pitchwheel
    def _install_ParameterInstance__PitchwheelInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)

        self.callback = self._compile_ParameterInstance__PitchwheelInstance()
        src.device.bind_link(self)

    def _compile_ParameterInstance__PitchwheelInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(PitchwheelInstance, self.dest)
        # get_channel = self.get_channel

        self.cleanup_callback = lambda: dest.device.pitchwheel(
            0, channel=dest.parameter.channel
        )

        return lambda value, ctx: dest.device.pitchwheel(
            value, channel=dest.parameter.channel
        )
