import pytest

from nallely import WebSocketBus


@pytest.mark.asyncio
async def test__websocketbus_attribute_access():
    ws = WebSocketBus(autoconnect=True)
    assert len(ws.links_registry) == 0
    ws.stop()

    ws = WebSocketBus(autoconnect=False)
    assert len(ws.links_registry) == 0
    ws.stop()
