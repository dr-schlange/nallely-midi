import json
import os
import re
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import mido
from dulwich import porcelain
from dulwich.notes import get_note_path
from dulwich.repo import Repo

import nallely

from .core import (
    DeviceNotFound,
    MidiDevice,
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
                channel = device.get("channel", 0)
                uuid = device.get("id", 0)
                try:
                    autoconnect = common_port or False
                    mididev: MidiDevice = cls(
                        device_name=common_port,
                        channel=channel,
                        autoconnect=autoconnect,
                    )
                    if uuid:
                        mididev.uuid = uuid
                except DeviceNotFound:
                    # If there is a problem we remove the auto-connection
                    diff = next(
                        (item for item in all_devices() if item not in devices),
                        None,
                    )
                    if diff:
                        diff.stop()
                    mididev = cls(channel=channel, autoconnect=False)
                    if uuid:
                        mididev.uuid = uuid
                    errors.append(
                        f'MIDI device ports "{common_port}" for {device_class_name} could not be found. Is your device connected or MIDI ports existing? Your device was still created, but it was not connected to any MIDI port.'
                    )
                # device_map[device["id"]] = id(mididev)
                device_map[device["id"]] = mididev.uuid
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
                uuid = device.get("id", 0)

                vdev: VirtualDevice = cls()
                if uuid:
                    vdev.uuid = uuid
                if self.trevor_bus:
                    vdev.to_update = self.trevor_bus  # type: ignore
                # device_map[device["id"]] = id(vdev)
                device_map[device["id"]] = vdev.uuid
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
            src_device = src.get("device")
            dest_device = dest.get("device")
            src_param = src["parameter"]
            dest_param = dest["parameter"]
            if not src_device:
                errors.append(
                    f"Dangling reference: Source device with id {src_device} couldn't been found, skipping the patch between {src_param} -> {dest_param}"
                )
                continue
            if not dest_device:
                errors.append(
                    f"Dangling reference: Destination device with id {src_device} couldn't been found, skipping the patch between {src_param} -> {dest_param}"
                )
                continue
            if src_param.get("mode") == "note":
                src_param_name = src_param["note"]
            else:
                # check if we are in presence of a virtual device or not
                src_param_name = (
                    src_param["cv_name"]
                    if src_param["section_name"] == VirtualParameter.section_name
                    else src_param["name"]
                )
            if dest_param.get("mode") == "note":
                dest_param_name = dest_param["note"]
            else:
                # check if we are in presence of a virtual device or not
                dest_param_name = (
                    dest_param["cv_name"]
                    if dest_param["section_name"] == VirtualParameter.section_name
                    else dest_param["name"]
                )
            if src_device not in device_map or dest_device not in device_map:
                msg = f"Dangling reference: Device with id {src_device} couldn't been found, skipping the patch {src_param['section_name']}::{src_param_name} -> {dest_param['section_name']}::{dest_param_name}"
                errors.append(msg)
                print(msg)
                continue
            src_path = f"{device_map[src_device]}::{src_param['section_name']}::{src_param_name}"
            dest_path = f"{device_map[dest_device]}::{dest_param['section_name']}::{dest_param_name}"
            with_chain = src.get("chain", None)
            link = self.trevor.associate_parameters(
                src_path, dest_path, with_scaler=with_chain
            )
            if link:
                uuid = serialized_link.get("id", 0)
                if uuid:
                    link.uuid = uuid
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

    def save_all(self, path, save_defaultvalues=False) -> Path:
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
        if isinstance(path, str):
            file = Path(f"{path}")
        else:
            file = path
        if file.suffix != ".nly":
            file = file.with_suffix(".nly")
        file.write_text(self.to_json(d, indent=2))
        return file

    ADDRESS_CHECKER = re.compile(r"[0-9a-fA-F]+")

    def save_address(
        self, address: str, universe="memory", message=None, save_defaultvalues=False
    ) -> Path:
        if not address or self.ADDRESS_CHECKER.fullmatch(address) is None:
            # raise Exception(f"{address=} has an unknown format")
            print(f"[GIT-STORE] Couldn't parse {address=} has an unknown format")
            used_addresses = self.get_used_addresses(universe=universe)
            from random import randint

            while (
                rand_address := hex(randint(0, 0x03FF))[2:].zfill(4).upper()
            ) in used_addresses:
                ...
            print(f"[GIT-STORE] Take random free address=0x{rand_address.upper()}")
            address = rand_address
        address = address.upper()

        location = (Path.cwd() / universe).resolve()
        if not location.exists():
            print(
                f"[GIT-STORE] Creating {location.name} store at {location.absolute()}"
            )
            repo = porcelain.init(location)
        else:
            print(f"[GIT-STORE] Opening existing store: {location.name}")
            repo = Repo(location)

        address_file = address2path(universe, address)
        address_file.parent.mkdir(exist_ok=True, parents=True)

        self.save_all(address_file, save_defaultvalues=save_defaultvalues)
        print(f"[GIT-STORE] saved {address_file.absolute()}")

        porcelain.add(repo, address_file)
        infos = extract_infos(address_file)
        midi_devices = "\n".join(
            f"* {dev}={num}\n" for dev, num in infos["midi"].items()
        )
        virtual_devices = "\n".join(
            f"* {dev}={num}" for dev, num in infos["virtual"].items()
        )
        session_id = hex(id(self))[2:].upper()
        message = f"""[0x{address}] Snapshot session 0x{session_id}

SESSION_ID=0x{session_id}
[MIDI Classes]
{midi_devices}

[Virtual Classes]
{virtual_devices}

[Stats]
patchs_number={infos["patches"]}
playground_code={infos["playground_code"]}
"""
        porcelain.commit(repo, author=b"Nallely MIDI <drcoatl@proton.me>", committer=b"dr-schlange <drcoatl@proton.me>", message=message)  # type: ignore
        repo.close()
        return address_file

    def load_address(self, address, universe="memory"):
        address_file = address2path(universe, address)
        print(f"[GIT-STORE] Loading {address=} from file {address_file.resolve()}")
        return self.load_all(address_file)

    @classmethod
    def all_connections_as_dict(cls):
        connections = []
        for device in all_devices():
            for link in device.links_registry.values():
                connections.append(link.to_dict())
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

    def get_used_addresses(self, universe="memory"):
        cwd = Path.cwd()
        location = (cwd / universe).resolve()
        used_addresses = sorted(location.rglob("*.nly"))
        addresses = [
            {
                "path": str(a.relative_to(cwd)),
                "hex": str(a.relative_to(location).with_suffix(""))
                .replace(os.sep, "")
                .upper(),
            }
            for a in used_addresses
        ]
        return addresses

    def clear_address(self, address, universe="memory"):
        address_file = address2path(universe, address)
        print(
            f"[GIT-STORE] Deleting {address=} by deleting address file {address_file.resolve()}"
        )
        try:
            address_file.unlink()
        except FileNotFoundError:
            print(f"[GIT-STORE] {address=} is not used, deleting noting")
            return
        location = (Path.cwd() / universe).resolve()
        repo = Repo(location)
        porcelain.add(repo, address_file)

        session_id = hex(id(self))[2:].upper()
        message = f"""[0x{address}] Clear session 0x{session_id}"""
        porcelain.commit(repo, author=b"Nallely MIDI <drcoatl@proton.me>", committer=b"dr-schlange <drcoatl@proton.me>", message=message)  # type: ignore
        repo.close()

    def compile_device(self, device_name: str, device_code: str):
        if not device_code:
            return None

        co = compile(device_code, filename="<nallely_device>", mode="exec")
        import nallely

        eval_env = {}
        glob = {
            **globals(),
            "VirtualParameter": nallely.VirtualParameter,
            "VirtualDevice": nallely.VirtualDevice,
            "on": nallely.on,
            "nallely.VirtualParameter": nallely.VirtualParameter,
            "nallely.VirtualDevice": nallely.VirtualDevice,
            "nallely.on": nallely.on,
            "nallely": nallely,
        }
        eval(co, globals={**glob, **eval_env}, locals=eval_env)
        cls = eval_env[device_name]
        cls.__source__ = device_code
        return cls

    def migrate_instances(self, device_cls: str, new_cls):
        for device in all_devices():
            if device.__class__.__name__ == device_cls:
                if isinstance(device, MidiDevice):
                    continue
                print("[DEBUG] Migrating", device)
                print("[DEBUG] Pause device", device)
                device.pause()
                print(f"[DEBUG] Install exception hook", device)
                old_cls = device.__class__
                device.__class__ = new_cls
                virtual_device_classes.remove(old_cls)
                virtual_device_classes.append(new_cls)
                print("[DEBUG] Restart device")
                device.resume()


def extract_infos(filename):
    file = Path(filename)
    with file.open("r", encoding="utf-8") as f:
        content = json.load(f)
    midi_classes = Counter(dev["class"] for dev in content["midi_devices"])
    virtual_classes_count = Counter(dev["class"] for dev in content["virtual_devices"])
    patches = len(content["connections"])
    playground_code = content.get("playground_code")
    repo = Repo(file.parent.parent)

    commit_sha = get_last_commit_hash_for_file(repo, file)
    if commit_sha:
        note_id = get_note_path(commit_sha)
        metadata = json.loads(note_id.decode("utf-8"))
    else:
        metadata = {}

    details = {
        "midi": midi_classes,
        "virtual": virtual_classes_count,
        "patches": patches,
        "playground_code": bool(playground_code),
        "metadata": metadata,
    }
    repo.close()
    return details


def address2path(universe, address):
    location = (Path.cwd() / universe).resolve()
    frags = [address[i : i + 2] for i in range(0, len(address), 2)]
    address_file = location / (Path().with_segments(*frags)).with_suffix(".nly")
    return address_file


def get_last_commit_hash_for_file(repo, file_path):
    if not file_path.exists():
        return None
    try:
        walker = repo.get_walker(paths=[f"{file_path}".encode("utf-8")], max_entries=1)

        last_commit = next(iter(walker)).commit
        return last_commit.id
    except StopIteration:
        return None
