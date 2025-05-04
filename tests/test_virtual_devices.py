import asyncio
import json

import pytest
import websockets

import nallely
from nallely import WebSocketBus

# pytest_plugins = ('pytest_asyncio',)

# @pytest.mark.asyncio
# async def test_simple():
#     await asyncio.sleep(0.5)


@pytest.mark.asyncio
async def test__websocketbus_attribute_access():
    ws = WebSocketBus(autoconnect=True)
    assert len(ws.callbacks_registry) == 0
    ws.stop()

    ws = WebSocketBus(autoconnect=True)
    assert len(ws.callbacks_registry) == 0
    ws.stop()
