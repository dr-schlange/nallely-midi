# How to run me:
# $ nallely run -b -i experiments/random_device_config.py
# or
# $ python experiments/random_device_config.py

from nallely import MidiDevice
from nallely.devices import NTS1


def randomize_config(device: MidiDevice):
    print(f"What's your opinion on this config for your {device.__class__.__name__}? ")
    print("  * s => save config")
    print("  * enter => next")
    print("  * q => quit randomizer")
    i = 1
    while True:
        device.random_preset()
        r = input("> ")
        if r == "q":
            break
        if r == "s":
            device.save_preset(f"random_preset_{i}.json")
        i += 1


#!! Change your device here
nts1 = NTS1()

randomize_config(nts1)
