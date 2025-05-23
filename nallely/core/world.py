import json
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Callable, Type

import mido

if TYPE_CHECKING:
    from .midi_device import MidiDevice, ModulePadsOrKeys, ModuleParameter
    from .parameter_instances import PadOrKey, ParameterInstance
    from .virtual_device import VirtualDevice, VirtualParameter


virtual_devices: list["VirtualDevice"] = []
connected_devices: list["MidiDevice"] = []
midi_device_classes: list[Type] = []
virtual_device_classes: list[Type] = []


def no_registration(cls):
    try:
        midi_device_classes.remove(cls)
    except ValueError:
        ...
    try:
        virtual_device_classes.remove(cls)
    except ValueError:
        ...
    return cls


def need_registration(cls):
    return cls.__dict__.get("registrer", True)


def stop_all_virtual_devices(skip_unregistered=False):
    for device in list(virtual_devices):
        if skip_unregistered and getattr(device, "forever", False):
            continue
        device.stop()


def stop_all_connected_devices(skip_unregistered=False, force_note_off=True):
    stop_all_virtual_devices(skip_unregistered)
    for device in list(connected_devices):
        if force_note_off:
            device.all_notes_off()
        if skip_unregistered and getattr(device, "forever", False):
            continue
        device.close()


def get_connected_devices():
    return connected_devices


def get_virtual_devices():
    return virtual_devices


def all_devices():
    return get_connected_devices() + get_virtual_devices()


def unbind_all():
    for device in all_devices():
        device.unbind_all()


def get_all_virtual_parameters(cls):
    from .virtual_device import VirtualParameter

    out = {}
    for base in reversed(cls.__mro__):
        for k, v in base.__dict__.items():
            # if not k.startswith("__") and not callable(v):
            if isinstance(v, VirtualParameter):
                out[k] = v
    return out


class ThreadContext(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self["last_value"] = None

    def __getattr__(self, key):
        return self[key]

    def __setattr__(self, key, value):
        self[key] = value

    @property
    def parent(self):
        return self["parent"]

    @parent.setter
    def parent(self, value):
        self["parent"] = value


class CallbackRegistryEntry:
    def __init__(
        self,
        target: "VirtualDevice | MidiDevice",
        parameter: "VirtualParameter | ModuleParameter | ModulePadsOrKeys | PadOrKey | ParameterInstance",
        from_: "VirtualParameter | ModuleParameter | ModulePadsOrKeys | PadOrKey",
        callback: Callable[[Any, ThreadContext], Any],
        chain: Callable | None,
        cc_note: int | None = None,
        type: str | None = None,
    ):
        self.target = target
        self.parameter = parameter
        self.callback = callback
        self.cc_note = cc_note
        self.type = type
        self.chain = chain
        self.from_ = from_


class DeviceSerializer(json.JSONEncoder):
    def default(self, o):
        from .parameter_instances import Int

        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, Int):
            return int(o)
        return super().default(o)


class DeviceNotFound(Exception):
    def __init__(self, device_name):
        super().__init__(
            f"MIDI port {device_name!r} couldn't be found, known devices are:\n"
            f"  input: {mido.get_output_names()}\n"  # type: ignore
            f"  outputs: {mido.get_input_names()}"  # type: ignore
        )
