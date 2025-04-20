from collections import defaultdict
from dataclasses import asdict
from decimal import Decimal
from itertools import chain
from multiprocessing import connection
from pathlib import Path

import mido
from nallely import VirtualDevice
from nallely.devices import NTS1, Minilogue, MPD32, minilogue, mpd32
import nallely
from nallely.core import (
    CallbackRegistryEntry,
    MidiDevice,
    ParameterInstance,
    ThreadContext,
    VirtualParameter,
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
from nallely.modules import Scaler


class StateEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(str(o))
        if isinstance(o, ParameterInstance):
            return asdict(o.parameter)
        return super().default(o)


@no_registration
class TrevorBus(VirtualDevice):
    variable_refresh = False

    def __init__(self, host="0.0.0.0", port=6788, **kwargs):
        super().__init__(target_cycle_time=10, **kwargs)
        self.connected = defaultdict(list)
        self.server = serve(self.handler, host=host, port=port)

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
            for client in self.connected["trevor"]:
                client.send(self.to_json(res))

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

    def full_state(self):
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

        for device in virtual_devices:
            for entry in device.callbacks_registry:
                entry: CallbackRegistryEntry
                connections.append(
                    {
                        "src": {
                            "device": id(device),
                            "parameter": asdict(VirtualDevice.output_cv),
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
            "input_ports": [
                name for name in mido.get_input_names() if "RtMidi" not in name
            ],
            "output_ports": [
                name for name in mido.get_output_names() if "RtMidi" not in name
            ],
            "midi_devices": [device.to_dict() for device in connected_devices],
            "virtual_devices": [
                device.to_dict()
                for device in virtual_devices
                if device.__class__ in virtual_device_classes
            ],
            "connections": connections,
            "classes": {
                "virtual": [cls.__name__ for cls in virtual_device_classes],
                "midi": [cls.__name__ for cls in midi_device_classes],
            },
        }
        from pprint import pprint

        # pprint(d["connections"])

        return d


try:
    ws = TrevorBus()
    ws.start()

    # lfo = nallely.LFO(waveform="sine", speed=0.5)
    # lfo.start()
    # lfo.speed_cv = lfo.scale(14, 44)

    # nts1 = NTS1(device_name="Scarlett")
    # # nts1.filter.cutoff = lfo
    # lfo.speed_cv = nts1.filter.cutoff

    # ws.full_state()

    input("Stop server...")
finally:
    nallely.stop_all_connected_devices()
