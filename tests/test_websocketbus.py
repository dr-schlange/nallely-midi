import json
import time
import pytest
from nallely import WebSocketBus
from websockets.sync.client import connect


PORT = 6789


@pytest.fixture(scope="module")
def wsbus():
    ws = WebSocketBus()
    ws.start()
    yield ws
    ws.stop()


def test__websocketbus_register(wsbus):
    assert "mydev_input" not in wsbus.__class__.__dict__
    assert "mydev" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)

    assert "mydev_input_cv" in wsbus.__class__.__dict__
    assert "mydev" in wsbus.known_services


def test__websocketbus_unregister(wsbus):
    assert "mydev2_input" not in wsbus.__class__.__dict__
    assert "mydev2" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev2/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)

    assert "mydev2_input_cv" in wsbus.__class__.__dict__
    assert "mydev2" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev2/unregister")

    time.sleep(0.1)

    assert "mydev2_input_cv" not in wsbus.__class__.__dict__
    assert "mydev2" not in wsbus.known_services


def test__websocketbus_add_parameter(wsbus): ...


def test__websocketbus_remove_parameter(wsbus): ...
