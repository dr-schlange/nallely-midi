from collections import defaultdict
from contextlib import contextmanager
from dataclasses import asdict
from decimal import Decimal
import io
from itertools import chain
from pathlib import Path
import sys
from time import sleep

import mido
from nallely import VirtualDevice
from nallely.devices import NTS1, Minilogue, MPD32, mpd32
import nallely
from nallely.core import (
    CallbackRegistryEntry,
    MidiDevice,
    ParameterInstance,
    ThreadContext,
    VirtualParameter,
    connected_devices,
    unbind_all,
    virtual_devices,
    virtual_device_classes,
    midi_device_classes,
    no_registration,
    all_devices,
)
from websockets.sync.server import serve
import json
from minilab import Minilab
from nallely.eg import ADSREnvelope
from nallely.lfos import LFO
from nallely.modules import Scaler
from nallely.utils import TerminalOscilloscope, WebSocketBus


class StateEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(str(o))
        if isinstance(o, ParameterInstance):
            return asdict(o.parameter)
        return super().default(o)


class StdoutCapture(io.StringIO):
    def __init__(self, sendMessage, requestId):
        super().__init__()
        self.sendMessage = sendMessage
        self.requestId = requestId

    def write(self, data):
        self.send_line_to_websocket(data)
        return super().write(data)

    def send_line_to_websocket(self, line):
        self.sendMessage(
            {"command": "stdout", "requestId": self.requestId, "line": line}
        )

    @contextmanager
    def capture(self):
        old_stdout = sys.stdout
        old_stderr = sys.stderr

        sys.stdout = self
        sys.stderr = io.StringIO()

        try:
            yield self
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


@no_registration
class TrevorBus(VirtualDevice):
    variable_refresh = False

    def __init__(self, host="0.0.0.0", port=6788, **kwargs):
        super().__init__(target_cycle_time=10, **kwargs)
        self.connected = defaultdict(list)
        self.server = serve(self.handler, host=host, port=port)
        self.code = ""

    @staticmethod
    def to_json(obj, **kwargs):
        return json.dumps(obj, cls=StateEncoder, **kwargs)

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        print("Connected on", service_name)
        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        try:
            client.send(self.to_json(self.full_state()))
            for message in client:
                self.handleMessage(client, message)
        finally:
            connected_devices.remove(client)

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
            self.sendMessage(res)

    def sendMessage(self, message):
        for client in self.connected["trevor"]:
            client.send(self.to_json(message))

    def completion_request(self, requestId, expression):
        if "." in expression:
            try:
                expression = ".".join(expression.split(".")[:-1])
                print("Expression", expression)
                print(dir(globals()[expression]))
            except Exception:
                ...

        return {
            "command": "completion",
            "requestId": requestId,
            "options": [
                {
                    "label": "foo",
                    "detail": "Type: function",
                    "kind": "function",
                    "insertText": "foo()",
                    "documentation": "This is a function that does something...",
                },
            ],
        }

    def save_code(self, code):
        self.code = code
        return self.full_state()

    def execute_code(self, requestId, code):
        try:
            with StdoutCapture(self.sendMessage, requestId).capture() as c:
                exec(code, globals(), globals())
        except Exception as e:
            print(e)
            import sys, traceback

            exc_type, exc_value, exc_tb = sys.exc_info()

            tb_entry = traceback.extract_tb(exc_tb)[-2]

            filename, line_number, func_name, text = tb_entry
            print(f"Error in {filename}, line {line_number}: {text}")

            start_col = text.find("^")
            end_col = (
                start_col + len(text.split("^")[1]) if start_col != -1 else start_col
            )

            self.sendMessage(
                {
                    "command": "error",
                    "requestId": requestId,
                    "details": {
                        "line": line_number,
                        "start_col": start_col,
                        "end_col": end_col,
                        "message": str(e),
                    },
                }
            )
        return self.full_state()

    def create_device(self, name):
        autoconnect = False
        debug = True
        cls = next((cls for cls in midi_device_classes if cls.__name__ == name), None)
        if cls is None:
            cls = next((cls for cls in virtual_device_classes if cls.__name__ == name))
            autoconnect = True  # we start the virtual device
            debug = False
        if debug:
            instance = cls(autoconnect=autoconnect, debug=debug)
        else:
            instance = cls(autoconnect=autoconnect)
        instance.to_update = self
        return self.full_state()

    def update(self, device):
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
        nallely.stop_all_connected_devices(skip_unregistered=True)
        return self.full_state()

    def associate_parameters(self, from_parameter, to_parameter, unbind):
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
        if unbind:
            getattr(dest, to_parameter).__isub__(src)
            return self.full_state()
        to_range = getattr(dest.__class__, to_parameter).range
        setattr(dest, to_parameter, src.scale(to_range[0], to_range[1]))
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
        Path(f"{name}.nallely").write_text(self.to_json(d, indent=2))

    def resume_device(self, device_id):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        device.resume()
        return self.full_state()

    def pause_device(self, device_id):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
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

        for device in connected_devices:
            for entry in device.callbacks_registry:
                entry: CallbackRegistryEntry
                if entry.type in ["note", "velocity"]:
                    cc_note = None
                    cc_type = "note"
                else:
                    cc_note = entry.cc_note
                    cc_type = entry.type
                connections.append(
                    {
                        "src": {
                            "device": id(device),
                            "repr": device.uid(),
                            "parameter": asdict(device.reverse_map[(cc_type, cc_note)]),
                            "explicit": entry.cc_note,
                            "chain": scaler_as_dict(entry.chain),
                        },
                        "dest": {
                            "device": id(entry.target),
                            "repr": entry.target.uid(),
                            "parameter": asdict(entry.parameter),
                            "explicit": entry.cc_note,
                        },
                    }
                )

        for device in virtual_devices:
            for entry in device.callbacks_registry:
                entry: CallbackRegistryEntry
                connections.append(
                    {
                        "src": {
                            "device": id(device),
                            "repr": device.uid(),
                            "parameter": asdict(entry.from_.parameter),
                            "explicit": entry.cc_note,
                            "chain": scaler_as_dict(entry.chain),
                        },
                        "dest": {
                            "device": id(entry.target),
                            "repr": entry.target.uid(),
                            "parameter": asdict(entry.parameter),
                            "explicit": entry.cc_note,
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
            # "virtual_devices": [
            #     device.to_dict()
            #     for device in virtual_devices
            #     if device.__class__ in virtual_device_classes
            # ],
            "virtual_devices": [device.to_dict() for device in virtual_devices],
            "connections": self.all_connections(),
            "classes": {
                "virtual": [cls.__name__ for cls in virtual_device_classes],
                "midi": [cls.__name__ for cls in midi_device_classes],
            },
            "playground_code": self.code,
        }
        from pprint import pprint

        # pprint(d["connections"])

        return d


# import threading
# import code
# import socket
# import sys

# class REPLServer:
#     def __init__(self, host='127.0.0.1', port=4444, local=None):
#         self.host = host
#         self.port = port
#         self.local = local or globals()
#         self._stop_event = threading.Event()
#         self._thread = threading.Thread(target=self._run, daemon=True)
#         self._server_sock = None

#     def start(self):
#         self._thread.start()

#     def stop(self):
#         self._stop_event.set()
#         if self._server_sock:
#             try:
#                 self._server_sock.close()
#             except:
#                 pass
#         self._thread.join()

#     def _run(self):
#         with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_sock:
#             self._server_sock = server_sock
#             server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
#             server_sock.bind((self.host, self.port))
#             server_sock.listen(1)
#             server_sock.settimeout(1.0)  # Pour vérifier régulièrement stop_event
#             print(f"[REPL] En attente de connexion sur {self.host}:{self.port}")
#             while not self._stop_event.is_set():
#                 try:
#                     conn, addr = server_sock.accept()
#                 except socket.timeout:
#                     continue
#                 print(f"[REPL] Connexion de {addr}")
#                 with conn:
#                     sockfile_r = conn.makefile('r')
#                     sockfile_w = conn.makefile('w')
#                     old_stdin, old_stdout, old_stderr = sys.stdin, sys.stdout, sys.stderr
#                     try:
#                         sys.stdin = sockfile_r
#                         sys.stdout = sockfile_w
#                         sys.stderr = sockfile_w
#                         code.interact(banner="== Remote Python Console ==", local=self.local)
#                     finally:
#                         sys.stdin = old_stdin
#                         sys.stdout = old_stdout
#                         sys.stderr = old_stderr
#                     print("[REPL] Déconnexion")


# repl = REPLServer(local=globals())
# repl.start()
try:
    ws = TrevorBus()

    ws.start()

    while (q := input("Stop server...")) != "q":
        import psutil
        import os

        process = psutil.Process(os.getpid())

        mem_info = process.memory_info()
        print(f"Memory: {mem_info.rss / (1024 * 1024)} Mo")
finally:
    # repl.stop()
    # print("Cleaning residual notes")
    # nts1.force_all_notes_off(times=10)
    # minilogue.force_all_notes_off(times=10)
    nallely.stop_all_connected_devices()
