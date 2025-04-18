import json
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from traceback import print_stack

import plotext as plt
from websockets.sync.server import serve

from .core import ThreadContext, VirtualDevice, VirtualParameter, no_registration


@no_registration
class TerminalOscilloscope(VirtualDevice):
    data = VirtualParameter("data", stream=True, consummer=True)
    data2 = VirtualParameter("data2", stream=True, consummer=True)

    def __init__(
        self, enable_display=True, buffer_size=100, refresh_rate: float = 60, **kwargs
    ):
        self.buffer_size = buffer_size
        self.flows = defaultdict(
            lambda: defaultdict(lambda: deque([], maxlen=self.buffer_size))
        )
        super().__init__(target_cycle_time=1 / refresh_rate, **kwargs)
        self.display = enable_display
        self.lock = threading.Lock()
        self.start()

    def receiving(self, value, on: str, ctx: ThreadContext):
        if not self.running or not self.display:
            return
        colors = ["red", "blue", "green", "orange"]
        t = ctx.get("t", 0)
        datakind = ctx.get("param", "main")
        # self.all[datakind].append(value)
        self.flows[on][datakind].append(value)
        # self.visu_data.append(value)

        with self.lock:
            plt.clt()
            plt.cld()
            plt.theme("clear")
            plt.xticks([])
            plt.yticks([])
            plt.subplots(1, len(self.flows))
            # plt.title(
            #     f"LFO {ctx.parent.waveform} speed={ctx.parent.speed} [{ctx.parent.min_value} - {ctx.parent.max_value}]"
            # )
            plt.scatter([0, 127], marker=" ")
            # plt.plot(self.visu_data, color="green")

            # threashold = 15
            # plt.plot([i for i, v in enumerate(self.visu_data) if v <= threashold], [v for v in self.visu_data if v <= threashold], color="green")
            # plt.plot([i for i, v in enumerate(self.visu_data) if v > threashold], [v for v in self.visu_data if v > threashold], color="red")

            # plt.plot(self.visu_data, color="red" if t < 0.25 else "blue")
            # plt.plot(self.visu_data, color="green")

            for i, (plotname, values) in enumerate(self.flows.items()):
                for kind, data in list(values.items()):
                    plt.subplot(1, i + 1).title(f"[{plotname}]")
                    plt.subplot(1, i + 1).plot(data, label=kind)
            # for kind, data in self.all.items():
            #     plt.plot(data, label=kind)
            # if t == 0:
            #     t = previous
            # previous = t
            plt.show()

    def reset(self):
        self.visu_data = deque([], maxlen=self.buffer_size)


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

    # def __iadd__(self, value):
    #     if value not in self.queue:
    #         self.queue.append(value)
    #     return value

    def flush(self):
        self.queue.clear()
        return self


class WebSocketBus(VirtualDevice):
    variable_refresh = False

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
            if key in self.__dict__ or key in self.__class__.__dict__:
                object.__setattr__(self, key, value)
                return
            waiting_room = WSWaitingRoom(key)
            waiting_room.append(value)
            object.__setattr__(self, key, waiting_room)

        self.__class__.__setattr__ = __setattr__

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        if path.endswith("/autoconfig") and service_name not in self.connected:
            print(f"Autoconfig for {service_name}")
            message = json.loads(client.recv())
            parameters = [
                (str(p["name"]), bool(p.get("stream", False)))
                for p in message["parameters"]
            ]
            print(f"Parameters: {message['parameters']}")
            self.configure_remote_device(service_name, parameters=parameters)  # type: ignore
        elif service_name not in self.known_services:
            print(
                f"Service {service_name} is not yet configured, you cannot subscribe to it yet"
            )
            return
        print("Connecting on", service_name)
        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        try:
            for message in client:
                # Sends message to other modules connected to this channel
                for device in connected_devices:
                    if device == client:
                        continue
                    device.send(message)
        finally:
            connected_devices.remove(client)

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        if self.running and self.server:
            self.server.shutdown()
        super().stop(clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        device, *parameter = on.split("_")
        parameter = "_".join(parameter)

        for connected in self.connected[device]:
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

    def configure_remote_device(self, name, parameters: list[str | tuple[str, bool]]):
        virtual_parameters = []
        for parameter in parameters:
            is_stream = False
            if isinstance(parameter, tuple):
                parameter, is_stream = parameter
            param_name = f"{name}_{parameter}"
            waiting_room = getattr(self, param_name, None)
            vparam = VirtualParameter(f"{param_name}", consummer=True, stream=is_stream)
            virtual_parameters.append(vparam)
            setattr(self.__class__, param_name, vparam)
            if waiting_room and isinstance(waiting_room, WSWaitingRoom):
                waiting_room.rebind(self)
        self.known_services[name] = virtual_parameters
        if self.to_update:
            self.to_update.update(self)
