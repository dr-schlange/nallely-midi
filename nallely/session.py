import json
from dataclasses import asdict
from pathlib import Path

import mido

from .core import (
    DeviceNotFound,
    MidiDevice,
    PadOrKey,
    VirtualDevice,
    VirtualParameter,
    all_devices,
    connected_devices,
    midi_device_classes,
    virtual_device_classes,
    virtual_devices,
)
from .trevor import TrevorAPI
from .utils import StateEncoder, find_class, get_note_name, longest_common_substring
from .websocket_bus import WebSocketBus


class Session:
    def __init__(self, trevor_bus=None):
        self.trevor_bus = trevor_bus
        self.trevor = trevor_bus.trevor if trevor_bus else TrevorAPI()
        self.code = ""

    def save_code(self, code):
        self.code = code

    @staticmethod
    def to_json(obj, **kwargs):
        return json.dumps(obj, cls=StateEncoder, **kwargs)

    def load_all(self, name):
        from .trevor.trevor_bus import TrevorBus

        file = Path(name)
        content = None
        with file.open("r", encoding="utf-8") as f:
            content = json.load(f)
        if not content:
            return self.snapshot()

        self.trevor.reset_all()

        self.code = content.get("playground_code")

        # loads the midi and virtual devices
        device_map = {}
        errors = []
        for device in content.get("midi_devices", []):
            common_port = longest_common_substring(
                device["ports"]["input"], device["ports"]["output"]
            )
            device_class_name = device["class"]
            try:
                cls = find_class(device_class_name)
                devices = all_devices()
                try:
                    autoconnect = common_port or False
                    mididev: MidiDevice = cls(
                        device_name=common_port, autoconnect=autoconnect
                    )
                except DeviceNotFound:
                    # If there is a problem we remove the auto-connection
                    diff = next(
                        (item for item in all_devices() if item not in devices),
                        None,
                    )
                    if diff:
                        diff.stop()
                    mididev = cls(autoconnect=False)
                    errors.append(
                        f'MIDI device ports "{common_port}" for {device_class_name} could not be found. Is your device connected or MIDI ports existing? Your device was still created, but it was not connected to any MIDI port.'
                    )
                device_map[device["id"]] = id(mididev)
                if self.trevor_bus:
                    mididev.on_midi_message = self.trevor_bus.send_control_value_update
                mididev.load_preset(dct=device["config"])
            except ValueError:
                errors.append(
                    f"No MIDI API found for {device_class_name}, a library path is probably missing on the command line."
                )

        vdev_to_resume = []
        for device in content.get("virtual_devices", []):
            cls_name = device["class"]
            if cls_name == TrevorBus.__name__:
                continue
            try:
                cls = find_class(cls_name)
                vdev: VirtualDevice = cls()
                if self.trevor_bus:
                    vdev.to_update = self.trevor_bus  # type: ignore
                device_map[device["id"]] = id(vdev)
                if device.get("running", False):
                    vdev.start()  # We start the device
                    vdev.pause()  # We pause it right away before we do the patch
                    if not device.get("paused", True):
                        vdev_to_resume.append(vdev)
                if cls_name == WebSocketBus.__name__:
                    continue
                for key, value in device["config"].items():
                    setattr(vdev, key, value)
            except ValueError:
                errors.append(
                    f"No virtual device found for {cls_name}, a library path is probably missing on the command line."
                )

        # loads patchs
        for serialized_link in content.get("connections"):
            src = serialized_link["src"]
            dest = serialized_link["dest"]
            src_param = src["parameter"]
            dest_param = dest["parameter"]
            if src_param.get("mode") == "note":
                src_param_name = src_param["note"]
            else:
                src_param_name = (
                    src_param["cv_name"]
                    if src_param["section_name"] == VirtualParameter.section_name
                    else src_param["name"]
                )
            if dest_param.get("mode") == "note":
                dest_param_name = dest_param["note"]
            else:
                dest_param_name = (
                    dest_param["cv_name"]
                    if dest_param["section_name"] == VirtualParameter.section_name
                    else dest_param["name"]
                )
            src_path = f"{device_map[src['device']]}::{src_param['section_name']}::{src_param_name}"
            dest_path = f"{device_map[dest['device']]}::{dest_param['section_name']}::{dest_param_name}"
            with_chain = src.get("chain", None)
            link = self.trevor.associate_parameters(
                src_path, dest_path, with_scaler=with_chain
            )
            if link:
                # If the above condition is false (we are *not* in this if), we are in probably in a case when reloading,
                # the websocket bus is not fully initialized
                # i.e: it doesn't have all the services from before registered yet (they are in waiting room)
                link.bouncy = serialized_link.get("bouncy", False)
                result_chain = link.chain
                if result_chain and with_chain:
                    del with_chain["id"]
                    del with_chain["device"]
                    for key, value in with_chain.items():
                        setattr(result_chain, key, value)

        # restart the paused vdev
        for vdev in vdev_to_resume:
            vdev.start()
            vdev.resume()

        return errors

    def save_all(self, name, save_defaultvalues=False) -> Path:
        d = self.snapshot(save_defaultvalues=save_defaultvalues)
        del d["input_ports"]
        del d["output_ports"]
        del d["classes"]
        for device in d["midi_devices"]:
            device["class"] = device["meta"]["name"]
            del device["meta"]
        for device in d["virtual_devices"]:
            device["class"] = device["meta"]["name"]
            del device["meta"]
        file = Path(f"{name}.nly")
        file.write_text(self.to_json(d, indent=2))
        return file

    @classmethod
    def all_connections_as_dict(cls):
        connections = []

        def scaler_as_dict(scaler):
            if scaler is None:
                return None
            return {
                "id": id(scaler),
                "device": id(scaler.data.device),
                "to_min": scaler.to_min,
                "to_max": scaler.to_max,
                "auto": scaler.auto,
                "method": scaler.method,
                "as_int": scaler.as_int,
            }

        for device in all_devices():
            for link in device.links_registry.values():
                src = link.src.parameter
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
                dst = link.dest.parameter
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

                connections.append(
                    {
                        "id": id(link),
                        "src": {
                            "device": id(link.src.device),
                            "repr": link.src.device.uid(),
                            "parameter": from_,
                            "explicit": src.cc_note,
                            "chain": scaler_as_dict(link.chain),
                            "type": (
                                "virtual"
                                if isinstance(src, VirtualParameter)
                                else src.type
                            ),
                        },
                        "dest": {
                            "device": id(link.dest.device),
                            "repr": link.dest.device.uid(),
                            "parameter": to_,
                            "explicit": src.cc_note,
                            "type": (
                                "virtual"
                                if isinstance(dst, VirtualParameter)
                                else dst.type
                            ),
                        },
                        "bouncy": link.bouncy,
                    }
                )

        return connections

    def snapshot(self, save_defaultvalues=False):
        return {
            "input_ports": [
                name for name in mido.get_input_names() if "RtMidi" not in name  # type: ignore type issue with mido
            ],
            "output_ports": [
                name for name in mido.get_output_names() if "RtMidi" not in name  # type: ignore type issue with mido
            ],
            "midi_devices": [
                device.to_dict(save_defaultvalues=save_defaultvalues)
                for device in connected_devices
            ],
            "virtual_devices": [
                device.to_dict(save_defaultvalues=save_defaultvalues)
                for device in virtual_devices
            ],
            "connections": self.all_connections_as_dict(),
            "classes": {
                "virtual": [cls.__name__ for cls in virtual_device_classes],
                "midi": [cls.__name__ for cls in midi_device_classes],
            },
            "playground_code": self.code,
        }
