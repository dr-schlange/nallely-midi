from itertools import chain

from ..core import (
    MidiDevice,
    VirtualDevice,
    all_devices,
    connected_devices,
    midi_device_classes,
    stop_all_connected_devices,
    unbind_all,
    virtual_device_classes,
    virtual_devices,
    Scaler,
)


class TrevorAPI:

    @staticmethod
    def get_device_instance(device_id) -> VirtualDevice | MidiDevice:
        return next(
            (device for device in all_devices() if id(device) == int(device_id))
        )

    @classmethod
    def random_preset(cls, device_id):
        device = cls.get_device_instance(device_id)
        device.random_preset()

    def execute_code(self, code, exec_context):
        bytecode = compile(source=code, filename="<string>", mode="exec")
        exec(bytecode, globals(), exec_context)

    def create_device(self, name):
        cls = next((cls for cls in midi_device_classes if cls.__name__ == name), None)
        if cls is None:
            cls = next((cls for cls in virtual_device_classes if cls.__name__ == name))
        devices = all_devices()
        try:
            # We auto-connect the virtual device,
            # or try to auto-connect the midi device to the right midi ports
            instance = cls(autoconnect=True)
        except Exception:
            # If there is a problem we remove the auto-connection
            diff = next((item for item in all_devices() if item not in devices), None)
            if diff:
                diff.stop()
            instance = cls(autoconnect=False)
        return instance

    def manage_scaler(self, from_parameter, to_parameter, create):
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
            return scaler
        setattr(dest, to_parameter, src)
        return None

    def set_scaler_parameter(self, scaler_id, parameter, value):
        for device in chain(connected_devices, virtual_devices):
            for entry in device.links_registry.values():
                if id(entry.chain) == scaler_id:
                    scaler = entry.chain
                    setattr(scaler, parameter, value)
                    return scaler
        return None

    def make_link_bouncy(self, from_parameter, to_parameter, bouncy):
        from_device, _, _ = from_parameter.split("::")

        src_device = self.get_device_instance(from_device)

        link = src_device.links_registry.get((from_parameter, to_parameter))
        if link:
            link.bouncy = bouncy

    def reset_all(self, skip_unregistered=True):
        stop_all_connected_devices(skip_unregistered)

    def associate_parameters(
        self, from_parameter, to_parameter, unbind=False, with_scaler=True
    ):
        from_path = from_parameter
        to_path = to_parameter
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
        elif from_parameter.isdecimal():
            # We know it's a key/pad we are binding (src)
            src = getattr(src_device, from_section)[int(from_parameter)]
        elif from_parameter == "all_keys_or_pads":
            # We know we want to bind all the notes/pads [0..127]
            src_section = getattr(src_device, from_section)
            src = getattr(src_section, src_section.meta.pads_or_keys.name)
        else:
            src = getattr(getattr(src_device, from_section), from_parameter)
        if unbind:
            if to_parameter.isdecimal():
                # We know it's a key/pad we are unbinding to (target)
                to_parameter = dest[int(to_parameter)]
            elif to_parameter == "all_keys_or_pads":
                to_parameter = getattr(dest, dest.meta.pads_or_keys.name)
            else:
                to_parameter = getattr(dest, to_parameter)
            if isinstance(src, list):
                for e in src:
                    to_parameter.__isub__(src)
            else:
                to_parameter.__isub__(src)
            return None
        if to_parameter == "all_keys_or_pads":
            to_parameter = dest.meta.pads_or_keys.name
        chain = None
        if isinstance(src, list):
            setattr(dest, to_parameter, src)
        elif to_parameter.isdecimal():
            # We know it's a key/pad we are binding to (target)
            dest[int(to_parameter)] = src
        elif with_scaler:
            target = getattr(dest.__class__, to_parameter, None)
            if target:
                to_range = getattr(dest.__class__, to_parameter).range
                chain = src.scale(to_range[0], to_range[1])
            else:
                chain = src.scale(None, None)
            setattr(dest, to_parameter, chain)
        else:
            setattr(dest, to_parameter, src)
        return src_device.links_registry.get((from_path, to_path))

    def associate_midi_port(self, device, port, direction):
        dev: MidiDevice = self.get_device_instance(device)  # type:ignore
        if direction == "output":
            if dev.outport_name == port:
                dev.close_out()
                return
            dev.outport_name = port
            dev.connect()
        else:
            if dev.inport_name == port:
                dev.close_in()
                return
            dev.inport_name = port
            dev.listen()
        return

    def resume_device(self, device_id, start):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.resume()

    def pause_device(self, device_id, start):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.pause()

    def set_virtual_value(self, device_id, parameter, value):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if "." in str(value):
            value = float(value)
        else:
            try:
                value = int(value)
            except:
                ...
        try:
            device.process_input(parameter, value)
        except Exception as e:
            print(f"Couldn't set {parameter} to {value} for {device_id}: {e}")

    def delete_all_connections(self):
        unbind_all()

    def kill_device(self, device_id):
        dev = self.get_device_instance(device_id)
        dev.stop()
