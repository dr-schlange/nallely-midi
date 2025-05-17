from dataclasses import dataclass
from typing import cast

from .core import MidiDevice, ParameterInstance, ThreadContext, VirtualDevice
from .modules import Int, ModulePadsOrKeys, PadOrKey, PadsOrKeysInstance, Scaler


@dataclass
class Link:
    src_feeder: (
        Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | Scaler | VirtualDevice
    )
    dest: Int | PadOrKey | PadsOrKeysInstance | ParameterInstance

    @classmethod
    def create(cls, src_feeder, dest):
        link = cls(src_feeder, dest)
        link.install()
        return link

    def __post_init__(self):
        self.chain = None
        src = self.src_feeder
        if isinstance(src, Scaler):
            self.chain = src
            src = src.data
        if isinstance(src, VirtualDevice):
            src = src.output_cv
        self.src: Int | PadOrKey | PadsOrKeysInstance | ParameterInstance = src
        self.callback = None

    def install(self):
        self._install_callback()
        return self

    def uninstall(self):
        self.src.device.unbind_link(self.src, self.dest)

    def trigger(self, value, ctx):
        assert self.callback
        if self.chain:
            value = self.chain(value, ctx)
        return self.callback(value, ctx)

    def src_repr(self):
        return f"{id(self.src.device)}::{self.src.parameter.section_name}::{self.src.parameter.name}"

    def dest_repr(self):
        return f"{id(self.dest.device)}::{self.dest.parameter.section_name}::{self.dest.parameter.name}"

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
        return lambda value, ctx: setattr(
            self.dest.device, self.dest.parameter.name, value
        )

    # MIDI Device Key/Pad -> MIDI Device CC
    def _install_PadOrKey__Int(self):
        src = cast(PadOrKey, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_PadOrKey__Int()
        src.device.bind_link(self)

    def _compile_PadOrKey__Int(self):
        src = cast(PadOrKey, self.src)
        return src.generate_inner_fun_midiparam(self.dest.device, self.dest.parameter)

    # Virtual Device Output -> MIDI Device CC
    def _install_ParameterInstance__Int(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(Int, self.dest)

        self.callback = self._compile_ParameterInstance__Int()
        src.device.bind_link(self)

    def _compile_ParameterInstance__Int(self):
        return lambda value, ctx: setattr(
            self.dest.device, self.dest.parameter.name, value
        )

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
                dest.parameter.name, value
            )

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
            return lambda _, ctx: lambda value, ctx: dest.device.set_parameter(
                dest.parameter.name, value
            )

    def _compile_ParameterInstance__ParameterInstance(self):
        src = cast(ParameterInstance, self.src)
        dest = cast(ParameterInstance, self.dest)

        is_blocking_consummer = dest.parameter.consumer
        if is_blocking_consummer:
            return lambda _, ctx: dest.device.receiving(
                getattr(src.device, src.parameter.name),
                on=dest.parameter.name,
                ctx=ThreadContext({**ctx, "param": src.parameter.name}),
            )
        else:
            return lambda _, ctx: dest.device.set_parameter(
                dest.parameter.name, getattr(src.device, src.parameter.name)
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

        return lambda value, ctx: dest.device.note(
            ctx.type, dest.parameter.cc_note, ctx.velocity
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

        def foo(value, ctx):
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

        def foo(value, ctx):
            if value == 0:
                dest.device.all_notes_off()
                return
            dest.device.note(
                note=value,
                velocity=127,
                type="note_off" if value == 0 else "note_on",
            )

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
