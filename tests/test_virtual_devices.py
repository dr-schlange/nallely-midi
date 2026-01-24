import time

import pytest

from nallely import LFO, WebSocketBus
from nallely.core.virtual_device import VirtualParameter
from nallely.core.world import ThreadContext


@pytest.mark.asyncio
async def test__websocketbus_attribute_access():
    ws = WebSocketBus(autoconnect=True)
    assert len(ws.links_registry) == 0
    ws.stop()

    ws = WebSocketBus(autoconnect=False)
    assert len(ws.links_registry) == 0
    ws.stop()


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
    l = LFO(waveform="square", speed=2)
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


def test__access_links_incoming_links_from_ports():
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
