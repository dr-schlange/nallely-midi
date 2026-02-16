import json
import time

import pytest
from websockets.sync.client import connect

from nallely import WebSocketBus

PORT = 6789


@pytest.fixture(scope="module")
def wsbus():
    ws = WebSocketBus()
    ws.start()
    yield ws
    ws.stop()


def test__websocketbus_register(wsbus):
    assert "mydev_input_cv" not in wsbus.__class__.__dict__
    assert "mydev" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    assert "mydev_input_cv" in wsbus.__class__.__dict__
    assert "mydev" in wsbus.known_services


def test__websocketbus_double_register(wsbus):
    assert "mydev3_input_cv" not in wsbus.__class__.__dict__
    assert "mydev3" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev3/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    assert "mydev3_input_cv" in wsbus.__class__.__dict__
    assert "mydev3" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev3/autoconfig")

    time.sleep(0.1)
    assert "mydev3_input_cv" in wsbus.__class__.__dict__
    assert "mydev3" in wsbus.known_services


def test__websocketbus_unregister(wsbus):
    assert "mydev2_input_cv" not in wsbus.__class__.__dict__
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


def test__websocketbus_add_parameter(wsbus):
    assert "mydev4_input_cv" not in wsbus.__class__.__dict__
    assert "mydev4" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev4/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 147)}]}))

    time.sleep(0.1)
    assert "mydev4_input_cv" in wsbus.__class__.__dict__
    assert "mydev4" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev4/autoconfig")
    client.send(
        json.dumps(
            {
                "type": "add_parameters",
                "parameters": [{"name": "input2", "range": (0, 147)}],
            }
        )
    )

    time.sleep(0.1)
    assert "mydev4_input_cv" in wsbus.__class__.__dict__
    assert "mydev4_input2_cv" in wsbus.__class__.__dict__
    assert "mydev4" in wsbus.known_services


def test__websocketbus_add_parameter_replace(wsbus):
    assert "mydev5_input_cv" not in wsbus.__class__.__dict__
    assert "mydev5" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev5/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 147)}]}))

    time.sleep(0.1)
    assert "mydev5_input_cv" in wsbus.__class__.__dict__
    assert wsbus.mydev5_input_cv.parameter.range == [0, 147]
    assert "mydev5" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev5/autoconfig")
    client.send(
        json.dumps(
            {
                "type": "add_parameters",
                "parameters": [{"name": "input", "range": (0, 1)}],
            }
        )
    )

    time.sleep(0.1)
    assert "mydev5_input_cv" in wsbus.__class__.__dict__
    assert wsbus.mydev5_input_cv.parameter.range == [0, 1]
    assert "mydev5" in wsbus.known_services


def test__websocketbus_add_parameter_unregister(wsbus):
    assert "mydev6_input_cv" not in wsbus.__class__.__dict__
    assert "mydev6" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev6/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    assert "mydev6_input_cv" in wsbus.__class__.__dict__
    assert "mydev6" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev6/autoconfig")
    client.send(
        json.dumps(
            {
                "type": "add_parameters",
                "parameters": [{"name": "input2", "range": (0, 127)}],
            }
        )
    )

    time.sleep(0.1)
    assert "mydev6_input_cv" in wsbus.__class__.__dict__
    assert "mydev6_input2_cv" in wsbus.__class__.__dict__
    assert "mydev6" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev6/unregister")

    time.sleep(0.1)
    assert "mydev6_input_cv" not in wsbus.__class__.__dict__
    assert "mydev6_input2_cv" not in wsbus.__class__.__dict__
    assert "mydev6" not in wsbus.known_services


def test__websocketbus_remove_parameter(wsbus):
    assert "mydev7_input_cv" not in wsbus.__class__.__dict__
    assert "mydev7" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev7/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    assert "mydev7_input_cv" in wsbus.__class__.__dict__
    assert "mydev7" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev7/autoconfig")
    client.send(
        json.dumps(
            {
                "type": "remove_parameters",
                "parameters": [{"name": "input"}],
            }
        )
    )

    time.sleep(0.1)
    assert "mydev7_input_cv" not in wsbus.__class__.__dict__
    assert "mydev7_input2_cv" not in wsbus.__class__.__dict__
    assert "mydev7" in wsbus.known_services


def test__websocketbus_remove_unexisting_parameter(wsbus):
    assert "mydev8_input_cv" not in wsbus.__class__.__dict__
    assert "mydev8" not in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev8/autoconfig")
    client.send(json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}))

    time.sleep(0.1)
    assert "mydev8_input_cv" in wsbus.__class__.__dict__
    assert "mydev8" in wsbus.known_services

    client = connect(f"ws://localhost:{PORT}/mydev8/autoconfig")
    client.send(
        json.dumps(
            {
                "type": "remove_parameters",
                "parameters": [{"name": "input2"}],
            }
        )
    )

    time.sleep(0.1)
    assert "mydev8_input_cv" in wsbus.__class__.__dict__
    assert "mydev8" in wsbus.known_services
