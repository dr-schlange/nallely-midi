import json
import time

import pytest
from websockets.sync.client import connect

from nallely import LFO, WebSocketBus, stop_all_connected_devices
from nallely.core import get_connected_devices, get_virtual_devices
from nallely.session import Session

PORT = 6789


@pytest.fixture(scope="module")
def wsbus():
    stop_all_connected_devices()
    ws = WebSocketBus()
    ws.start()
    yield ws
    ws.stop()


@pytest.fixture(scope="module")
def session():
    session = Session()
    yield session


def test__session_snapshot_with_proxy(wsbus, session):
    client = connect(f"ws://localhost:{PORT}/mydev/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    full_snapshot = session.snapshot(spread_registered_services=True)

    assert len(full_snapshot["virtual_devices"]) == 2

    dev = full_snapshot["virtual_devices"][1]
    assert dev["proxy"] is True
    assert dev["meta"]["name"] == "mydev"
    assert dev["repr"] == "mydev"


def test__session_snapshot_without_proxy(wsbus, session):
    client = connect(f"ws://localhost:{PORT}/mydev/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    snapshot = session.snapshot(spread_registered_services=False)

    assert len(snapshot["virtual_devices"]) == 1
    dev = snapshot["virtual_devices"][0]

    assert dev.get("proxy", False) is False
    assert dev["meta"]["name"] == WebSocketBus.__name__


def test__session_create_hw_integration_stop_all_flushed(wsbus, session):
    wsbus.stop()
    from nallely.experimental.hardware_integration import LISA

    lisa = LISA()
    lisa.start()

    vdevs = get_virtual_devices()
    midis = get_connected_devices()
    assert len(vdevs) == 5
    assert len(midis) == 2
    assert isinstance(lisa.lfo1, LFO)

    lisa.stop()
    vdevs = get_virtual_devices()
    midis = get_connected_devices()
    assert len(vdevs) == 0
    assert len(midis) == 0
    assert lisa.lfo1 is None
