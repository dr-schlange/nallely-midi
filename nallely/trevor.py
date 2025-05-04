import importlib.util
import io
import json
import os
import sys
import textwrap
import traceback
from collections import ChainMap, defaultdict
from contextlib import contextmanager
from ctypes.wintypes import PINT
from dataclasses import asdict
from decimal import Decimal
from inspect import isfunction
from itertools import chain, zip_longest
from pathlib import Path
from textwrap import indent

import mido
from requests import get
from websockets.sync.server import serve

from .core import (
    CallbackRegistryEntry,
    DeviceNotFound,
    MidiDevice,
    ParameterInstance,
    VirtualDevice,
    VirtualParameter,
    all_devices,
    connected_devices,
    midi_device_classes,
    no_registration,
    stop_all_connected_devices,
    unbind_all,
    virtual_device_classes,
    virtual_devices,
)
from .modules import Int, Module, PadOrKey, Scaler
from .utils import WebSocketBus  # noqa, we keep it so it's loaded in this namespace


def longest_common_substring(s1: str, s2: str) -> str:
    if not s1 or not s2:
        return ""

    if len(s1) > len(s2):
        s1, s2 = s2, s1
    len_s1, len_s2 = len(s1), len(s2)

    curr_row = [0] * (len_s1 + 1)
    prev_row = [0] * (len_s1 + 1)

    max_length = 0
    end_index = 0

    for j in range(1, len_s2 + 1):
        for i in range(1, len_s1 + 1):
            if s1[i - 1] == s2[j - 1]:
                curr_row[i] = prev_row[i - 1] + 1
                if curr_row[i] > max_length:
                    max_length = curr_row[i]
                    end_index = i
            else:
                curr_row[i] = 0
        curr_row, prev_row = prev_row, curr_row

    return s1[end_index - max_length : end_index]


def find_class(name):
    for module in list(sys.modules.values()):
        if module:
            cls = getattr(module, name, None)
            if isinstance(cls, type):
                return cls
    raise ValueError(f"Class {name} couldn't be found")


class StateEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(str(o))
        if isinstance(o, ParameterInstance):
            return asdict(o.parameter)
        return super().default(o)


NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]


def get_note_name(midi_note):
    note = NOTE_NAMES[midi_note % 12]
    octave = midi_note // 12
    return f"{note}{octave}"


class OutputCapture(io.StringIO):
    def __init__(self, send_message):
        super().__init__()
        self.send_message = send_message

    def write(self, data):
        self.send_line_to_websocket(data)
        return super().write(data)

    def send_line_to_websocket(self, line):
        self.send_message({"command": "stdout", "line": line})

    @contextmanager
    def capture(self):
        old_stdout = sys.stdout
        old_stderr = sys.stderr

        sys.stdout = self
        sys.stderr = self

        try:
            yield self
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


@no_registration
class TrevorBus(VirtualDevice):
    forever = True

    def __init__(self, host="0.0.0.0", port=6788, **kwargs):
        super().__init__(target_cycle_time=10, **kwargs)
        self.connected = defaultdict(list)
        self.server = serve(self.handler, host=host, port=port)
        self.code = ""
        self.exec_context = ChainMap(globals())

    @staticmethod
    def to_json(obj, **kwargs):
        return json.dumps(obj, cls=StateEncoder, **kwargs)

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        print(f"Connected on {service_name} [{len(connected_devices)} clients]")
        try:
            client.send(self.to_json(self.full_state()))
            for message in client:
                self.handleMessage(client, message)
        finally:
            print("Disconnecting", client)
            connected_devices.remove(client)
            print(f"Connected on {service_name} [{len(connected_devices)} clients]")

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        if self.running and self.server:
            self.server.shutdown()
        super().stop(clear_queues)

    def handleMessage(self, client, message):
        message = json.loads(message)
        cmd = message["command"]
        del message["command"]
        params = message
        res = getattr(self, cmd)(**params)
        if res:
            self.send_message(res)

    def send_message(self, message):
        for client in self.connected["trevor"]:
            client.send(self.to_json(message))

    def completion_request(self, requestId, expression):
        options = []
        if "." in expression:
            try:
                expression = ".".join(expression.split(".")[:-1])
                obj = eval(expression, globals(), self.exec_context)
                for var_name in dir(obj):
                    if var_name.startswith("_"):
                        continue
                    value = getattr(obj, var_name)
                    if isfunction(value):
                        kind = "function"
                    elif isinstance(value, type):
                        kind = "class"
                    else:
                        kind = "property"
                    boost = (
                        10
                        if isinstance(
                            obj,
                            (Int, ParameterInstance),
                        )
                        or issubclass(type(value), (Module,))
                        else 0
                    )
                    options.append(
                        {
                            "label": var_name,
                            "detail": f"({type(value).__name__})",
                            "type": kind,
                            "insertText": var_name,
                            "boost": boost,
                            # "documentation": "",
                        }
                    )

            except Exception as e:
                print(e)
                traceback.print_exc()

        return {"command": "completion", "requestId": requestId, "options": options}

    def save_code(self, code):
        self.code = code
        return self.full_state()

    def execute_code(self, code):
        with OutputCapture(self.send_message).capture():
            try:
                print(">>>", indent(code, "... ")[4:])
                bytecode = compile(source=code, filename="<string>", mode="exec")
                exec(bytecode, globals(), self.exec_context)
            except SyntaxError as err:
                print(err, file=sys.stderr)
                self.send_message(
                    {
                        "command": "error",
                        "details": {
                            "line": err.lineno,
                            "start_col": err.offset,
                            "end_col": err.end_offset,
                            "message": err.msg,
                        },
                    }
                )
            except Exception as err:
                print(err, file=sys.stderr)
                _, _, tb = sys.exc_info()
                exc_info = traceback.extract_tb(tb)[-1]
                self.send_message(
                    {
                        "command": "error",
                        "details": {
                            "line": exc_info.lineno,
                            "start_col": exc_info.colno,
                            "end_col": exc_info.end_colno,
                            "message": str(err),
                        },
                    }
                )
        return self.full_state()

    def create_device(self, name):
        cls = next((cls for cls in midi_device_classes if cls.__name__ == name), None)
        if cls is None:
            cls = next((cls for cls in virtual_device_classes if cls.__name__ == name))
        devices = all_devices()
        try:
            # We auto-connect the virtual device,
            # or try to auto-connect the midi device to the right midi ports
            instance = cls(autoconnect=True)
        except Exception:
            # If there is a problem we remove the auto-connection
            diff = next((item for item in all_devices() if item not in devices), None)
            if diff:
                diff.stop()
            instance = cls(autoconnect=False)
        instance.to_update = self
        return self.full_state()

    def send_update(self, device=None):
        for client in self.connected["trevor"]:
            client.send(self.to_json(self.full_state()))

    @staticmethod
    def get_device_instance(device_id) -> VirtualDevice | MidiDevice:
        return next(
            (device for device in all_devices() if id(device) == int(device_id))
        )

    def create_scaler(self, from_parameter, to_parameter, create):
        from_device, from_section, from_parameter = from_parameter.split("::")
        to_device, to_section, to_parameter = to_parameter.split("::")
        src_device = self.get_device_instance(from_device)
        dst_device = self.get_device_instance(to_device)
        dest = getattr(dst_device, to_section)
        if isinstance(src_device, VirtualDevice) and from_parameter in [
            "output",
            "output_cv",
        ]:
            src = getattr(src_device, from_section)
        else:
            src = getattr(getattr(src_device, from_section), from_parameter)
        getattr(dest, to_parameter).__isub__(src)  # we unbind first
        if create:
            to_range = getattr(dest.__class__, to_parameter).range
            scaler: Scaler = src.scale(to_range[0], to_range[1])
            setattr(dest, to_parameter, scaler)
            return self.full_state()
        setattr(dest, to_parameter, src)
        return self.full_state()

    def set_scaler_parameter(self, scaler_id, parameter, value):
        for device in chain(connected_devices, virtual_devices):
            for entry in device.callbacks_registry:
                if id(entry.chain) == scaler_id:
                    scaler = entry.chain
                    setattr(scaler, parameter, value)
                    break

        return self.full_state()

    def reset_all(self):
        stop_all_connected_devices(skip_unregistered=True)
        return self.full_state()

    def _associate_parameters(
        self, from_parameter, to_parameter, unbind=False, with_scaler=True
    ):
        from_device, from_section, from_parameter = from_parameter.split("::")
        to_device, to_section, to_parameter = to_parameter.split("::")
        src_device = self.get_device_instance(from_device)
        dst_device = self.get_device_instance(to_device)
        dest = getattr(dst_device, to_section)
        if isinstance(src_device, VirtualDevice) and from_parameter in [
            "output",
            "output_cv",
        ]:
            src = getattr(src_device, from_section)
        elif from_parameter.isdecimal():
            # We know it's a key/pad we are binding (src)
            src = getattr(src_device, from_section)[int(from_parameter)]
        elif from_parameter == "all_keys_or_pads":
            # We know we want to bind all the notes/pads [0..127]
            src = getattr(src_device, from_section)[:]
        else:
            src = getattr(getattr(src_device, from_section), from_parameter)
        if unbind:
            if to_parameter.isdecimal():
                # We know it's a key/pad we are unbinding to (target)
                dest_parameter = dest[int(to_parameter)]
            else:
                dest_parameter = getattr(dest, to_parameter)
            if isinstance(src, list):
                for e in src:
                    dest_parameter.__isub__(src)
            else:
                dest_parameter.__isub__(src)
            return self.full_state()
        if to_parameter == "all_keys_or_pads":
            to_parameter = dest.meta.pads_or_keys.name
        chain = None
        if isinstance(src, list):
            setattr(dest, to_parameter, src)
        elif to_parameter.isdecimal():
            # We know it's a key/pad we are binding to (target)
            dest[int(to_parameter)] = src
        elif with_scaler:
            target = getattr(dest.__class__, to_parameter, None)
            if target:
                to_range = getattr(dest.__class__, to_parameter).range
                chain = src.scale(to_range[0], to_range[1])
            else:
                chain = src.scale(None, None)
            setattr(dest, to_parameter, chain)
        else:
            setattr(dest, to_parameter, src)
        return chain

    def associate_parameters(
        self, from_parameter, to_parameter, unbind, with_scaler=True
    ):
        self._associate_parameters(from_parameter, to_parameter, unbind, with_scaler)
        return self.full_state()

    def associate_midi_port(self, device, port, direction):
        dev: MidiDevice = self.get_device_instance(device)  # type:ignore
        if direction == "output":
            if dev.outport_name == port:
                dev.close_out()
                return self.full_state()
            dev.outport_name = port
            dev.connect()
        else:
            if dev.inport_name == port:
                dev.close_in()
                return self.full_state()
            dev.inport_name = port
            dev.listen()
        return self.full_state()

    def list_patches(self):
        cwd = Path.cwd()
        return {"knownPatches": [f"{file}" for file in cwd.rglob("*.nly")]}

    def load_all(self, name):
        file = Path(name)
        content = None
        with file.open("r", encoding="utf-8") as f:
            content = json.load(f)
        if not content:
            return self.full_state()

        self.reset_all()

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
                vdev.to_update = self  # type: ignore
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
        for link in content.get("connections"):
            src = link["src"]
            dest = link["dest"]
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
            result_chain = self._associate_parameters(
                src_path, dest_path, with_scaler=with_chain
            )
            if result_chain and with_chain:
                del with_chain["id"]
                del with_chain["device"]
                for key, value in with_chain.items():
                    setattr(result_chain, key, value)

        # restart the paused vdev
        for vdev in vdev_to_resume:
            vdev.start()
            vdev.resume()

        if errors:
            self.send_message({"errors": errors})
        return self.full_state()

    def save_all(self, name):
        d = self.full_state()
        del d["input_ports"]
        del d["output_ports"]
        del d["classes"]
        for device in d["midi_devices"]:
            device["class"] = device["meta"]["name"]
            del device["meta"]
        for device in d["virtual_devices"]:
            device["class"] = device["meta"]["name"]
            del device["meta"]
        Path(f"{name}.nly").write_text(self.to_json(d, indent=2))

    def resume_device(self, device_id, start):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.resume()
        return self.full_state()

    def pause_device(self, device_id, start):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.pause()
        return self.full_state()

    def set_virtual_value(self, device_id, parameter, value):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if "." in str(value):
            value = float(value)
        else:
            try:
                value = int(value)
            except:
                ...
        device.process_input(parameter, value)
        return self.full_state()

    def delete_all_connections(self):
        unbind_all()
        return self.full_state()

    def all_connections(self):
        connections = []

        def scaler_as_dict(scaler):
            if scaler is None:
                return None
            return {
                "id": id(scaler),
                "device": id(scaler.data.device),
                "min": scaler.to_min,
                "max": scaler.to_max,
                "auto": scaler.auto,
                "method": scaler.method,
                "as_int": scaler.as_int,
            }

        for device in all_devices():
            for entry in device.callbacks_registry:
                entry: CallbackRegistryEntry
                if isinstance(entry.from_, PadOrKey):
                    from_ = {
                        "note": entry.from_.cc_note,
                        "type": entry.from_.type,
                        "name": get_note_name(entry.from_.cc_note),
                        "section_name": entry.from_.pads_or_keys.section_name,
                        "mode": entry.from_.mode,
                    }
                else:
                    from_ = asdict(entry.from_)
                if isinstance(entry.parameter, PadOrKey):
                    to_ = {
                        "note": entry.parameter.cc_note,
                        "type": entry.parameter.type,
                        "name": get_note_name(entry.parameter.cc_note),
                        "section_name": entry.parameter.pads_or_keys.section_name,
                        "mode": entry.parameter.mode,
                    }
                else:
                    to_ = asdict(entry.parameter)
                connections.append(
                    {
                        "src": {
                            "device": id(device),
                            "repr": device.uid(),
                            "parameter": from_,
                            "explicit": entry.from_.cc_note,
                            "chain": scaler_as_dict(entry.chain),
                            "type": entry.type,
                        },
                        "dest": {
                            "device": id(entry.target),
                            "repr": entry.target.uid(),
                            "parameter": to_,
                            "explicit": entry.cc_note,
                            "type": entry.type,
                        },
                    }
                )

        return connections

    def full_state(self):

        d = {
            "input_ports": [
                name for name in mido.get_input_names() if "RtMidi" not in name
            ],
            "output_ports": [
                name for name in mido.get_output_names() if "RtMidi" not in name
            ],
            "midi_devices": [device.to_dict() for device in connected_devices],
            "virtual_devices": [device.to_dict() for device in virtual_devices],
            "connections": self.all_connections(),
            "classes": {
                "virtual": [cls.__name__ for cls in virtual_device_classes],
                "midi": [cls.__name__ for cls in midi_device_classes],
            },
            "playground_code": self.code,
        }

        return d


def trevor_infos(header, loaded_paths, init_script):
    info = f"{header}\n"
    info += f"  * init script = {init_script.resolve().absolute() if init_script else None}\n"
    info += "  * Loaded paths\n"
    for p in loaded_paths:
        info += f"    - {p.resolve().absolute()}\n"
    info += "  * Known device classes\n"
    for device in [*midi_device_classes, *virtual_device_classes]:
        info += f"    - {device.__name__}\n"
    devices = all_devices()
    info += f"  * Connected/existing devices [{len(devices)}]\n"
    if devices:
        for device in all_devices():
            info += f"    - {device.uid()} <{device.__class__.__name__}>\n"

    import os

    import psutil

    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    info += f"Memory: {mem_info.rss / (1024 * 1024)} Mo\n"
    cpu_usage = process.cpu_percent(interval=None)
    info += f"CPU: {cpu_usage}%\n"
    return info


def _load_modules(loaded_paths):
    def import_module_from_file(name: str, path: Path):
        spec = importlib.util.spec_from_file_location(name, path)
        if not spec:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module

    for p in loaded_paths:
        if p.is_file() and p.suffix == ".py":
            import_module_from_file(p.stem, p)


def start_trevor(include_builtins, loaded_paths=None, init_script=None):
    try:
        if include_builtins:
            from .devices import NTS1, Minilogue

        loaded_paths = loaded_paths or []
        _load_modules(loaded_paths)
        if init_script:
            code = init_script.read_text(encoding="utf-8")
            exec(code)

        trevor = TrevorBus()
        trevor.start()
        # while (
        #     q := input("Press 'q' to stop Trevor, press enter to display infos...")
        # ) != "q":
        #     trevor_infos("[TREVOR INFO]", loaded_paths, init_script)
        #     # import os
        #     # import psutil
        #     # process = psutil.Process(os.getpid())
        #     # mem_info = process.memory_info()
        #     # print(f"Memory: {mem_info.rss / (1024 * 1024)} Mo")
        #     # cpu_usage = process.cpu_percent(interval=1)
        #     # print(f"CPU: {cpu_usage}%")
        _trevor_menu(loaded_paths, init_script, trevor)
        print("Shutting down...")
    finally:
        stop_all_connected_devices()


def launch_standalone_script(include_builtins, loaded_paths=None, init_script=None):
    try:
        if include_builtins:
            from .devices import NTS1, Minilogue

        loaded_paths = loaded_paths or []
        _load_modules(loaded_paths)

        if init_script:
            code = init_script.read_text(encoding="utf-8")
            exec(code)

        _trevor_menu(loaded_paths, init_script)
    finally:
        for device in connected_devices:
            device.force_all_notes_off(times=10)
        stop_all_connected_devices()


def _trevor_menu(loaded_paths, init_script, trevor_bus=None):
    elprint = _print_with_trevor if trevor_bus else print
    while (
        q := input(
            "Press 'q' to stop the script, press enter to display infos, press ? to display menu...\n> "
        )
    ) != "q":
        if not q:
            elprint(
                trevor_infos(
                    "[TREVOR]" if trevor_bus else "[INFO]", loaded_paths, init_script
                )
            )
        elif q == "?":
            menu = (
                "[MENU]\n"
                "   s: stop a device (virtual or midi)\n"
                "   q: stop the script\n"
            )
            elprint(menu)
        elif q == "s":
            menu = "[STOP DEVICE]\n"
            devices = [d for d in all_devices() if not isinstance(d, TrevorBus)]
            for num, device in enumerate(devices):
                menu += f"   {num} - {device.uid()}\n"
            menu += "  enter - exit menu\n"
            elprint(menu)
            num = input("> ")
            if num != "":
                num = int(num)
                try:
                    print(f"Stopping {devices[num]}")
                    devices[num].stop()
                    if trevor_bus:
                        trevor_bus.send_update()
                except IndexError:
                    print(f"There is no device {num}")


def _print_with_trevor(text):
    # visiously copied from the internet https://www.asciiartcopy.com/ascii-dog.html
    trevor = (
        "╱▏┈┈┈┈┈┈▕╲▕╲┈┈┈\n"
        "▏▏┈┈┈┈┈┈▕▏▔▔╲┈┈\n"
        "▏╲┈┈┈┈┈┈╱┈▔┈▔╲┈\n"
        "╲▏▔▔▔▔▔▔╯╯╰┳━━▀\n"
        "┈▏╯╯╯╯╯╯╯╯╱┃┈┈┈\n"
        "┈┃┏┳┳━━━┫┣┳┃┈┈┈\n"
        "┈┃┃┃┃┈┈┈┃┃┃┃┈┈┈\n"
        "┈┗┛┗┛┈┈┈┗┛┗┛┈┈┈"
    )
    split_trevor = trevor.split()
    size = len(split_trevor[0])
    indent = " " * size
    text = textwrap.indent(text, indent)
    split_text = text.split("\n")
    final = ""
    for t, m in zip_longest(split_trevor, split_text):
        t = t if t else f"{indent}"
        m = m[size:] if m else ""
        final += f"{t}  {m}\n"
    print('  "Today I overslept because I went to bed late last night"')
    print(final[:-3])
