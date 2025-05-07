import io
import json
import sys
import textwrap
import traceback
from collections import ChainMap, defaultdict
from contextlib import contextmanager
from dataclasses import asdict
from inspect import isfunction
from itertools import zip_longest
from pathlib import Path
from textwrap import indent

import mido
from websockets.sync.server import serve

from ..core import (
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
    virtual_device_classes,
    virtual_devices,
)
from ..modules import Int, Module, PadOrKey
from ..session import Session
from ..utils import (
    StateEncoder,
    find_class,
    get_note_name,
    load_modules,
    longest_common_substring,
)
from ..websocket_bus import (  # noqa, we keep it so it's loaded in this namespace
    WebSocketBus,
)
from .trevor_api import TrevorAPI


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
        self.exec_context = ChainMap(globals())
        self.trevor = TrevorAPI()
        self.session = Session(self)

    @staticmethod
    def to_json(obj, **kwargs):
        return json.dumps(obj, cls=StateEncoder, **kwargs)

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        connected_clients = self.connected[service_name]
        connected_clients.append(client)
        print(f"Connected on {service_name} [{len(connected_clients)} clients]")
        try:
            client.send(self.to_json(self.full_state()))
            for message in client:
                self.handleMessage(client, message)
        finally:
            print("Disconnecting", client)
            connected_clients.remove(client)
            print(f"Connected on {service_name} [{len(connected_clients)} clients]")

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

    def full_state(self):
        return self.session.snapshot()

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
        self.session.save_code(code)
        return self.full_state()

    def execute_code(self, code):
        with OutputCapture(self.send_message).capture():
            try:
                print(">>>", indent(code, "... ")[4:])
                self.trevor.execute_code(code, self.exec_context)
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
        self.trevor.create_device(name)
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
        self.trevor.manage_scaler(from_parameter, to_parameter, create)
        return self.full_state()

    def set_scaler_parameter(self, scaler_id, parameter, value):
        self.trevor.set_scaler_parameter(scaler_id, parameter, value)
        return self.full_state()

    def reset_all(self):
        self.trevor.reset_all()
        return self.full_state()

    def associate_parameters(
        self, from_parameter, to_parameter, unbind, with_scaler=True
    ):
        self.trevor.associate_parameters(
            from_parameter, to_parameter, unbind, with_scaler
        )
        return self.full_state()

    def associate_midi_port(self, device, port, direction):
        self.trevor.associate_midi_port(device, port, direction)
        return self.full_state()

    def list_patches(self):
        cwd = Path.cwd()
        return {"knownPatches": [f"{file}" for file in cwd.rglob("*.nly")]}

    def load_all(self, name):
        errors = self.session.load_all(name)
        if errors:
            self.send_message({"errors": errors})
        return self.full_state()

    def save_all(self, name):
        self.session.save_all(name)

    def resume_device(self, device_id, start):
        self.trevor.resume_device(device_id, start)
        return self.full_state()

    def pause_device(self, device_id, start):
        self.trevor.pause_device(device_id, start)
        return self.full_state()

    def set_virtual_value(self, device_id, parameter, value):
        self.trevor.set_virtual_value(device_id, parameter, value)
        return self.full_state()

    def delete_all_connections(self):
        self.trevor.delete_all_connections()
        return self.full_state()

    def all_connections(self):
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

    return info


def start_trevor(include_builtins, loaded_paths=None, init_script=None):
    try:
        if include_builtins:
            from ..devices import NTS1, Minilogue  # noqa, we include them

        loaded_paths = loaded_paths or []
        load_modules(loaded_paths)
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
            from ..devices import NTS1, Minilogue  # noqa, we include them

        loaded_paths = loaded_paths or []
        load_modules(loaded_paths)

        if init_script:
            code = init_script.read_text(encoding="utf-8")
            exec(code, globals(), globals())

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
                "   k: stop (kill) a virtual or midi device\n"
                "   q: stop the script\n"
            )
            elprint(menu)
        elif q == "k":
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
        "┈┗┛┗┛┈┈┈┗┛┗┛┈┈┈\n"
    )
    try:
        import os

        import psutil

        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()

        trevor += f"Mem: {mem_info.rss / (1024 * 1024):.2f}Mo\n"
    except ModuleNotFoundError:
        ...

    split_trevor = trevor.split("\n")
    size = max(len(line) for line in split_trevor)
    indent = " " * size
    text = textwrap.indent(text, indent)
    split_text = text.split("\n")
    final = ""
    for t, m in zip_longest(split_trevor, split_text):
        t = t.ljust(size) if t else f"{indent}"
        m = m[size:] if m else ""
        final += f"{t}  {m}\n"
    print('  "Today I defended the house against an evil cat."')
    print(final[:-3])
