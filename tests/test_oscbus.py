import json
import time
import pytest

from nallely.osc_bus import OSCBus
from pythonosc.udp_client import SimpleUDPClient


PORT = 6789


@pytest.fixture(scope="module")
def oscbus():
    bus = OSCBus()
    bus.start()
    yield bus
    bus.stop()


# @pytest.fixture(scope="module")
# def oscserver():
#     server =


def test__oscbus_register(oscbus):
    assert "mydev_input_cv" not in oscbus.__class__.__dict__
    assert "mydev" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )
    time.sleep(0.1)
    assert "mydev_input_cv" in oscbus.__class__.__dict__
    assert "mydev" in oscbus.known_services


def test__oscbus_double_register(oscbus):
    assert "mydev3_input_cv" not in oscbus.__class__.__dict__
    assert "mydev3" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev3/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )
    time.sleep(0.1)
    assert "mydev3_input_cv" in oscbus.__class__.__dict__
    assert "mydev3" in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev3/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )
    time.sleep(0.1)
    assert "mydev3_input_cv" in oscbus.__class__.__dict__
    assert "mydev3" in oscbus.known_services


def test__oscbus_unregister(oscbus):
    assert "mydev2_input_cv" not in oscbus.__class__.__dict__
    assert "mydev2" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev2/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev2_input_cv" in oscbus.__class__.__dict__
    assert "mydev2" in oscbus.known_services

    client.send_message("/mydev2/unregister", "")

    time.sleep(0.1)
    assert "mydev2_input_cv" not in oscbus.__class__.__dict__
    assert "mydev2" not in oscbus.known_services


def test__oscbus_add_parameter(oscbus):
    assert "mydev4_input_cv" not in oscbus.__class__.__dict__
    assert "mydev4" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev4/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev4_input_cv" in oscbus.__class__.__dict__
    assert "mydev4" in oscbus.known_services

    client.send_message(
        "/mydev4/autoconfig/add_parameters",
        json.dumps({"parameters": [{"name": "input2", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev4_input_cv" in oscbus.__class__.__dict__
    assert "mydev4_input2_cv" in oscbus.__class__.__dict__
    assert "mydev4" in oscbus.known_services


def test__oscbus_add_parameter_replace(oscbus):
    assert "mydev5_input_cv" not in oscbus.__class__.__dict__
    assert "mydev5" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev5/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 147)}]}),
    )

    time.sleep(0.1)
    assert "mydev5_input_cv" in oscbus.__class__.__dict__
    assert oscbus.mydev5_input_cv.parameter.range == [0, 147]
    assert "mydev5" in oscbus.known_services

    client.send_message(
        "/mydev5/autoconfig/add_parameters",
        json.dumps({"parameters": [{"name": "input", "range": (0, 1)}]}),
    )

    time.sleep(0.1)
    assert "mydev5_input_cv" in oscbus.__class__.__dict__
    assert oscbus.mydev5_input_cv.parameter.range == [0, 1]
    assert "mydev5" in oscbus.known_services


def test__oscbus_add_parameter_unregister(oscbus):
    assert "mydev6_input_cv" not in oscbus.__class__.__dict__
    assert "mydev6" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev6/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev6_input_cv" in oscbus.__class__.__dict__
    assert "mydev6" in oscbus.known_services

    client.send_message(
        "/mydev6/autoconfig/add_parameters",
        json.dumps({"parameters": [{"name": "input2", "range": (0, 147)}]}),
    )

    time.sleep(0.1)
    assert "mydev6_input_cv" in oscbus.__class__.__dict__
    assert "mydev6_input2_cv" in oscbus.__class__.__dict__
    assert "mydev6" in oscbus.known_services

    client.send_message("/mydev6/unregister", "")

    time.sleep(0.1)
    assert "mydev6_input_cv" not in oscbus.__class__.__dict__
    assert "mydev6_input2_cv" not in oscbus.__class__.__dict__
    assert "mydev6" not in oscbus.known_services


def test__oscbus_remove_parameter(oscbus):
    assert "mydev7_input_cv" not in oscbus.__class__.__dict__
    assert "mydev7" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev7/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev7_input_cv" in oscbus.__class__.__dict__
    assert "mydev7" in oscbus.known_services

    client.send_message(
        "/mydev7/autoconfig/remove_parameters",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev7_input_cv" not in oscbus.__class__.__dict__
    assert "mydev7_input2_cv" not in oscbus.__class__.__dict__
    assert "mydev7" in oscbus.known_services


def test__oscbus_remove_unexisting_parameter(oscbus):
    assert "mydev8_input_cv" not in oscbus.__class__.__dict__
    assert "mydev8" not in oscbus.known_services

    client = SimpleUDPClient(address="0.0.0.0", port=6787)
    client.send_message(
        "/mydev8/autoconfig",
        json.dumps({"parameters": [{"name": "input", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev8_input_cv" in oscbus.__class__.__dict__
    assert "mydev8" in oscbus.known_services

    client.send_message(
        "/mydev8/autoconfig/remove_parameters",
        json.dumps({"parameters": [{"name": "input2", "range": (0, 127)}]}),
    )

    time.sleep(0.1)
    assert "mydev8_input_cv" in oscbus.__class__.__dict__
    assert "mydev8" in oscbus.known_services
