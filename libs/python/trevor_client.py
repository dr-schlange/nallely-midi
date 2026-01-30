"""
Nallely Trevor protocol client for Python.
LLM-generated — provides a simple API over the Trevor WebSocket protocol (port 6788).

Usage:

    from trevor_client import TrevorClient

    client = TrevorClient("192.168.1.74")
    client.connect()

    state = client.state
    lfo_id = client.create_device("LFO")
    client.set_virtual_value(lfo_id, "speed", 2.0)

    synth_id = client.create_device("Amsynth")
    client.wire(f"{lfo_id}::__virtual__::output_cv",
                f"{synth_id}::filter::cutoff")

    client.disconnect()
"""

import json

from websockets.sync.client import connect as ws_connect


class TrevorClient:
    """Synchronous client for the Nallely Trevor protocol."""

    def __init__(self, host="localhost", port=6788):
        self.url = f"ws://{host}:{port}/trevor"
        self.ws = None
        self.state = None

    def connect(self):
        """Connect and receive the initial session state."""
        self.ws = ws_connect(self.url)
        self.state = json.loads(self.ws.recv())
        return self.state

    def disconnect(self):
        """Close the connection."""
        if self.ws:
            self.ws.close()
            self.ws = None

    def _send(self, command, **params):
        """Send a command and return the updated state."""
        params["command"] = command
        self.ws.send(json.dumps(params))
        self.state = json.loads(self.ws.recv())
        return self.state

    # -- State --

    def full_state(self):
        """Request a full state snapshot."""
        return self._send("full_state")

    def reset_all(self):
        """Clear all devices and connections."""
        return self._send("reset_all")

    # -- Devices --

    def create_device(self, name):
        """Create a device by class name. Returns the new device ID."""
        state = self._send("create_device", name=name)
        # The new device is the last one added in either list
        for dev in reversed(state.get("virtual_devices", [])):
            if dev["meta"]["name"] == name:
                return dev["id"]
        for dev in reversed(state.get("midi_devices", [])):
            if dev["meta"]["class_name"] == name:
                return dev["id"]
        return None

    def kill_device(self, device_id):
        """Remove a device."""
        return self._send("kill_device", device_id=device_id)

    def pause_device(self, device_id):
        """Pause a device."""
        return self._send("pause_device", device_id=device_id)

    def resume_device(self, device_id, start=True):
        """Resume a paused device."""
        return self._send("resume_device", device_id=device_id, start=start)

    def random_preset(self, device_id):
        """Randomize a device's parameters."""
        return self._send("random_preset", device_id=device_id)

    def set_device_channel(self, device_id, channel):
        """Set the MIDI channel for a device."""
        return self._send("set_device_channel", device_id=device_id,
                          channel=channel)

    def force_note_off(self, device_id):
        """Kill all stuck notes on a device."""
        return self._send("force_note_off", device_id=device_id)

    # -- Parameters --

    def set_virtual_value(self, device_id, parameter, value):
        """Set a parameter on a virtual device. Uses plain name, not cv_name."""
        return self._send("set_virtual_value", device_id=device_id,
                          parameter=parameter, value=value)

    def set_parameter_value(self, device_id, section_name, parameter_name,
                            value):
        """Set a parameter on a MIDI device."""
        return self._send("set_parameter_value", device_id=device_id,
                          section_name=section_name,
                          parameter_name=parameter_name, value=value)

    def set_scaler_parameter(self, scaler_id, parameter, value):
        """Modify a scaler on an existing connection."""
        return self._send("set_scaler_parameter", scaler_id=scaler_id,
                          parameter=parameter, value=value)

    # -- Connections --

    def wire(self, from_parameter, to_parameter, with_scaler=True):
        """Connect two parameters. Uses cv_name in the parameter paths."""
        return self._send("associate_parameters",
                          from_parameter=from_parameter,
                          to_parameter=to_parameter,
                          unbind=False, with_scaler=with_scaler)

    def unwire(self, from_parameter, to_parameter):
        """Disconnect two parameters."""
        return self._send("associate_parameters",
                          from_parameter=from_parameter,
                          to_parameter=to_parameter,
                          unbind=True)

    def delete_all_connections(self):
        """Remove all connections."""
        return self._send("delete_all_connections")

    def unregister_service(self, service_name):
        """Unregister an external neuron from the WebSocket Bus by name."""
        return self._send("unregister_service", service_name=service_name)

    # -- IO capture --

    def start_capture_io(self, device_or_link=None):
        """Start capturing stdout/stderr/stdin to the WebSocket.

        If device_or_link is given, also enables debug mode on that
        device or link (prints internal processing details).
        """
        params = {}
        if device_or_link is not None:
            params["device_or_link"] = device_or_link
        return self._send("start_capture_io", **params)

    def stop_capture_io(self, device_or_link=None):
        """Stop capturing IO and restore normal stdout/stderr/stdin.

        If device_or_link is given, also disables debug mode on it.
        """
        params = {}
        if device_or_link is not None:
            params["device_or_link"] = device_or_link
        return self._send("stop_capture_io", **params)

    def send_stdin(self, thread_id, text):
        """Send text to stdin for a thread waiting on input()."""
        return self._send("send_stdin", thread_id=thread_id, text=text)

    # -- Code inspection --

    def get_class_code(self, device_id):
        """Fetch the full source code of a neuron class.

        Returns {"className": str, "classCode": str, "methods": {name: src}}.
        """
        self.ws.send(json.dumps({
            "command": "get_class_code", "device_id": device_id,
        }))
        resp = json.loads(self.ws.recv())
        return resp.get("arg", resp)

    # -- Lookups --

    def find_device(self, repr_name):
        """Find a device ID by its display name (repr). Returns ID or None."""
        for dev in self.state.get("virtual_devices", []):
            if dev["repr"] == repr_name:
                return dev["id"]
        for dev in self.state.get("midi_devices", []):
            if dev["repr"] == repr_name:
                return dev["id"]
        return None

    def find_websocketbus_id(self):
        """Find the WebSocketBus device ID."""
        for dev in self.state.get("virtual_devices", []):
            if "WebSocketBus" in str(dev.get("repr", "")):
                return dev["id"]
        return None

    @property
    def virtual_devices(self):
        """List of virtual devices from the last state."""
        return self.state.get("virtual_devices", [])

    @property
    def midi_devices(self):
        """List of MIDI devices from the last state."""
        return self.state.get("midi_devices", [])

    @property
    def connections(self):
        """List of connections from the last state."""
        return self.state.get("connections", [])

    @property
    def classes(self):
        """Available device classes from the last state."""
        return self.state.get("classes", [])

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, *exc):
        self.disconnect()
