# How to run me:
# $ nallely run -b -i experiments/random_device_config.py
# or
# $ python experiments/random_device_config.py

import random

from nallely import MidiDevice, Module, ModuleParameter
from nallely.devices import NTS1


def generate_config(device, parameters):
    for parameter in parameters:
        parameter: ModuleParameter
        setattr(
            getattr(device, parameter.section_name),
            parameter.name,
            random.randint(0, 127),
        )


def randomize_config(device: MidiDevice):
    all_parameters = []
    for section in device.modules.modules.values():
        section: Module
        all_parameters.extend(section.meta.parameters)

    print(f"What's your opinion on this config for your {device.__class__.__name__}? ")
    print("  * s => save config")
    print("  * enter => next")
    print("  * q => quit randomizer")
    i = 1
    while True:
        generate_config(device, all_parameters)
        r = input("> ")
        if r == "q":
            break
        if r == "s":
            device.save_preset(f"random_preset_{i}.json")
        i += 1


#!! Change your device here
nts1 = NTS1()

randomize_config(nts1)
