"""
Nallely WebSocket Bus connector for Python.
LLM-generated — mirrors the behavior of libs/js/nallely-websocket.js.

Threaded connector for registering as an external neuron in a Nallely session.

Usage:

    from nallely_connector import NallelyWebsocketBus

    bus = NallelyWebsocketBus(address="192.168.1.74:6789")
    # if address is None, defaults on localhost:6789

    params = {
        "note": {"min": 0, "max": 127},
        "other_port": {"min": 0, "max": 127},
    }
    config = {"note": 0, "other_port": 0}

    service = bus.register("external", "my_neuron", params, config)
    service.onmessage = lambda msg: print(f"{msg['on']} = {msg['value']}")

    # Connection is already running at this point.
    service.send("note", 60)
    time.sleep(1)
    service.send("note", 0)

    service.send("other_port", 55.1234)

    service.dispose()
"""

import json
import struct
import threading
import time

from websockets.sync.client import connect as ws_connect


class NallelyService:
    """A single external neuron connection to the Nallely WebSocket Bus."""

    def __init__(self, kind, name, parameters, config, address=None, log=print):
        self.kind = kind
        self.name = name
        self.parameters = parameters
        self.config = config
        self.log = log

        if address:
            self.url = f"ws://{address}/{name}/autoconfig"
        else:
            self.url = f"ws://localhost:6789/{name}/autoconfig"

        self.ws = None
        self._running = False
        self._thread = None

        # Callbacks
        self.onopen = None
        self.onclose = None
        self.onerror = None
        self.onmessage = None
        self.onsend = None

    def _start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while self._running:
            try:
                with ws_connect(self.url) as ws:
                    self.ws = ws

                    registration = [
                        {"name": name, "range": [conf["min"], conf["max"]]}
                        for name, conf in self.parameters.items()
                    ]
                    ws.send(json.dumps({
                        "kind": self.kind,
                        "parameters": registration,
                    }))

                    if self.onopen:
                        self.onopen(registration)

                    for message in ws:
                        if isinstance(message, bytes):
                            parsed = self._parse_frame(message)
                        elif isinstance(message, str):
                            parsed = json.loads(message)
                        else:
                            continue

                        self.config[parsed["on"]] = parsed["value"]

                        if self.onmessage:
                            self.onmessage(parsed)

            except Exception as e:
                if self.onerror:
                    self.onerror(e)
                else:
                    self.log(f"Connection error: {e}")

            self.ws = None

            if self.onclose:
                self.onclose()

            if self._running:
                self.log("Reconnecting in 1 second...")
                time.sleep(1)

    def send(self, parameter, value):
        """Send a parameter value as a binary frame."""
        if self.ws:
            frame = self._build_frame(parameter, value)
            if self.onsend:
                self.onsend({"on": parameter, "value": value})
            self.ws.send(frame)
        else:
            self.log(f"WebSocket not open, cannot send: {parameter} {value}")

    def dispose(self):
        """Stop the connection loop and close the socket."""
        self._running = False
        if self.ws:
            self.ws.close()
            self.ws = None

    @staticmethod
    def _build_frame(name, value):
        name_bytes = name.encode("utf-8")
        return struct.pack("!B", len(name_bytes)) + name_bytes + struct.pack("!d", value)

    @staticmethod
    def _parse_frame(data):
        ln = data[0]
        name = data[1:1 + ln].decode("utf-8")
        value = struct.unpack_from("!d", data, 1 + ln)[0]
        return {"on": name, "value": value}


class NallelyWebsocketBus:
    """Registry of NallelyService instances."""

    def __init__(self, address=None):
        self.registered = {}
        self.address = address

    @staticmethod
    def _build_uuid(kind, name):
        return f"{kind}::{name}"

    def register(self, kind, name, parameters, config, log=print):
        """Create, register, and start a NallelyService."""
        service = NallelyService(kind, name, parameters, config, self.address, log=log)
        self.registered[self._build_uuid(kind, name)] = service
        service._start()
        return service

    def send(self, kind, name, parameter, value):
        """Send a value through a previously registered service."""
        key = self._build_uuid(kind, name)
        self.registered[key].send(parameter, value)
