import json
import queue
import threading
import time

import pytest
from websockets.sync.client import connect

from nallely import WebSocketBus, stop_all_connected_devices

PORT = 6789


@pytest.fixture(scope="module")
def wsbus():
    stop_all_connected_devices()
    ws = WebSocketBus()
    ws.start()
    yield ws
    ws.stop()


def test__websocketbus_attribute_access(wsbus):
    assert len(wsbus.links_registry) == 0


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


def test__websocketbus_slow_client_does_not_block_others(wsbus):
    release = threading.Event()

    class StuckClient:
        def send(self, item):
            release.wait()

    class FastClient:
        def __init__(self):
            self.received = []

        def send(self, item):
            self.received.append(item)

    stuck, fast = StuckClient(), FastClient()
    threads = []
    for client in (stuck, fast):
        q = queue.Queue(maxsize=256)
        wsbus.send_queues[client] = q
        t = threading.Thread(target=wsbus._sender_loop, args=(client, q), daemon=True)
        t.start()
        threads.append(t)

    time.sleep(0.05)  # let all clients enter start

    try:
        start = time.perf_counter()
        for i in range(10):
            wsbus._queue_send(stuck, f"frame-{i}".encode())
            wsbus._queue_send(fast, f"frame-{i}".encode())
        elapsed = time.perf_counter() - start

        assert elapsed < 0.5
        time.sleep(0.05)
        assert len(fast.received) == 10
    finally:
        release.set()
        wsbus.send_queues.pop(stuck, None)
        wsbus.send_queues.pop(fast, None)
