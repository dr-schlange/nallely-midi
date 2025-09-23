import time

import pytest

from nallely import LFO, WebSocketBus
from nallely.core.world import ThreadContext


@pytest.mark.asyncio
async def test__websocketbus_attribute_access():
    ws = WebSocketBus(autoconnect=True)
    assert len(ws.links_registry) == 0
    ws.stop()

    ws = WebSocketBus(autoconnect=False)
    assert len(ws.links_registry) == 0
    ws.stop()


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
