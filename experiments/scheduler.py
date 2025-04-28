from collections import defaultdict
import time

from ..nallely.core import TimeBasedDevice, VirtualDevice


class VirtualDeviceScheduler(VirtualDevice):
    def __init__(self, **kwargs):
        self.connections = []
        super().__init__(**kwargs)

    def main(self, ctx):
        devices_graph = defaultdict(list)
        devices = {}
        is_used_as_src = []
        for src, dest in self.connections:
            # We should build a chain for all the dependencies to build multiple trees
            # This is a first PoC
            if isinstance(src, TimeBasedDevice) and isinstance(dest, TimeBasedDevice):
                dest_id = id(dest)
                devices_graph[dest_id].append(src)
                devices[dest_id] = dest
                is_used_as_src.append(src)

        for device_id, feeders in devices_graph.items():
            device = devices[device_id]
            if device not in is_used_as_src:  # We know we are on a "leaf"
                ...  # adjust me
            # we go 5 times the sum of all the freqs
            ideal_refresh_freq = int(
                sum((1 / f.target_cycle_time) for f in feeders) * 5
            )
            current_refresh_freq = int(1 / device.target_cycle_time)
            print(
                f"Ideal is {ideal_refresh_freq}Hz, and current is {current_refresh_freq}Hz"
            )
            if ideal_refresh_freq != current_refresh_freq:
                print(f"Change to {ideal_refresh_freq}")
                device.set_parameter("sampling_rate", ideal_refresh_freq)
                time.sleep(1)


# Try to enforce 1Hz for this device
scheduler = VirtualDeviceScheduler(target_cycle_time=0.5)
scheduler.start()
