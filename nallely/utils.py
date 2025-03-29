import json
import threading
from collections import defaultdict, deque

import plotext as plt
from websockets.sync.server import serve

from .core import ThreadContext, VirtualDevice, VirtualParameter


class TerminalOscilloscope(VirtualDevice):
    data = VirtualParameter("data", stream=True, consummer=True)
    data2 = VirtualParameter("data2", stream=True, consummer=True)

    def __init__(self, enable_display=True, buffer_size=100, refresh_rate: float = 60):
        self.buffer_size = buffer_size
        # self.visu_data = deque([], maxlen=self.buffer_size)
        # self.all = defaultdict(lambda: deque([], maxlen=self.buffer_size))
        self.flows = defaultdict(
            lambda: defaultdict(lambda: deque([], maxlen=self.buffer_size))
        )
        super().__init__(target_cycle_time=1 / refresh_rate)
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


class WebSocketSwitchDevice(VirtualDevice):
    def __init__(self, **kwargs):
        super().__init__(target_cycle_time=1 / 20, **kwargs)
        self.server = serve(self.handler, "localhost", 6789)
        self.connected = defaultdict(list)

    def handler(self, websocket):
        path = websocket.request.path
        if path.endswith("/autoconfig"):
            message = json.loads(websocket.recv())
            self.configure_remote_device(
                message["name"], parameters=message["parameters"]
            )
            return
        device = path.split("/")[1]
        self.connected[device].append(websocket)
        try:
            for message in websocket:
                ...
        finally:
            self.connected[device].remove(websocket)

    def setup(self):
        self.server.serve_forever()
        return super().setup()

    def stop(self, clear_queues=False):
        if self.running and self.server:
            self.server.shutdown()
        super().stop(clear_queues)

    def receiving(self, value, on, ctx: ThreadContext):
        device, parameter = on.split("::")

        for connected in self.connected[device]:
            connected.send(
                json.dumps(
                    {
                        "value": float(value),
                        "device": device,
                        "on": parameter,
                        "sender": ctx["param"],
                    }
                )
            )

    def configure_remote_device(self, name, parameters: list[str]):
        for parameter in parameters:
            param_name = f"{name}_{parameter}"
            rebind = getattr(self, param_name, None)
            setattr(
                self.__class__,
                param_name,
                VirtualParameter(f"{name}::{parameter}", consummer=True, stream=False),
            )
            if rebind is not None:
                setattr(self, param_name, rebind)
