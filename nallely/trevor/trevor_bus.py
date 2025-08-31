import http.server
import io
import json
import socketserver
import sys
import textwrap
import threading
import time
import traceback
from collections import ChainMap, defaultdict
from contextlib import contextmanager
from inspect import isfunction
from itertools import zip_longest
from pathlib import Path
from textwrap import indent

from websockets import ConnectionClosed, ConnectionClosedError
from websockets.sync.server import serve

from nallely.core import virtual_device

from ..core import (
    Int,
    Module,
    ParameterInstance,
    VirtualDevice,
    all_devices,
    all_links,
    connected_devices,
    midi_device_classes,
    no_registration,
    stop_all_connected_devices,
    virtual_device_classes,
    virtual_devices,
)
from ..core.midi_device import MidiDevice, ModuleParameter
from ..utils import StateEncoder, force_off_everywhere, load_modules
from ..websocket_bus import (  # noqa, we keep it so it's loaded in this namespace
    WebSocketBus,
)
from .meta_trevor_api import MetaTrevorAPI
from .trevor_api import TrevorAPI

_SYSTEM_STDOUT = sys.stdout
_SYSTEM_STDERR = sys.stderr


class OutputCapture(io.StringIO):
    def __init__(self, send_message):
        super().__init__()
        self.send_message = send_message

    def write(self, data):
        self.send_line_to_websocket(data)
        return super().write(data)

    def send_line_to_websocket(self, line):
        self.send_message({"command": "stdout", "line": line})

    def start_capture(self):
        # self.old_stdout = _SYSTEM_STDOUT
        # self.old_stderr = _SYSTEM_STDERR
        sys.stdout = self
        sys.stderr = self

    def stop_capture(self):
        # sys.stdout = self.old_stdout
        # sys.stderr = self.old_stderr
        sys.stdout = _SYSTEM_STDOUT
        sys.stderr = _SYSTEM_STDERR

    @contextmanager
    def capture(self):
        # old_stdout = _SYSTEM_STDOUT
        # old_stderr = _SYSTEM_STDERR

        sys.stdout = self
        sys.stderr = self

        try:
            yield self
        finally:
            # sys.stdout = old_stdout
            # sys.stderr = old_stderr
            sys.stdout = _SYSTEM_STDOUT
            sys.stdout = _SYSTEM_STDERR


def make_ccvalues():
    return defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))


@no_registration
class TrevorBus(VirtualDevice):
    forever = True

    def __init__(self, host="0.0.0.0", port=6788, **kwargs):
        from ..session import Session

        super().__init__(target_cycle_time=10, **kwargs)
        self.connected = defaultdict(list)
        self.server = serve(self.handler, host=host, port=port)
        self.exec_context = ChainMap(globals())
        self.trevor = TrevorAPI()
        self.meta_trevor = MetaTrevorAPI(self.exec_context)
        self.session = Session(self)
        self.redirector = OutputCapture(self.send_message)
        self.cc_update_interval = int(0.05e9)  # every X ns
        self.next_cc_update_time = time.perf_counter_ns() + self.cc_update_interval
        self.cc_update_package = defaultdict(make_ccvalues)

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
        except (ConnectionClosed, TimeoutError) as e:
            kind = (
                "crashed"
                if isinstance(e, (ConnectionClosedError, TimeoutError))
                else "disconnected"
            )
            print(f"Client {client} on trevor {kind}")
        finally:
            print("Disconnecting", client)
            try:
                connected_clients.remove(client)
                print(f"Connected on {service_name} [{len(connected_clients)} clients]")
            except ValueError:
                pass

    def setup(self):
        try:
            self.server.serve_forever()
        except Exception as e:
            print("Error while serving the trevor websocket server", e)
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
        connected_devices = self.connected["trevor"]
        for client in list(connected_devices):
            try:
                client.send(self.to_json(message))
            except (ConnectionClosed, TimeoutError) as e:
                try:
                    connected_devices.remove(client)
                    kind = (
                        "crashed"
                        if isinstance(e, (ConnectionClosedError, TimeoutError))
                        else "disconnected"
                    )
                    print(
                        f"Client {client} on trevor {kind} [{len(connected_devices)} clients]"
                    )
                except Exception:
                    pass

    def send_notification(self, status, message):
        self.send_message(
            {"status": status, "message": message, "command": "notification"}
        )

    def full_state(self):
        return self.session.snapshot()

    def random_preset(self, device_id):  # type: ignore
        self.trevor.random_preset(device_id)
        return self.full_state()

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
        with self.redirector.capture():
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
        instance = self.trevor.create_device(name)
        instance.to_update = self
        if isinstance(instance, MidiDevice):
            instance.on_midi_message = self.send_control_value_update
        return self.full_state()

    def send_control_value_update(
        self, device: MidiDevice, msg, control: ModuleParameter | None
    ):
        if not control:
            # If we are here, the control is not bind in the system, so we don't send updates
            return
        current_parameter = self.cc_update_package[device.uuid][device.uid()][
            control.section_name
        ]
        if msg.value != current_parameter[control.name]:
            current_parameter[control.name] = msg.value
        if time.perf_counter_ns() > self.next_cc_update_time:
            self.send_message(
                {"command": "RuntimeAPI::updateCCValues", "arg": self.cc_update_package}
            )
            self.cc_update_package.clear()
            self.next_cc_update_time = time.perf_counter_ns() + self.cc_update_interval

    def send_update(self, device=None):
        connected_devices = self.connected["trevor"]
        for client in list(connected_devices):
            try:
                client.send(self.to_json(self.full_state()))
            except (ConnectionClosed, TimeoutError) as e:
                try:
                    connected_devices.remove(client)
                    kind = (
                        "crashed"
                        if isinstance(e, (ConnectionClosedError, TimeoutError))
                        else "disconnected"
                    )
                    print(
                        f"Client {client} on trevor {kind} [{len(connected_devices)} clients]"
                    )
                except Exception:
                    pass

    def create_scaler(self, from_parameter, to_parameter, create):
        self.trevor.manage_scaler(from_parameter, to_parameter, create)
        return self.full_state()

    def set_scaler_parameter(self, scaler_id, parameter, value):
        self.trevor.set_scaler_parameter(scaler_id, parameter, value)
        return self.full_state()

    def make_link_bouncy(self, from_parameter, to_parameter, bouncy):
        self.trevor.make_link_bouncy(from_parameter, to_parameter, bouncy)
        return self.full_state()

    def mute_link(self, from_parameter, to_parameter, muted):
        self.trevor.mute_link(from_parameter, to_parameter, muted)
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
        all_files = sorted(
            [file for file in cwd.rglob("*.nly") if file.is_file()],
            key=lambda file: file.stem.lower(),
        )

        return {
            "knownPatches": [f"{file}" for file in all_files],
        }

    def load_all(self, name):
        errors = self.session.load_all(name)
        if errors:
            self.send_message({"errors": errors})
        return self.full_state()

    def save_all(self, name, save_defaultvalues=False):
        file = self.session.save_all(name, save_defaultvalues=save_defaultvalues)
        self.send_notification("ok", f"Patch saved in {file.absolute()}")

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

    def kill_device(self, device_id):
        self.trevor.kill_device(device_id)
        return self.full_state()

    def start_capture_stdout(self, device_or_link=None):
        if device_or_link:
            try:
                device = self.trevor.get_device_instance(device_or_link)
                device.debug = True
            except:
                try:
                    link = all_links()[device_or_link]
                    link.debug = True
                except:
                    print(f"Couldn't find {device_or_link}")
                    pass
        self.redirector.start_capture()

    def stop_capture_stdout(self, device_or_link=None):
        if device_or_link:
            try:
                device = self.trevor.get_device_instance(device_or_link)
                device.debug = False
            except:
                try:
                    link = all_links()[device_or_link]
                    link.debug = False
                except:
                    print(f"Couldn't find {device_or_link}")
                    pass
        self.redirector.stop_capture()

    def fetch_class_code(self, device_id):
        try:
            device = self.trevor.get_device_instance(device_id)
            class_code = self.meta_trevor.fetch_class_code(device)
            self.send_message(
                {"arg": class_code, "command": "RuntimeAPI::setClassCode"}
            )
        except:
            print(f"Couldn't find {device_id}")
            pass

    def compile_inject(self, device_id, method_name, method_code):
        try:
            device = self.trevor.get_device_instance(device_id)
        except Exception as e:
            print(f"Couldn't find {device_id}")
            return
        try:
            self.meta_trevor.compile_inject(device, method_name, method_code)
            self.send_notification(
                "ok",
                f"Method {method_name} compiled and injected in {device.__class__.__name__}",
            )
        except Exception as e:
            self.send_notification(
                "error",
                f"Error while compiling/injecting {method_name} in {device.__class__.__name__}",
            )
            print(e)

    def set_parameter_value(self, device_id, section_name, parameter_name, value):
        self.trevor.set_parameter_value(device_id, section_name, parameter_name, value)
        return self.full_state()

    def set_device_channel(self, device_id, channel):
        self.trevor.set_device_channel(device_id, channel)
        return self.full_state()


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and PyInstaller"""
    if hasattr(sys, "_MEIPASS"):
        # Running in PyInstaller bundle
        base_path = Path(sys._MEIPASS)
    else:
        # Running in normal python environment
        base_path = Path().cwd()

    return base_path / relative_path


class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class HTTPServerThread:
    def __init__(self, directory: Path, port: int = 3000):
        self.directory = directory
        self.port = port
        self.httpd = None
        self.thread = None

    def start(self):
        handler = lambda *args, **kwargs: SilentHandler(
            *args, directory=str(self.directory.resolve()), **kwargs
        )
        self.httpd = ReusableTCPServer(("0.0.0.0", self.port), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.daemon = True
        self.thread.start()

    def shutdown(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()

    def join(self):
        if self.thread:
            self.thread.join()

    def stop(self):
        self.shutdown()
        self.join()


def trevor_infos(header, loaded_paths, init_script, ui):
    info = f"{header}\n"
    if ui:
        info += (
            f"  * Trevor-UI running on http://localhost:3000 or http://127.0.0.1:3000\n"
        )
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


def start_trevor(
    include_builtins,
    loaded_paths=None,
    init_script: Path | None = None,
    serve_ui=None,
    include_experimental=None,
):
    httpserver = None
    try:
        if serve_ui:
            httpserver = HTTPServerThread(resource_path("trevor-ui"))
            httpserver.start()
            print(
                "Trevor-UI running on http://localhost:3000 or http://127.0.0.1:3000...\n"
            )
        if include_builtins:
            from ..devices import NTS1, Minilogue  # noqa, we include them

        if include_experimental:
            from ..experimental import (  # noqa, we include the experimental devices
                Harmonizer,
                InstanceCreator,
                Mono2Poly,
                RandomPatcher,
            )

        loaded_paths = loaded_paths or []
        load_modules(loaded_paths)
        if init_script and init_script.suffix == ".py":
            code = init_script.read_text(encoding="utf-8")
            exec(code)

        trevor = TrevorBus()
        trevor.start()
        if init_script and init_script.suffix == ".nly":
            trevor.session.load_all(init_script)
        _trevor_menu(loaded_paths, init_script, trevor, serve_ui)
        print("Shutting down...")
    finally:
        if httpserver:
            print("Shutting down Trevor-UI...")
            httpserver.stop()
        for device in connected_devices:
            device.all_notes_off()
            device.force_all_notes_off(10)
        stop_all_connected_devices()


def launch_standalone_script(
    include_builtins, loaded_paths=None, init_script=None, include_experimental=None
):
    try:
        if include_builtins:
            from ..devices import NTS1, Minilogue  # noqa, we include them

        if include_experimental:
            from ..experimental import (  # noqa, we include the experimental devices
                Harmonizer,
                InstanceCreator,
                Mono2Poly,
                RandomPatcher,
            )

        loaded_paths = loaded_paths or []
        load_modules(loaded_paths)

        if init_script:
            code = init_script.read_text(encoding="utf-8")
            exec(code, globals(), globals())

        _trevor_menu(loaded_paths, init_script)
    finally:
        for device in connected_devices:
            device.all_notes_off()
        stop_all_connected_devices()


def _trevor_menu(loaded_paths, init_script, trevor_bus=None, trevor_ui=None):
    elprint = _print_with_trevor if trevor_bus else print
    while (
        q := input(
            "Press 'q' to stop the script, press enter to display infos, press ? to display menu...\n> "
        )
    ) != "q":
        if not q:
            elprint(
                trevor_infos(
                    "[TREVOR]" if trevor_bus else "[INFO]",
                    loaded_paths,
                    init_script,
                    trevor_ui,
                )
            )
        elif q == "?":
            menu = (
                "[MENU]\n"
                "   k: stop (kill) a virtual or MIDI device\n"
                "   q: stop the script\n"
                "   f: force all notes off on connected all MIDI devices\n"
                "   ff: force all notes off on all MIDI devices of any channel of any MIDI port\n"
                "   s: get some stats\n"
            )
            elprint(menu)
        elif q == "ff":
            print("Forcing note off on all channels of all existing MIDI output ports")
            force_off_everywhere(verbose=True)

        elif q == "f":
            for device in connected_devices:
                device.force_all_notes_off(10)
        elif q == "s":
            print("Fresh stats out of the oven")
            print(f" * Devices {len(connected_devices) + len(virtual_devices)}")
            print(f"   - MIDI devices {len(connected_devices)}")
            print(f"   - Virtual devices {len(virtual_devices)}")
            print(f" * Patches {len(all_links())}")
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
    print('  "Today I took a long sunny nap."')
    print(final[:-3])
