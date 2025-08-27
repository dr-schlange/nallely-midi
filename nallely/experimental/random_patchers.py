import itertools
import random
from typing import Any

from nallely import (
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
    WebSocketBus,
    all_devices,
    virtual_device_classes,
    virtual_devices,
)
from nallely.trevor import TrevorAPI, TrevorBus


class InstanceCreator(VirtualDevice):
    trigger_cv = VirtualParameter("trigger", range=(0, 1))
    instance_number_cv = VirtualParameter("instance_number", range=(0, 3))

    def __init__(self, *args, **kwargs):
        self.trigger = 0
        self.instance_number = 0
        self.trevor_bus = None
        for device in virtual_devices:
            if isinstance(device, TrevorBus):
                self.trevor_bus = device
                break
        super().__init__(*args, **kwargs)

    def main(self, ctx: ThreadContext) -> Any:
        if self.trigger == 1:
            self.trigger = 0
            inumber = int(self.instance_number)
            classes = [
                cls
                for cls in virtual_device_classes
                if cls not in [TrevorBus, WebSocketBus, InstanceCreator, RandomPatcher]
            ]
            self.instance_number = random.randint(0, inumber)
            self.output = self.instance_number
            for _ in range(self.instance_number + 1):
                cls = random.choice(classes)
                device = cls()
                device.start()
            if self.trevor_bus:
                self.trevor_bus.send_update()
        return self.instance_number


class RandomPatcher(VirtualDevice):
    trigger_cv = VirtualParameter("trigger", range=(0, 1))
    max_patch_cv = VirtualParameter("max_patch", range=(2, 20))
    exclude_device_cv = VirtualParameter("exclude_device", accepted_values=[])

    def __init__(self, *args, **kwargs):
        self.trigger = 0
        self.max_patch = 5
        self.trevor_bus = None
        self.exclude_device = None
        for device in virtual_devices:
            if isinstance(device, TrevorBus):
                self.trevor_bus = device
                break
        self.trevor_api = self.trevor_bus.trevor if self.trevor_bus else TrevorAPI()
        super().__init__(*args, **kwargs)

    def main(self, ctx: ThreadContext) -> Any:
        parameters = []
        accepted_values = [
            "--",
            *(list(d.__class__.__name__ for d in all_devices())),
        ]
        self.exclude_device_cv.parameter.accepted_values = accepted_values
        self.exclude_device_cv.parameter.range = (0, len(accepted_values))

        if self.trigger == 1:
            self.trigger = 0
            parameters = self.all_system_parameters()
            self.random_patch(parameters)
            if self.trevor_bus:
                self.trevor_bus.send_update()

        return len(all_devices()) + len(parameters)

    def all_system_parameters(self):
        all_parameters = []
        for device in all_devices():
            if device.__class__ in [TrevorBus]:
                continue
            all_parameters.extend((id(device), p) for p in device.all_parameters())
            device.random_preset()

        encoded_parameters = [
            f"{d}::{p.section_name}::{getattr(p, "cv_name", p.name)}"
            for d, p in all_parameters
        ]
        inputs = [e for e in encoded_parameters if "output" not in e]
        outputs = [e for e in encoded_parameters if "output" in e]
        return inputs, outputs

    def random_patch(self, parameters):
        inputs, outputs = parameters
        possible_combinations = list(itertools.product(outputs, inputs))
        selected_combinations = [
            random.choice(possible_combinations) for _ in range(10)
        ]
        self.trevor_api.delete_all_connections()

        for src, dst in selected_combinations:
            self.trevor_api.associate_parameters(src, dst)

    def store_input(self, param, value):
        if param == "exclude_device":
            if value == "--":
                return

        return super().store_input(param, value)
