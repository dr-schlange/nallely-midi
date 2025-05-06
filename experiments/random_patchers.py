import random
from typing import Any

import nallely
from nallely.core import ThreadContext, virtual_device_classes, virtual_devices
from nallely.trevor import TrevorBus
from nallely.utils import WebSocketBus


class InstanceCreator(nallely.VirtualDevice):
    trigger_cv = nallely.VirtualParameter("trigger", range=(0, 1))
    instance_number_cv = nallely.VirtualParameter("instance_number", range=(0, 3))

    def __init__(self, *args, **kwargs):
        self.trigger = 0
        self.instance_number = 0
        for device in virtual_devices:
            if isinstance(device, TrevorBus):
                self.trevor = device
        super().__init__(*args, **kwargs)

    def main(self, ctx: ThreadContext) -> Any:
        if self.trigger == 1:
            self.trigger = 0
            inumber = int(self.instance_number)
            classes = [
                cls
                for cls in virtual_device_classes
                if cls not in [TrevorBus, WebSocketBus, InstanceCreator]
            ]
            self.instance_number = random.randint(0, inumber)
            self.output = self.instance_number
            for _ in range(self.instance_number + 1):
                cls = random.choice(classes)
                device = cls()
                device.start()
            if self.trevor:
                self.trevor.send_update()
        return self.instance_number
