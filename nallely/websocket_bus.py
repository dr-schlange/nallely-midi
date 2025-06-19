import json
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


@dataclass
class WSOutputEntry:
    scaler: list[Any]
    target: Int | PadOrKey | PadsOrKeysInstance | ParameterInstance | None

    def bind(self, parameter):
        self.target = parameter


@dataclass
class WSWaitingRoom:
    name: str
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
        for out_entry in self.outputs_queue:
            if out_entry.target is None:
                continue
            # print(
            #     f"[DEBUG] Rebind output {self.name} from {source} to {out_entry.target} "
            # )
            src_parameter = getattr(source, self.name)
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
        self.flush_outputs()

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
        # print("[DEBUG] SCALER CREATION")
        out_entry = WSOutputEntry([min, max, method, as_int], None)
        self.append_output(out_entry)
        return out_entry


class WebSocketBus(VirtualDevice):

    def __init__(self, host="0.0.0.0", port=6789, **kwargs):
        self.forever = False  # Required to be explicit as we override __setattr__ to create waiting rooms on missing attributes
        self.server = serve(self.handler, host=host, port=port)
        self.connected = defaultdict(list)
        self.known_services = {}
        self.to_update = None
        super().__init__(target_cycle_time=10, **kwargs)

    def __getattr__(self, key):
        # print(f"[DEBUG] Create a waitingRoom for {key}")
        # We build a waiting room
        waiting_room = WSWaitingRoom(key)
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
                ),
            )
            and key not in self.__dict__
            and key not in self.__class__.__dict__
        ):
            waiting_room = WSWaitingRoom(key)
            waiting_room.append_input(value)
            object.__setattr__(self, key, waiting_room)
            return

        object.__setattr__(self, key, value)

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        print("Connection on ", path, service_name)
        if path.endswith("/autoconfig"):
            print(f"Autoconfig for {service_name}")
            try:
                message = json.loads(client.recv())
                if service_name not in self.connected:
                    print(f"Parameters: {message['parameters']}")
                    self.configure_remote_device(service_name, parameters=message["parameters"])  # type: ignore
            except (ConnectionClosed, TimeoutError) as e:
                kind = (
                    "crashed"
                    if isinstance(e, (ConnectionClosedError, TimeoutError))
                    else "disconnected"
                )
                print(
                    f"Client {client} on {service_name} {kind} and wasn't able to auto-config {service_name}"
                )
        elif service_name not in self.known_services:
            print(
                f"Service {service_name} is not yet configured, you cannot subscribe to it yet"
            )
            return

        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        print(f"Connecting on {service_name} [{len(connected_devices)} clients]")
        try:
            for message in client:
                # Sends message to other modules connected to this channel
                for device in list(connected_devices):
                    try:
                        json_message = json.loads(message)
                        # print("[DEBUG] Received", json_message)
                        param_name = f"{service_name}_{json_message["on"]}"
                        output = getattr(self, f"{param_name}_cv")
                        value = float(json_message["value"])
                        # print(f"[DEBUG] INTERNAL ROUTING {param_name} with {value}")
                        setattr(self, param_name, value)
                        self.send_out(value, ThreadContext(), selected_outputs=[output])
                    except Exception as e:
                        print(
                            f"Couldn't parse the message and broadcast {message} to local instances: {e}"
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
                f"Client {client} on {service_name} disconnected unexpectedly [{len(connected_devices)} clients]"
            )
        finally:
            try:
                print("Remove", client)
                connected_devices.remove(client)
            except ValueError:
                pass

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        # print("[DEBUG] Stopping server")
        for service, clients in self.connected.items():
            # for client in clients:
            #     print(f"[DEBUG] Closing connection for {client} on {service}")
            #     client.send(json.dumps({"on": "__close_bus__"}))
            clients.clear()
        if self.running and self.server:
            print("Shutting down websocket bus...")
            self.server.shutdown()
        for key, value in list(self.__class__.__dict__.items()):
            if isinstance(value, VirtualParameter):
                delattr(self.__class__, key)
        super().stop(clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        device, *parameter = on.split("_")
        parameter = "_".join(parameter)

        devices = self.connected[device]
        setattr(self, parameter, value)
        for connected in list(devices):
            try:
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
            except (ConnectionClosed, TimeoutError) as e:
                try:
                    devices.remove(device)
                    kind = (
                        "crashed"
                        if isinstance(e, (ConnectionClosedError, TimeoutError))
                        else "disconnected"
                    )
                    print(
                        f"Cannot send information on {parameter} for {connected}, it probably {kind} [{len(devices)} clients]"
                    )
                except Exception:
                    pass

    def configure_remote_device(self, name, parameters: list[str | dict[str, Any]]):
        virtual_parameters = []
        for parameter in parameters:
            is_stream = False
            range = (None, None)
            pname = parameter
            print("Configuring", parameter)
            if isinstance(parameter, dict):
                pname = parameter.get("name", None)
                range = parameter.get("range", range)
                is_stream = parameter.get("stream", False)
            param_name = f"{name}_{pname}"
            cv_name = f"{param_name}_cv"
            # waiting_room = getattr(self, cv_name, None)
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
            print("Registering", cv_name, "range", range, "stream", is_stream)
            virtual_parameters.append(vparam)
            setattr(self.__class__, cv_name, vparam)
            if waiting_room and isinstance(waiting_room, WSWaitingRoom):
                del self.__dict__[cv_name]
                waiting_room.rebind(self)
        self.known_services[name] = virtual_parameters
        if self.to_update:
            self.to_update.send_update(self)
