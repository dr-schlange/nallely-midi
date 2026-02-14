import json
import math
import struct
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Literal

from websockets import ConnectionClosed, ConnectionClosedError
from websockets.sync.server import serve

from .core import (
    Int,
    ModulePadsOrKeys,
    PadOrKey,
    ParameterInstance,
    Scaler,
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
)
from .core.parameter_instances import PadsOrKeysInstance
from .core.world import all_links, no_registration


@dataclass
class WSWaitingRoom:
    name: str
    device: VirtualDevice
    inputs_queue: list = field(default_factory=list)
    outputs_queue: list = field(default_factory=list)

    def append_input(self, value):
        if value not in self.inputs_queue:
            self.inputs_queue.append(value)

    def rebind(self, target):
        # We need to rebind the inputs first
        self.rebind_inputs(target)
        self.rebind_outputs(target)

    def rebind_inputs(self, target):
        for element in self.inputs_queue:
            setattr(target, self.name, element)
        self.flush_inputs()

    def flush_inputs(self):
        self.inputs_queue.clear()
        return self

    def bind(self, parameter):
        # print(f"[DEBUG] Bind {parameter}")
        self.append_output(WSOutputEntry([], parameter))

    def append_output(self, value):
        if value not in self.outputs_queue:
            self.outputs_queue.append(value)

    def rebind_outputs(self, source):
        for out_entry in list(self.outputs_queue):
            if out_entry.target is None:
                continue
            src_parameter = getattr(source, self.name)
            if isinstance(out_entry.target, WSWaitingRoom):
                wr = out_entry.target
                print(f"[WS-to-WS] Rebinding {self.name} to {wr.name}")
                target_device = wr.device
                setattr(target_device, wr.name, src_parameter)
                continue
            target_device = out_entry.target.device
            target_parameter = out_entry.target.parameter
            if out_entry.scaler:
                # print(f"[DEBUG] Re-creating scaler {out_entry.scaler}")
                src_parameter = src_parameter.scale(*out_entry.scaler)
                # print(f"[DEBUG] scaler {src_parameter}")
            try:
                setattr(target_device, target_parameter.cv_name, src_parameter)
            except AttributeError:
                setattr(target_device, target_parameter.name, src_parameter)
            self.outputs_queue.remove(out_entry)
        # self.flush_outputs()

    def flush_outputs(self):
        self.outputs_queue.clear()
        return self

    def scale(
        self,
        min: int | float | None = None,
        max: int | float | None = None,
        method: Literal["lin", "log"] = "lin",
        as_int: bool = False,
    ):
        out_entry = WSOutputEntry([min, max, method, as_int], None)
        self.append_output(out_entry)
        return out_entry


@dataclass
class WSOutputEntry:
    scaler: list[Any]
    target: (
        Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | WSWaitingRoom | None
    )

    def bind(self, parameter):
        self.target = parameter


@no_registration
class WebSocketBus(VirtualDevice):

    def __init__(self, host="0.0.0.0", port=6789, **kwargs):
        self.forever = False  # Required to be explicit as we override __setattr__ to create waiting rooms on missing attributes
        self.server = serve(self.handler, host=host, port=port)
        self.connected = defaultdict(list)
        self.known_services = {}
        self.to_update = None
        super().__init__(target_cycle_time=10, disable_output=True, **kwargs)

    def __getattr__(self, key):
        # print(f"[DEBUG] Create a waitingRoom for {key}")
        # We build a waiting room
        waiting_room = WSWaitingRoom(key, self)
        object.__setattr__(self, key, waiting_room)
        return waiting_room

    def __setattr__(self, key, value):
        if key in self.__dict__:
            room = object.__getattribute__(self, key)
            if isinstance(room, WSWaitingRoom):
                room.append_input(value)
                return
        if (
            isinstance(
                value,
                (
                    Int,
                    ParameterInstance,
                    PadOrKey,
                    ModulePadsOrKeys,
                    Scaler,
                    VirtualDevice,
                    WSOutputEntry,
                ),
            )
            and key not in self.__dict__
            and key not in self.__class__.__dict__
        ):
            waiting_room = WSWaitingRoom(key, self)
            waiting_room.append_input(value)
            if isinstance(value, WSOutputEntry):
                value.target = getattr(self, key)
            object.__setattr__(self, key, waiting_room)
            return

        object.__setattr__(self, key, value)

    @staticmethod
    def make_frame(name: str, value: float) -> bytes:
        name_b = name.encode("utf-8")
        ln = len(name_b)
        if ln > 0xFFFF:
            raise ValueError("Channel name too long")
        return struct.pack(f"!B{ln}s d", ln, name_b, value)

    @staticmethod
    def parse_frame(data: bytes):
        ln = data[0]
        name_b = data[1 : 1 + ln]
        try:
            value = struct.unpack_from("!d", data, 1 + ln)[0]
        except struct.error:
            value = struct.unpack_from("!f", data, 1 + ln)[0]
        return name_b.decode(), value

    def parse_binary(self, service_name: str, data: bytes):
        param_name, value = self.parse_frame(data)
        param_name = f"{service_name}_{param_name}"
        output = getattr(self, f"{param_name}_cv")
        return param_name, value, output

    def parse_json(self, service_name: str, data: str):
        json_message = json.loads(data)
        param_name = f"{service_name}_{json_message["on"]}"
        output = getattr(self, f"{param_name}_cv")
        value = float(json_message["value"])
        return param_name, value, output

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        print("[WS] Connection on ", path, service_name)
        if path.endswith("/autoconfig"):
            print(f"[WS] Autoconfig for {service_name}")
            try:
                message = json.loads(client.recv())
                parameters = message["parameters"]
                action = message.get("type")
                if service_name not in self.connected:
                    # print(f"[DEBUG] Parameters: {message['parameters']}")
                    self.configure_remote_device(service_name, parameters=parameters)  # type: ignore
                elif action == "add_parameters":
                    self.add_ports_to_remote_device(service_name, parameters=parameters)
                elif action == "remove_parameters":
                    self.remove_ports_to_remote_device(
                        service_name, parameters=parameters
                    )

            except (ConnectionClosed, TimeoutError) as e:
                kind = (
                    "crashed"
                    if isinstance(e, (ConnectionClosedError, TimeoutError))
                    else "disconnected"
                )
                print(
                    f"[WS] Client {client} on {service_name} {kind} and wasn't able to auto-config {service_name}"
                )
        elif path.endswith("/unregister") and service_name in self.known_services:
            self.unregister_service(service_name)
            return
        elif service_name not in self.known_services:
            print(
                f"[WS] Service {service_name} is not yet configured, you cannot subscribe to it yet"
            )
            return

        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        print(f"[WS] Connecting on {service_name} [{len(connected_devices)} clients]")
        try:
            for message in client:
                parser = self.parse_binary
                if isinstance(message, str):
                    parser = self.parse_json
                # Sends message to other modules connected to this channel
                for device in list(connected_devices):
                    try:
                        # json_message = json.loads(message)
                        # # print("[DEBUG] Received", json_message)
                        # param_name = f"{service_name}_{json_message["on"]}"
                        # output = getattr(self, f"{param_name}_cv")
                        # value = float(json_message["value"])
                        # # print(f"[DEBUG] INTERNAL ROUTING {param_name} with {value}")
                        param_name, value, output = parser(service_name, message)  # type: ignore
                        setattr(self, param_name, value)
                        self.send_out(
                            value,
                            ThreadContext({"last_values": {}}),
                            selected_outputs=[output],
                        )
                        break
                    except Exception as e:
                        print(
                            f"[WS] Couldn't parse the message and broadcast {message} to local instances: {e}"
                        )
                    if device == client:
                        continue
                    # Sync all clients connected to the same service
                    # try:
                    #     device.send(message)
                    # except ConnectionClosed as e:
                    #     try:
                    #         connected_devices.remove(device)
                    #         kind = (
                    #             "crashed"
                    #             if isinstance(e, ConnectionClosedError)
                    #             else "disconnected"
                    #         )
                    #         print(
                    #             f"Client {device} on {service_name} {kind} [{len(connected_devices)} clients]"
                    #         )
                    #     except Exception:
                    #         pass
        except (ConnectionClosed, TimeoutError):
            print(
                f"[WS] Client {client} on {service_name} disconnected unexpectedly [{len(connected_devices)} clients]"
            )
        finally:
            try:
                print("[WS] Remove", client)
                connected_devices.remove(client)
            except ValueError:
                pass

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        # print("[DEBUG] Stopping server")
        for service, clients in self.connected.items():
            for client in clients:
                print(f"[WS] Closing connection for {client} on {service}")
                client.close(code=1000, reason="WebSocket Bus is shutting down")
                # client.send(json.dumps({"on": "__close_bus__"}))
            clients.clear()
        if self.running and self.server:
            print("[WS] Shutting down websocket bus...")
            self.server.shutdown()
        for key, value in list(self.__class__.__dict__.items()):
            if isinstance(value, VirtualParameter):
                delattr(self.__class__, key)
        super().stop(clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        if math.isnan(value):
            import sys

            value = sys.float_info.min
        device, *parameter = on.split("_")
        parameter = "_".join(parameter)

        devices = self.connected[device]
        # print(f"[DEBUG] set {parameter=}, {value=}")
        setattr(self, parameter, value)
        for connected in list(devices):
            try:
                # print(f"[DEBUG] send to {connected}")
                connected.send(self.make_frame(parameter, float(value)))
            except (ConnectionClosed, TimeoutError) as e:
                try:
                    devices.remove(device)
                    kind = (
                        "crashed"
                        if isinstance(e, (ConnectionClosedError, TimeoutError))
                        else "disconnected"
                    )
                    print(
                        f"[WS] Cannot send information on {parameter} for {connected}, it probably {kind} [{len(devices)} clients]"
                    )
                except Exception:
                    pass
            except struct.error as e:
                print(f"[WS] An error was caught while creating the frame: {e}")
                print(f"[WS] Switching to json to encode {parameter}: {value}")
                connected.send(
                    json.dumps(
                        {
                            "value": float(value),
                            "device": device,
                            "on": parameter,
                            "sender": ctx.param,
                        }
                    )
                )

    def _add_ports(self, name, parameters: list[str | dict[str, Any]]):
        virtual_parameters = []
        for parameter in parameters:
            is_stream = False
            range = (None, None)
            pname = parameter
            print("[WS] Configuring", parameter)
            if isinstance(parameter, dict):
                pname = parameter.get("name", None)
                range = parameter.get("range", range)
                is_stream = parameter.get("stream", False)
            param_name = f"{name}_{pname}"
            cv_name = f"{param_name}_cv"
            try:
                waiting_room = object.__getattribute__(self, cv_name)
            except AttributeError:
                waiting_room = None
            vparam = VirtualParameter(
                f"{param_name}",
                consumer=True,
                stream=is_stream,
                cv_name=cv_name,
                range=range,
            )
            print("[WS] Registering", cv_name, "range", range, "stream", is_stream)
            virtual_parameters.append(vparam)
            setattr(self.__class__, cv_name, vparam)
            if waiting_room and isinstance(waiting_room, WSWaitingRoom):
                del self.__dict__[cv_name]
                waiting_room.rebind(self)
        return virtual_parameters

    def add_ports_to_remote_device(self, name, parameters: list[str | dict[str, Any]]):
        virtual_parameters = self._add_ports(name, parameters)
        self.known_services[name].extend(virtual_parameters)
        if self.to_update:
            self.to_update.send_update(self)

    def remove_ports_to_remote_device(
        self, name, parameters: list[str | dict[str, Any]]
    ):
        param_names = [
            f"{name}_{parameter.get('name')}"
            for parameter in parameters
            if isinstance(parameter, dict)
        ]
        service_parameters = self.known_services[name]
        to_remove = [
            parameter
            for parameter in service_parameters
            if parameter.name in param_names
        ]
        for parameter in to_remove:
            service_parameters.remove(parameter)
            delattr(
                self.__class__,
                parameter.cv_name,
            )

        if self.to_update:
            self.to_update.send_update(self)

    def configure_remote_device(self, name, parameters: list[str | dict[str, Any]]):
        virtual_parameters = self._add_ports(name, parameters)
        self.known_services[name] = virtual_parameters
        if self.to_update:
            self.to_update.send_update(self)

    def spread_registered_services(self):
        result = []
        for instance, params in self.known_services.items():
            result.append(
                {
                    "id": self.uuid,
                    "repr": instance,
                    "meta": self._schema_as_dict(instance, params, "No doc"),
                    "paused": False,
                    "running": True,
                    "config": {},
                    "proxy": True,
                }
            )

        return result

    def unregister_service(self, service_name):
        print(f"[WS] Unregistering {service_name}")

        params = self.known_services[service_name]
        for param in params:
            for link in all_links().values():
                if link.dest.parameter is param or link.src.parameter is param:
                    print(f"[WS] unbinding link {link} for {service_name}")
                    link.uninstall()
            print(f"[WS] Removing {param.cv_name} from bus")
            try:
                delattr(self.__class__, param.cv_name)
            except Exception as e:
                print(f"[WS] {param.cv_name} is not find in the WS")

        connected_clients = self.connected[service_name]
        for connected_client in connected_clients:
            try:
                print(f"[WS] Disconnecting {connected_client}")
                connected_client.close()
            except Exception as e:
                print(
                    f"[WS] Error while closing connection with {connected_client}: {e}"
                )
        del self.connected[service_name]
        del self.known_services[service_name]


# class ProxyVDevice:
#     id: int
#     repr: str
#     meta: dict[str, Any]
#     paused: bool = False
#     running: bool = True
#     config: dict = {}
#     proxy: bool = True

#     def to_dict()
