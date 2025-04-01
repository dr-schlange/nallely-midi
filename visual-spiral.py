from nallely.core import (
    get_connected_devices,
    get_virtual_devices,
    stop_all_connected_devices,
)

# from nallely.devices import MPD32
from nallely.lfos import LFO
from nallely.utils import WebSocketSwitch


try:
    # Creates the ws server that will send values to the module that registers on it
    ws = WebSocketSwitch()
    ws.start()

    # Creates various LFOs
    lfo = LFO(waveform="sine", min_value=0.1, max_value=3, speed=0.001)
    lfo2 = LFO(waveform="sawtooth", min_value=10, max_value=100, speed=0.01)
    lfo.start()
    lfo2.start()

    # In script mode, we have to know the name of the module that will be registered,
    # as well as the parameter names.
    # We can map LFOs or controls to the module, even if it doesn't exist yet.
    # When the module will register to the ws server, the LFOs and controls will be
    # bind automatically to the module and the module parameters.
    # The autoconfig part is more dedicated to a further version where a small UI will be here to
    # "control" dynamically virtual devices, observe connected devices and allows dynamic mapping between
    # them.
    # This module "spiral" exposes:
    #   - particleColor (interesting values in range [min=0.0, max=1]),
    #   - pattern (interesting values in range [min=0.1, max=3]),
    #   - spiralFactor (interesting values in range [min=0.01, max=1]),
    #   - maxRadius (interesting values in range [min=1, max=100]),
    #   - animationSpeed (interesting values in range [min=0.02, max=5]),
    #   - rotationSpeed (interesting values in range [min=0.001, max=1000]),
    #   - hueCircling (interesting values in range [min=0, max=1]),
    # we send the values of the lfo to "/spiral" for the parameter "pattern"

    ws.spiral_pattern = lfo

    # We apply a scaler here, we could have changed the range of the lfo, but it's an example
    ws.spiral_particleColor = lfo2.scale(min=0.0, max=1, method="lin")

    # We send data on "/scope" also, in case the external scope connects (on "data")
    ws.scope_data = lfo2

    # # We map k1 from the MPD32 to the speed of the lfo
    # mpd32 = MPD32()
    # lfo2.speed_cv = mpd32.modules.buttons.k1.scale(min=0.01, max=1, method="lin")

    print("The system is waiting for modules to auto-register")
    while (
        input(
            "Type enter to see the state of the system, or 'q' followed by enter to stop\n"
        )
        != "q"
    ):
        print("Virtual devices:")
        for device in get_virtual_devices():
            print(" * ", device)
        print("Connected MIDI devices")
        for device in get_connected_devices():
            print(" * ", device.device_name)
        print("Registered devices/services from the WS server")
        for service, parameters in ws.known_services.items():
            print(" * ", service, tuple(p.name for p in parameters))
finally:
    stop_all_connected_devices()
