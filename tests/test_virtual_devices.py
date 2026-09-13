import time

import pytest

from nallely import LFO
from nallely.core import VirtualDevice
from nallely.core.virtual_device import VirtualParameter
from nallely.core.world import ThreadContext
from nallely.devices import NTS1


@pytest.fixture
def FakeLFO():
    setattr(
        LFO,
        "FAKE_cv",
        VirtualParameter(cv_name="FAKE_cv", name="FAKE", stream=True, range=(0, 127)),
    )
    yield LFO
    delattr(LFO, "FAKE_cv")


def test__direct_set_pause():
    l = LFO(waveform="square", speed=1)
    l.start()

    assert l.running is True
    assert l.paused is False

    v = l.output
    assert v == 127

    l.set_pause = 1

    v = l.output
    assert v == 127
    assert l.running is True
    assert l.paused is True

    l.set_pause = 0

    time.sleep(1)

    v = l.output
    assert v == 0
    assert l.running is True
    assert l.paused is False


def test__indirect_set_pause():
    l = LFO(waveform="square", speed=2)
    l.start()

    assert l.running is True
    assert l.paused is False

    v = l.output
    assert v == 127

    l.receiving(1, on="set_pause", ctx=ThreadContext({}))

    v = l.output
    assert v == 127
    assert l.running is True
    assert l.paused is True

    l.receiving(0, on="set_pause", ctx=ThreadContext({}))

    time.sleep(1)

    v = l.output
    assert v == 0
    assert l.running is True
    assert l.paused is False


def test__access_links_outgoing_nonstream_from_ports():
    lfo1 = LFO()
    lfo2 = LFO()

    lfo1.speed_cv = lfo2.output_cv

    assert len(lfo2.output_cv.outgoing_nonstream_links) == 1
    assert len(lfo2.output_cv.outgoing_links) == 1

    link = lfo2.output_cv.outgoing_nonstream_links[0]
    assert link.src.device is lfo2
    assert link.src.parameter is lfo2.output_cv.parameter
    assert link.dest.device is lfo1
    assert link.dest.parameter is lfo1.speed_cv.parameter

    lfo1.speed_cv -= lfo2.output_cv

    assert len(lfo2.output_cv.outgoing_nonstream_links) == 0
    assert len(lfo2.output_cv.outgoing_links) == 0


def test__access_links_outgoing_stream_from_ports(FakeLFO):
    lfo1 = FakeLFO()
    lfo2 = FakeLFO()

    lfo1.FAKE_cv = lfo2.output_cv

    assert len(lfo2.output_cv.outgoing_stream_links) == 1
    assert len(lfo2.output_cv.outgoing_links) == 1

    link = lfo2.output_cv.outgoing_stream_links[0]
    assert link.src.device is lfo2
    assert link.src.parameter is lfo2.output_cv.parameter
    assert link.dest.device is lfo1
    assert link.dest.parameter is lfo1.FAKE_cv.parameter

    lfo1.FAKE_cv -= lfo2.output_cv

    assert len(lfo2.output_cv.outgoing_stream_links) == 0
    assert len(lfo2.output_cv.outgoing_links) == 0


def test__access_links_outgoing_from_device(FakeLFO):
    lfo1 = FakeLFO()
    lfo2 = FakeLFO()

    lfo1.FAKE_cv = lfo2.output_cv

    assert len(lfo2.outgoing_links) == 1

    link = lfo2.outgoing_links[0]
    assert link.src.device is lfo2
    assert link.src.parameter is lfo2.output_cv.parameter
    assert link.dest.device is lfo1
    assert link.dest.parameter is lfo1.FAKE_cv.parameter

    lfo1.FAKE_cv -= lfo2.output_cv

    assert len(lfo2.outgoing_links) == 0


def test__access_links_incoming_from_ports():
    lfo1 = LFO()
    lfo2 = LFO()

    lfo1.speed_cv = lfo2.output_cv

    assert len(lfo1.speed_cv.incoming_links) == 1

    link = lfo1.speed_cv.incoming_links[0]
    assert link.src.device is lfo2
    assert link.src.parameter is lfo2.output_cv.parameter
    assert link.dest.device is lfo1
    assert link.dest.parameter is lfo1.speed_cv.parameter

    lfo1.speed_cv -= lfo2.output_cv

    assert len(lfo1.speed_cv.incoming_links) == 0


def test__access_links_incoming_from_device():
    lfo1 = LFO()
    lfo2 = LFO()

    lfo1.speed_cv = lfo2.output_cv

    assert len(lfo1.incoming_links) == 1

    link = lfo1.incoming_links[0]
    assert link.src.device is lfo2
    assert link.src.parameter is lfo2.output_cv.parameter
    assert link.dest.device is lfo1
    assert link.dest.parameter is lfo1.speed_cv.parameter

    lfo1.speed_cv -= lfo2.output_cv

    assert len(lfo1.incoming_links) == 0


def test__introspection_allparameters_nonstandardoutput():
    class A(VirtualDevice):
        input_cv = VirtualParameter(
            name="input", range=(-1, 1), conversion_policy="round", default=0
        )
        output_cv = VirtualParameter(name="output", range=(-5, 5))

    parameters = A.all_parameters()

    assert len(parameters) == 3  # we have the input/output and the set_pause

    a, b, c = parameters
    assert a.name == "output"
    assert b.name == "set_pause"
    assert c.name == "input"

    assert a.range == (-5, 5)
    assert b.range == (0, 1)
    assert c.range == (-1, 1)

    assert c.conversion_policy == "round"
    assert a.conversion_policy is None
    assert b.conversion_policy == "round"


def test__introspection_meta_new_syntaxe():
    @VirtualDevice
    class A: ...


def test__clone_simple_lfo():
    lfo1 = LFO(waveform="triangle")
    new = lfo1.clone()

    assert new.running is True
    assert new.paused is False
    assert new.waveform == "triangle"
    assert new.waveform == lfo1.waveform
    assert new.speed == lfo1.speed

    lfo2 = LFO(waveform="triangle")
    lfo2.start()
    new = lfo2.clone(start_clone=False)

    assert new.running is True
    assert new.paused is True
    assert new.waveform == "triangle"
    assert new.waveform == lfo2.waveform
    assert new.speed == lfo2.speed

    new = lfo2.clone(pause_device=True)

    assert lfo2.paused is True
    assert new.paused is False

    assert lfo2.is_alive() is True
    new = lfo2.clone(suicide=True)
    assert lfo2.is_alive() is False


def test__clone_lfo1_lfo2_connection():
    lfo1 = LFO(waveform="triangle")
    lfo2 = LFO(waveform="sine")
    lfo2.speed_cv = lfo1
    lfo1.speed_cv = lfo2

    new = lfo1.clone()
    assert len(new.speed_cv.incoming_links) == 1
    links = new.speed_cv.incoming_links
    assert links[0].src.parameter == lfo2.output_cv.parameter

    assert len(new.output_cv.outgoing_links) == 1
    links = new.outgoing_links
    assert links[0].dest.parameter == lfo1.speed_cv.parameter


def test__clone_lfo1_midi_connection():
    lfo = LFO(waveform="triangle")
    nts1 = NTS1(autoconnect=False)

    lfo.speed_cv = nts1.keys.notes.scale()
    nts1.filter.cutoff = lfo.output_cv.scale()

    new = lfo.clone()
    assert len(new.speed_cv.incoming_links) == 1
    links = new.speed_cv.incoming_links
    assert links[0].src.parameter == nts1.keys.notes.parameter

    assert len(lfo.speed_cv.incoming_links) == 1
    assert lfo.speed_cv.incoming_links[0].chain.to_min == 0
    assert lfo.speed_cv.incoming_links[0].chain.to_max == 10

    assert links[0].chain is not None
    assert links[0].chain.to_min == lfo.speed_cv.incoming_links[0].chain.to_min
    assert links[0].chain.to_max == lfo.speed_cv.incoming_links[0].chain.to_max

    assert len(new.output_cv.outgoing_links) == 1
    links = new.output_cv.outgoing_links
    assert links[0].dest.parameter == nts1.filter.cutoff.parameter

    assert len(new.output_cv.outgoing_links) == 1
    assert new.output_cv.outgoing_links[0].chain.to_min == 0
    assert new.output_cv.outgoing_links[0].chain.to_max == 127

    assert links[0].chain is not None
    assert links[0].chain.to_min == new.output_cv.outgoing_links[0].chain.to_min
    assert links[0].chain.to_max == new.output_cv.outgoing_links[0].chain.to_max


def test__disconnect_links():
    lfo = LFO(waveform="triangle")
    nts1 = NTS1(autoconnect=False)

    lfo.speed_cv = nts1.keys.notes.scale()
    nts1.filter.cutoff = lfo.output_cv.scale()

    assert len(lfo.speed_cv.incoming_links) == 1
    assert len(nts1.keys.notes.outgoing_links) == 1
    lfo.speed_cv.disconnect_outgoing_links()
    assert len(lfo.speed_cv.incoming_links) == 1
    assert len(nts1.keys.notes.outgoing_links) == 1

    lfo.speed_cv.disconnect_incoming_links()
    assert len(lfo.speed_cv.incoming_links) == 0
    assert len(nts1.keys.notes.outgoing_links) == 0

    assert len(nts1.filter.cutoff.incoming_links) == 1
    assert len(lfo.output_cv.outgoing_links) == 1
    lfo.output_cv.disconnect_incoming_links()
    assert len(nts1.filter.cutoff.incoming_links) == 1
    assert len(lfo.output_cv.outgoing_links) == 1

    lfo.output_cv.disconnect_outgoing_links()
    assert len(nts1.filter.cutoff.incoming_links) == 0
    assert len(lfo.output_cv.outgoing_links) == 0
