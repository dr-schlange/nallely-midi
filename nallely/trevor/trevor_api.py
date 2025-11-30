import threading
from decimal import Decimal
from itertools import chain
from typing import Any, cast

from ..core import (
    MidiDevice,
    Scaler,
    VirtualDevice,
    all_devices,
    connected_devices,
    midi_device_classes,
    stop_all_connected_devices,
    unbind_all,
    virtual_devices,
)
from ..core.world import ThreadContext, get_virtual_device_classes, virtual_device_classes


class TrevorAPI:

    @staticmethod
    def get_device_instance(device_id) -> VirtualDevice | MidiDevice:
        return next(
            (device for device in all_devices() if device.uuid == int(device_id))
        )

    @classmethod
    def random_preset(cls, device_id):
        device = cls.get_device_instance(device_id)
        device.random_preset()

    def execute_code(self, code, exec_context):
        bytecode = compile(source=code, filename="<string>", mode="exec")
        exec(bytecode, globals(), exec_context)

    def execute_code_threaded(self, code, exec_context, on_done):
        def runner():
            try:
                bytecode = compile(code, "<string>", "exec")
                exec(bytecode, {}, exec_context)
            finally:
                if on_done:
                    on_done()

        thread = threading.Thread(target=runner)
        thread.start()
        return thread

    def create_device(self, name):
        cls = next((cls for cls in midi_device_classes if cls.__name__ == name), None)
        if cls is None:
            # cls = next((cls for cls in get_virtual_device_classes() if cls.__name__ == name))
            cls = virtual_device_classes[name]
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

    def mute_link(self, from_parameter, to_parameter, muted):
        from_device, _, _ = from_parameter.split("::")

        src_device = self.get_device_instance(from_device)

        link = src_device.links_registry.get((from_parameter, to_parameter))
        if link:
            link.muted = muted

    def set_link_velocity(self, from_parameter, to_parameter, velocity):
        from_device, _, _ = from_parameter.split("::")

        src_device = self.get_device_instance(from_device)

        link = src_device.links_registry.get((from_parameter, to_parameter))
        if link:
            link.velocity = velocity

    def reset_all(self, skip_unregistered=True):
        stop_all_connected_devices(skip_unregistered)

    def associate_parameters(
        self,
        from_parameter,
        to_parameter,
        unbind=False,
        with_scaler: bool | dict[str, Any] = True,
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
            if isinstance(with_scaler, dict):
                chain = src.scale(
                    min=with_scaler.get("to_min"),
                    max=with_scaler.get("to_max"),
                    as_int=with_scaler.get("as_int"),
                )
            elif target:
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

    def resume_device(self, device_id, start=None):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.resume()

    def pause_device(self, device_id, start=None):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        if start:
            device.start()
        device.pause()

    def set_virtual_value(self, device_id, parameter, value):
        device: VirtualDevice = self.get_device_instance(device_id)  # type: ignore
        try:
            value = float(Decimal(str(value).replace(",", ".")))
        except:
            ...
        # if "." in str(value) or "," in str(value):
        #     # value = Decimal(str(value).replace(",", "."))
        #     value = float(Decimal(str(value).replace(",", ".")))
        # else:
        #     try:
        #         value = round(value)
        #     except:
        #         ...
        try:
            try:
                last_value = getattr(device, parameter)
            except:
                last_value = None
            device.set_parameter(
                parameter, value, ThreadContext({"last_value": last_value})
            )
        except Exception as e:
            print(f"Couldn't set {parameter} to {value} for {device_id}: {e}")

    def delete_all_connections(self):
        unbind_all()

    def kill_device(self, device_id):
        dev = self.get_device_instance(device_id)
        dev.stop()

    def set_parameter_value(self, device_id, section_name, parameter_name, value):
        dev = self.get_device_instance(device_id)
        setattr(getattr(dev, section_name), parameter_name, value)

    def set_device_channel(self, device_id, channel):
        channel = int(channel)
        if channel < 0:
            channel = 0
        elif channel > 15:
            channel = 15
        dev = cast(MidiDevice, self.get_device_instance(device_id))
        dev.force_all_notes_off()
        dev.channel = channel

    def all_virtual_schemas(self):
        return [s.schema_as_dict() for s in get_virtual_device_classes()]

    def create_devices(self, device_classes):
        devices = []
        for cls_name, count in device_classes.items():
            for _ in range(count):
                devices.append(self.create_device(cls_name))
        return devices
