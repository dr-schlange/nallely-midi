import pytest

import nallely
from nallely import LFO

from .fixtures import CTX, DeviceSimulator, let_time_to_react, new_receiver, new_sender


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


# def test__receive_information(sender):
#     send_simu, sender = sender

#     # if we received information
#     received = CTX()
#     sender.modules.main.button1 = lambda value, ctx: received.add(0, value)
#     sender.modules.main.button2 = lambda value, ctx: received.add(1, value)

#     # We simulate a trigger of the control 45 by a user, sending value 32
#     send_simu.cc(45, 32)

#     let_time_to_react()

#     assert received.get(0) == 32
#     assert received.get(1) == 0


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
    _, sender = sender
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)
    lfo2 = LFO(waveform="square", min_value=5, max_value=10, speed=1000)
    lfo.start()
    lfo2.start()

    lfo2.max_value_cv = lfo

    let_time_to_react()

    assert lfo2.max_value == 5 or lfo2.max_value == 10


def test__remove_mapping_virtual_virtual(sender):
    _, sender = sender
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)
    lfo2 = LFO(waveform="square", min_value=5, max_value=10, speed=1000)

    assert len(lfo.links_registry) == 0
    assert len(lfo2.links_registry) == 0

    lfo2.max_value_cv = lfo

    assert len(lfo.links_registry) == 1
    assert len(lfo.nonstream_links) == 1

    lfo2.max_value_cv -= lfo

    assert len(lfo.links_registry) == 0
    assert (
        len(lfo.nonstream_links) == 1
    )  # there is still the key in the map, but no callbacks
    assert len(lfo.nonstream_links["output"]) == 0


def test__remove_mapping_sender_receiver(sender, receiver):
    _, sender = sender
    _, receiver = receiver

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.sink1 = sender.modules.main.button1

    assert len(sender.links) == 1
    assert len(receiver.links) == 0

    receiver.modules.main.sink1 -= sender.modules.main.button1

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("control_change", 45)]) == 0
    assert len(receiver.links) == 0


def test__remove_mapping_sender_virtual(sender):
    _, sender = sender
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)

    assert len(sender.links) == 0
    assert len(lfo.stream_links) == 0
    assert len(lfo.nonstream_links) == 0

    lfo.speed_cv = sender.modules.main.button1

    assert len(sender.links) == 1
    assert len(lfo.stream_links) == 0
    assert len(lfo.nonstream_links) == 0

    lfo.speed_cv -= sender.modules.main.button1

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("control_change", 45)]) == 0
    assert len(lfo.stream_links) == 0
    assert len(lfo.nonstream_links) == 0


def test__remove_mapping_virtual_receiver(receiver):
    _, receiver = receiver
    lfo = LFO(waveform="square", min_value=5, max_value=10, speed=1000)

    assert len(lfo.stream_links) == 0
    assert len(lfo.nonstream_links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.sink1 = lfo

    assert len(lfo.stream_links) == 0
    assert len(lfo.nonstream_links) == 1
    assert len(receiver.links) == 0

    receiver.modules.main.sink1 -= lfo

    assert (
        len(lfo.stream_links) == 1
    )  # There is the key as there is a check, but it has to be empty
    assert len(lfo.stream_links[lfo.repr()]) == 0
    assert (
        len(lfo.nonstream_links) == 1
    )  # there is still the key in the map, but no callbacks
    assert len(lfo.nonstream_links[lfo.repr()]) == 0
    assert len(receiver.links) == 0


def test__remove_keys_midi_midi(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main[0] = sender.modules.main[1]

    assert len(sender.links) == 1
    assert len(receiver.links) == 0

    receiver.modules.main[0] -= sender.modules.main[1]

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(receiver.links) == 0


def test__remove_keys_from_full_section_midi_midi(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main[0] = sender.modules.main[1]

    assert len(sender.links) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main[1]

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(receiver.links) == 0


def test__remove_keys_from_one_to_full_section_midi_midi(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main[:] = sender.modules.main[1]
    receiver.modules.main[:] = sender.modules.main[2]

    assert len(sender.links) == 2
    assert len(sender.links[("note", 1)]) == 128
    assert len(sender.links[("note", 2)]) == 128
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main[1]

    assert len(sender.links) == 2  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(sender.links[("note", 2)]) == 128
    assert len(receiver.links) == 0


def test__remove_keys_from_all_to_all_section_midi_midi(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main[:] = sender.modules.main[:]

    assert len(sender.links) == 128
    assert len(sender.links[("note", 0)]) == 1
    assert len(sender.links[("note", 1)]) == 1
    assert len(sender.links[("note", 2)]) == 1
    assert len(sender.links[("note", 126)]) == 1
    assert len(sender.links[("note", 127)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main[1]

    assert (
        len(sender.links) == 128
    )  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(sender.links[("note", 2)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main[:]

    assert (
        len(sender.links) == 128
    )  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(sender.links[("note", 2)]) == 0
    assert len(receiver.links) == 0


def test__remove_keys_from_all_to_all_section_midi_midi_direct(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink = sender.modules.main.keys

    assert len(sender.links) == 1
    assert len(sender.links[("note", -1)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main.keys

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", -1)]) == 0
    assert len(receiver.links) == 0


# # For the future?
# def test__mapping_all_to_single(sender, receiver):
#     _, receiver = receiver
#     _, sender = sender

#     assert len(sender.links) == 0
#     assert len(receiver.links) == 0

#     receiver.modules.main[6] = sender.modules.main.keys

#     assert len(sender.links) == 1
#     assert len(sender.links[("note", 6)]) == 1
#     assert len(receiver.links) == 0

#     receiver.modules.main -= sender.modules.main.keys

#     assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
#     assert len(sender.links[("note", 6)]) == 0
#     assert len(receiver.links) == 0


def test__mapping_single_to_all(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink = sender.modules.main[1]

    assert len(sender.links) == 1
    assert len(sender.links[("note", 1)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink -= sender.modules.main[1]

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(receiver.links) == 0


def test__mapping_single_to_all2(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink = sender.modules.main[1]

    assert len(sender.links) == 1
    assert len(sender.links[("note", 1)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main[1]

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(receiver.links) == 0


def test__mapping_virtual_to_all(receiver):
    _, receiver = receiver
    lfo = LFO()

    assert len(lfo.nonstream_links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink = lfo

    assert len(lfo.nonstream_links) == 1
    assert len(lfo.nonstream_links[lfo.output_cv.repr()]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= lfo

    assert (
        len(lfo.nonstream_links) == 1
    )  # there is still the key in the map, but no callbacks
    assert len(lfo.nonstream_links[lfo.output_cv.repr()]) == 0
    assert len(receiver.links) == 0


def test__mapping_cc_to_all(sender, receiver):
    _, receiver = receiver
    _, sender = sender

    assert len(sender.links) == 0
    assert len(receiver.links) == 0

    receiver.modules.main.keys_sink = sender.modules.main.button1

    assert len(sender.links) == 1
    assert len(sender.links[("control_change", 45)]) == 1
    assert len(receiver.links) == 0

    receiver.modules.main -= sender.modules.main.button1

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("control_change", 45)]) == 0
    assert len(receiver.links) == 0


def test__mapping_pad_to_virtual(sender):
    _, sender = sender
    lfo = LFO()

    assert len(sender.links) == 0
    assert len(lfo.nonstream_links) == 0
    assert len(lfo.stream_links) == 0

    lfo.speed_cv = sender.modules.main[1]

    assert len(sender.links) == 1
    assert len(sender.links[("note", 1)]) == 1
    assert len(lfo.nonstream_links) == 0
    assert len(lfo.stream_links) == 0

    lfo.speed_cv -= sender.modules.main[1]

    assert len(sender.links) == 1  # there is still the key in the map, but no callbacks
    assert len(sender.links[("note", 1)]) == 0
    assert len(lfo.nonstream_links) == 0
    assert len(lfo.stream_links) == 0
