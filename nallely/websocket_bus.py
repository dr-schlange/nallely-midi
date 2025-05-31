import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

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


@dataclass
class WSWaitingRoom:
    name: str
    queue: list = field(default_factory=list)

    def append(self, value):
        if value not in self.queue:
            self.queue.append(value)

    def rebind(self, target):
        for element in self.queue:
            setattr(target, self.name, element)
        self.flush()

    def flush(self):
        self.queue.clear()
        return self


class WebSocketBus(VirtualDevice):

    def __init__(self, host="0.0.0.0", port=6789, **kwargs):
        self.server = serve(self.handler, host=host, port=port)
        self.connected = defaultdict(list)
        self.known_services = {}
        self.to_update = None
        super().__init__(target_cycle_time=10, **kwargs)

    def __setattr__(self, key, value):
        if isinstance(getattr(self, key, None), WSWaitingRoom):
            getattr(self, key).append(value)
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
            print(f"[DEBUG] Set in waiting room for {key}")
            waiting_room = WSWaitingRoom(key)
            waiting_room.append(value)
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
            except ConnectionClosed as e:
                kind = (
                    "crashed"
                    if isinstance(e, ConnectionClosedError)
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
                    if device == client:
                        continue
                    try:
                        json_message = json.loads(message)
                        param_name = f"{service_name}_{json_message["on"]}"
                        output = getattr(self, f"{param_name}_cv")
                        value = float(json_message["value"])
                        setattr(self, param_name, value)
                        self.process_output(
                            value, ThreadContext(), selected_outputs=[output]
                        )
                    except Exception as e:
                        print(
                            f"Couldn't parse the message and broadcast {message} to local instances: {e}"
                        )
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
        except ConnectionClosed:
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
        # setattr(self, parameter, value)
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
            except ConnectionClosed as e:
                try:
                    devices.remove(device)
                    kind = (
                        "crashed"
                        if isinstance(e, ConnectionClosedError)
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
            waiting_room = getattr(self, cv_name, None)
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
