import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from websockets import ConnectionClosed, ConnectionClosedError
from websockets.sync.server import serve

from .core import (
    ParameterInstance,
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
)
from .modules import Int, ModulePadsOrKeys, PadOrKey, Scaler


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
                waiting_room = WSWaitingRoom(key)
                waiting_room.append(value)
                object.__setattr__(self, key, waiting_room)
                return
            object.__setattr__(self, key, value)

        self.__class__.__setattr__ = __setattr__

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        if path.endswith("/autoconfig") and service_name not in self.connected:
            print(f"Autoconfig for {service_name}")
            message = json.loads(client.recv())
            print(f"Parameters: {message['parameters']}")
            self.configure_remote_device(service_name, parameters=message["parameters"])  # type: ignore
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
                        device.send(message)
                    except ConnectionClosed as e:
                        try:
                            connected_devices.remove(device)
                            kind = (
                                "crashed"
                                if isinstance(e, ConnectionClosedError)
                                else "disconnected"
                            )
                            print(
                                f"Client {device} on {service_name} {kind} [{len(connected_devices)} clients]"
                            )
                        except Exception:
                            ...
        except ConnectionClosed:
            print(
                f"Client {client} on {service_name} disconnected unexpectedly [{len(connected_devices)} clients]"
            )
        finally:
            print("Remove", client)
            connected_devices.remove(client)

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        if self.running and self.server:
            self.server.shutdown()
        for key, value in list(self.__class__.__dict__.items()):
            if isinstance(value, VirtualParameter):
                delattr(self.__class__, key)
        super().stop(clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        device, *parameter = on.split("_")
        parameter = "_".join(parameter)

        devices = self.connected[device]
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
                    ...

    def configure_remote_device(self, name, parameters: list[str | dict[str, Any]]):
        virtual_parameters = []
        for parameter in parameters:
            is_stream = False
            range = (None, None)
            pname = parameter
            print(parameter)
            if isinstance(parameter, dict):
                pname = parameter.get("name", None)
                range = parameter.get("range", range)
                is_stream = parameter.get("stream", False)
            param_name = f"{name}_{pname}"
            waiting_room = getattr(self, param_name, None)
            vparam = VirtualParameter(
                f"{param_name}",
                consumer=True,
                stream=is_stream,
                cv_name=param_name,
                range=range,
            )
            print("Registering", param_name, "range", range, "stream", is_stream)
            virtual_parameters.append(vparam)
            setattr(self.__class__, param_name, vparam)
            if waiting_room and isinstance(waiting_room, WSWaitingRoom):
                waiting_room.rebind(self)
        self.known_services[name] = virtual_parameters
        if self.to_update:
            self.to_update.send_update(self)
