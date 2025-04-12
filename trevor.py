from collections import defaultdict
from dataclasses import asdict
from multiprocessing import connection

import mido
from nallely import VirtualDevice
from nallely.devices import NTS1, Minilogue, MPD32, minilogue, mpd32
import nallely
from nallely.core import (
    CallbackRegistryEntry,
    ThreadContext,
    connected_devices,
    virtual_devices,
)
from websockets.sync.server import serve
import json


class TrevorBus(VirtualDevice):
    variable_refresh = False

    def __init__(self, host="0.0.0.0", port=6788, **kwargs):
        super().__init__(target_cycle_time=10, **kwargs)
        self.connected = defaultdict(list)
        self.server = serve(self.handler, host=host, port=port)

    def handler(self, client):
        path = client.request.path
        service_name = path.split("/")[1]
        print("Connected on", service_name)
        connected_devices = self.connected[service_name]
        connected_devices.append(client)
        try:
            client.send(json.dumps(self.connected_devices()))
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

    def connected_devices(self):
        connections = []
        for device in connected_devices:
            for entry in device.callbacks_registry:
                entry: CallbackRegistryEntry
                connections.append(
                    {
                        "src": {
                            "device": id(device),
                            "parameter": asdict(
                                device.reverse_map[(entry.type, entry.cc_note)]
                            ),
                        },
                        "dest": {
                            "device": id(entry.target),
                            "parameter": asdict(entry.parameter),
                        },
                    }
                )
        d = {
            "input_ports": mido.get_input_names(),
            "output_ports": mido.get_output_names(),
            "midi_devices": [device.to_dict() for device in connected_devices],
            "connections": connections,
        }
        for device in virtual_devices:
            print(id(device), device)

        from pprint import pprint

        pprint(d["connections"])
        return d


try:
    # nts1 = NTS1()
    # mpd32 = MPD32()
    minilogue = Minilogue("Scarlett")

    # nts1.filter.cutoff = minilogue.delay.feedback
    minilogue.filter.cutoff = minilogue.delay.feedback
    minilogue.delay.time = minilogue.delay.feedback
    minilogue.filter.eg_intensity = minilogue.delay.feedback

    ws = TrevorBus()
    ws.start()
    # ws.connected_devices()

    input("Stop server...")
finally:
    nallely.stop_all_connected_devices()
