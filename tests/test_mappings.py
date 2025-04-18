import pytest
from nallely import LFO
import nallely
from .fixtures import DeviceSimulator, new_receiver, new_sender, let_time_to_react, CTX


def midi_sender():
    return DeviceSimulator("sender")


def midi_receiver():
    return DeviceSimulator("receiver")


@pytest.fixture(scope="function")
def sender():
    simu, device = midi_sender(), new_sender()
    yield simu, device
    nallely.stop_all_connected_devices()


@pytest.fixture(scope="function")
def receiver():
    simu, device = midi_receiver(), new_receiver()
    yield simu, device
    nallely.stop_all_connected_devices()


def test__set_value(receiver):
    _, receiver = receiver

    assert receiver.sink1 == 0
    assert receiver.sink2 == 0

    receiver.modules.main.sink1 = 33
    receiver.modules.main.sink2 = 45

    assert receiver.sink1 == 33
    assert receiver.sink2 == 45


def test__receive_information(sender):
    send_simu, sender = sender

    # if we received information
    received = CTX()
    sender.modules.main.button1 = lambda value, ctx: received.add(0, value)
    sender.modules.main.button2 = lambda value, ctx: received.add(1, value)

    # We simulate a trigger of the control 45 by a user, sending value 32
    send_simu.cc(45, 32)

    let_time_to_react()

    assert received.get(0) == 32
    assert received.get(1) == 0


def test__mapping_sender_receiver(sender, receiver):
    send_simu, sender = sender
    _, receiver = receiver

    receiver.modules.main.sink1 = sender.modules.main.button1

    # We simulate a trigger of 2 controls, 1 mapped, the other no
    send_simu.cc(45, 32)
    send_simu.cc(46, 15)

    let_time_to_react()

    assert receiver.sink1 == 32
    assert receiver.sink2 == 0


def test__mapping_virtual_receiver(receiver):
    _, receiver = receiver
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)

    lfo.start()
    receiver.modules.main.sink1 = lfo

    let_time_to_react()

    assert receiver.sink1 == 5 or receiver.sink1 == 10
    assert receiver.sink2 == 0


def test__mapping_sender_virtual(sender):
    simu, sender = sender
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)

    lfo.start()
    lfo.speed_cv = sender.modules.main.button1

    let_time_to_react()

    simu.cc(45, 100)

    let_time_to_react()

    assert lfo.speed == 100


def test__mapping_virtual_virtual(sender):
    simu, sender = sender
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)
    lfo2 = LFO(waveform="square", min_value=5, max_value=10, speed=1000)
    lfo.start()
    lfo2.start()

    lfo2.max_value_cv = lfo2

    let_time_to_react()

    assert lfo2.max_value == 5 or lfo2.max_value == 10
