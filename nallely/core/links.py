from dataclasses import dataclass
from typing import cast

from .parameter_instances import Int, PadOrKey, PadsOrKeysInstance, ParameterInstance
from .scaler import Scaler
from .virtual_device import VirtualDevice
from .world import ThreadContext


# Callback compilation Matrix
#   (1) Int                -> MIDI CC
#   (2) PadOrKey           -> MIDI device single pad/key
#   (3) PadsOrKeysInstance -> MIDI device whole pads/keys as one entity
#   (4) ParameterInstance  -> Virtual device input or output (depending if src or dst)
#
#  src\dest (1) (2) (3) (4)
#    (1)     X   X   X   X
#    (2)     X   X   X   X
#    (3)     X       X   X
#    (4)     X       X   X
#
@dataclass
class Link:
    src_feeder: (
        Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | Scaler | VirtualDevice
    )
    dest: Int | PadOrKey | PadsOrKeysInstance | ParameterInstance
    bouncy: bool = False

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
        self.src: Int | PadOrKey | PadsOrKeysInstance | ParameterInstance = src
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
        assert self.callback
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
        count = set()

        def foo(value, ctx):
            nonlocal count
            if ctx.type == "note_on":
                count.add(value)
            elif ctx.type == "note_off" and value in count:
                count.remove(value)
            if count:
                return dest.device.set_parameter(dest.parameter.name, value, ctx)
            else:
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
        src_section = getattr(src.device, src.parameter.section_name)
        src_param = src.parameter.name
        chain = self.chain or (lambda x: x)
        if is_blocking_consummer:
            return lambda _, ctx: dest.device.receiving(
                chain(getattr(src_section, src_param)),
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.parameter.name}),
            )
        else:
            return lambda _, ctx: dest.device.set_parameter(
                dest.parameter.name, chain(getattr(src_section, src_param)), ctx
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

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            ctx.type, dest.parameter.cc_note, ctx.velocity
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

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            "note_on" if value > 0 else "note_off",
            note=dest.parameter.cc_note,
            velocity=value,
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

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            note=value, velocity=ctx.velocity, type=ctx.type
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

        self.cleanup_callback = lambda: dest.device.all_notes_off()

        return lambda value, ctx: dest.device.note(
            note=value, velocity=ctx.velocity, type=ctx.type
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

        def foo(value, ctx):
            is_note = ctx.get("type")
            if is_note in ("note_off", "note_on"):
                dest.device.note(
                    note=value, velocity=ctx.get("velocity", 127), type=is_note
                )
                return
            if value == 0:
                dest.device.all_notes_off()
                return
            dest.device.note(
                note=value,
                velocity=127,
                type="note_off" if value == 0 else "note_on",
            )

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

        def foo(value, ctx):
            is_note = ctx.get("type")
            if is_note in ("note_off", "note_on"):
                dest.device.note(
                    note=value, velocity=ctx.get("velocity", 127), type=is_note
                )
                return
            if value == 0:
                dest.device.all_notes_off()
                return
            dest.device.note(
                note=value,
                velocity=127,
                type="note_off" if value == 0 else "note_on",
            )

        return foo


def debug(l):
    def foo(value, ctx):
        print("->", value, ctx)
        r = l(value, ctx)
        return r

    return foo
