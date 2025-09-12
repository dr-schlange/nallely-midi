from .clocks import Clock
from .core import (
    DeviceNotFound,
    MidiDevice,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
    ModulePitchwheel,
    PadOrKey,
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
    all_devices,
    connected_devices,
    midi_device_classes,
    on,
    stop_all_connected_devices,
    stop_all_virtual_devices,
    virtual_device_classes,
    virtual_devices,
)
from .eg import VCA, ADSREnvelope, Gate, SampleHold, SeqSwitch, Switch
from .lfos import LFO, Cycler
from .logicals import Comparator, WindowDetector
from .shifter import Arpegiator, Looper, Modulo, PitchShifter, Quantizer, ShiftRegister
from .websocket_bus import WebSocketBus

# For retrocompatibility of some patchs
FlexibleClock = Clock

__all__ = [
    "stop_all_connected_devices",
    "stop_all_virtual_devices",
    "VirtualDevice",
    "VirtualParameter",
    "MidiDevice",
    "DeviceNotFound",
    "ModuleParameter",
    "PadOrKey",
    "ModulePadsOrKeys",
    "Module",
    "WebSocketBus",
    "LFO",
    "Cycler",
    "ADSREnvelope",
    "virtual_device_classes",
    "virtual_devices",
    "all_devices",
    "connected_devices",
    "midi_device_classes",
    "ThreadContext",
    "on",
    "ModulePitchwheel",
    "VCA",
    "Gate",
    "PitchShifter",
    "Switch",
    "Modulo",
    "Arpegiator",
    "Looper",
    "SampleHold",
    "ShiftRegister",
    "Quantizer",
    "FlexibleClock",
    "Clock",
    "Comparator",
    "SeqSwitch",
    "WindowDetector",
]
