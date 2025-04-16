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
    virtual_device_classes,
    midi_device_classes,
    no_registration,
    all_devices,
)
from websockets.sync.server import serve
import json
from minilab import Minilab


@no_registration
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
            client.send(json.dumps(self.full_state()))
            for message in client:
                # Sends message to other modules connected to this channel
                # for device in connected_devices:
                #     if device == client:
                #         continue
                # device.send(message)
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

    def handleMessage(self, client, message):
        message = json.loads(message)
        cmd = message["command"]
        del message["command"]
        params = message
        res = getattr(self, cmd)(**params)
        if res:
            for client in self.connected["trevor"]:
                client.send(json.dumps(res))

    def create_device(self, name):
        cls = next((cls for cls in midi_device_classes if cls.__name__ == name), None)
        if cls is None:
            cls = next((cls for cls in virtual_device_classes if cls.__name__ == name))
        cls(autoconnect=False)
        return self.full_state()

    @staticmethod
    def get_device_instance(device_id):
        return next(
            (device for device in all_devices() if id(device) == int(device_id))
        )

    def associate_parameters(self, from_parameter, to_parameter):
        from_device, from_section, from_parameter = from_parameter.split("::")
        to_device, to_section, to_parameter = to_parameter.split("::")
        src_device = self.get_device_instance(from_device)
        dst_device = self.get_device_instance(to_device)
        dest = getattr(dst_device, to_section)
        src = getattr(getattr(src_device, from_section), from_parameter)
        setattr(dest, to_parameter, src)
        return self.full_state()

    def associate_midi_port(self, device, port, direction):
        device = self.get_device_instance(device)
        if direction == "output":
            if device.outport_name == port:
                device.close_out()
                return self.full_state()
            device.outport_name = port
            device.connect()
        else:
            if device.inport_name == port:
                device.close_in()
                return self.full_state()
            device.inport_name = port
            device.listen()
        return self.full_state()

    def full_state(self):
        connections = []

        def scaler_as_dict(scaler):
            if scaler is None:
                return None
            return {
                "device": id(scaler.data.device),
                "min": scaler.to_min,
                "max": scaler.to_max,
                "auto": scaler.auto,
                "method": scaler.method,
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
                            "parameter": asdict(device.reverse_map[(cc_type, cc_note)]),
                            "explicit": entry.cc_note,
                            "chain": scaler_as_dict(entry.chain),
                        },
                        "dest": {
                            "device": id(entry.target),
                            "parameter": asdict(entry.parameter),
                            "explicit": entry.cc_note,
                        },
                    }
                )
        d = {
            "input_ports": mido.get_input_names(),
            "output_ports": mido.get_output_names(),
            "midi_devices": [device.to_dict() for device in connected_devices],
            "connections": connections,
            "classes": {
                "virtual": [cls.__name__ for cls in virtual_device_classes],
                "midi": [cls.__name__ for cls in midi_device_classes],
            },
        }
        for device in virtual_devices:
            print(id(device), device)

        from pprint import pprint

        pprint(d["input_ports"])

        return d


try:
    # nts1 = NTS1(device_name="Scarlett")
    # mlab = Minilab(device_name="Scarlett", debug=True)

    # nts1 = NTS1()
    # mlab = Minilab(debug=True)
    # minilogue = Minilogue(device_name="Scarlett")

    # nts1.filter.cutoff = mlab.set3.b9.scale(10, 127)
    # nts1.filter.resonance = mlab.set3.b9.scale(127, 5)
    # nts1.ocs.lfo_depth = mlab.set3.b10
    # # nts1.filter.resonance = mlab.set3.b10
    # # nts1.filter.cutoff = mlab.set3.b11.scale(10, 127)
    # # nts1.filter.resonance = mlab.set3.b11
    # # nts1.ocs.type = mlab.set1.b1
    # # nts1.ocs.shape = mlab.set1.b2
    # # # nts1.ocs.alt = mlab.set1.b2
    # # nts1.ocs.lfo_depth = mlab.set1.b4

    # nts1.keys.notes = mlab.keys[:]
    # minilogue.keys.notes = mlab.keys[:]
    # nts1.keys.notes = mlab.pads[37:]

    # nts1.ocs.lfo_rate = mlab.pads[36].velocity_hold.scale(0, 127)
    # # nts1.ocs.lfo_depth = mlab.pads.p9.scale(10, 100)

    # # nts1.ocs.type = mlab.keys.mod
    # nts1.arp.length = mlab.set1.b1
    # # nts1.arp.intervals = mlab.pads[37].scale((127//6) * 1)
    # # nts1.arp.intervals = mlab.pads[38].scale((127//6) * 2)
    # # nts1.arp.intervals = mlab.pads[39].scale((127//6) * 3)
    # # nts1.arp.intervals = mlab.pads[40].scale((127//6) * 4)
    # # nts1.arp.intervals = mlab.pads[41].scale((127//6) * 5)
    # # nts1.arp.intervals = mlab.pads[42].scale((127//6) * 6)

    # nts1.arp.intervals = mlab.pads.p9.scale((127 // 6) * 0, (127 // 6) * 0)
    # nts1.arp.intervals = mlab.pads.p10.scale((127 // 6) * 1, (127 // 6) * 1)
    # nts1.arp.intervals = mlab.pads.p11.scale((127 // 6) * 2, (127 // 6) * 2)
    # nts1.arp.intervals = mlab.pads.p12.scale((127 // 6) * 3, (127 // 6) * 3)
    # nts1.arp.intervals = mlab.pads.p13.scale((127 // 6) * 4, (127 // 6) * 4)
    # nts1.arp.intervals = mlab.pads.p14.scale((127 // 6) * 5, (127 // 6) * 5)

    # mpd32 = MPD32()
    # minilogue = Minilogue("Scarlett")
    # nts1.filter.cutoff = minilogue.delay.feedback
    # minilogue.filter.cutoff = minilogue.delay.feedback
    # minilogue.delay.time = minilogue.delay.feedback
    # minilogue.filter.eg_intensity = minilogue.delay.feedback

    ws = TrevorBus()
    ws.start()
    # ws.connected_devices()

    input("Stop server...")
finally:
    nallely.stop_all_connected_devices()
