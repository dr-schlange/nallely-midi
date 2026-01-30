# Nallely Python Connector

*LLM-generated*

Threaded WebSocket Bus connector for registering as an external neuron in a running Nallely session. Connection, registration, auto-reconnect, and message receive all happen in a background thread. Sending values and setting callbacks is done from the main thread.

## Requirements

```
pip install websockets
```

## Quick Start

```python
import time
from nallely_connector import NallelyWebsocketBus

bus = NallelyWebsocketBus()

params = {
    "note": {"min": 0, "max": 127},
}
config = {"note": 0}

service = bus.register("external", "my_neuron", params, config,
                       address="192.168.1.74:6789")

# Already connected and running.
time.sleep(1)  # let registration complete
service.send("note", 60)
time.sleep(0.5)
service.send("note", 0)

service.dispose()
```

## API

### `NallelyWebsocketBus`

Registry of services. Entry point.

- `register(kind, name, parameters, config, address=None, log=print)` — creates a `NallelyService`, starts the connection thread, and returns it. `parameters` is a dict of `{"param_name": {"min": lo, "max": hi}}`. `config` is a dict that tracks the latest received value for each parameter. `log` is a callable used for all output (default `print`).
- `send(kind, name, parameter, value)` — shorthand to send through a registered service.

### `NallelyService`

A single external neuron connection.

- `send(parameter, value)` — send a parameter value as a binary frame (uses plain `name`, not `cv_name`).
- `dispose()` — stop the connection loop and close the socket.

#### Callbacks

Set these on the service instance after `register()`:

- `onopen(registration)` — called after successful connection and registration.
- `onclose()` — called when the connection drops (before auto-reconnect).
- `onerror(exception)` — called on connection error. If not set, errors go to `log`.
- `onmessage(msg)` — called for each incoming value. `msg` is `{"on": param_name, "value": float}`.
- `onsend(msg)` — called on each outgoing send. Same format.

## Example: Claude Neuron (4 voices + 8 probes)

A typical Claude external neuron that registers 4 polyphonic voice outputs for playing notes through a synth, and 8 probe inputs for observing values from the Nallely graph.

```python
import time
from nallely_connector import NallelyWebsocketBus

HOST = "192.168.1.74:6789"

bus = NallelyWebsocketBus(address=HOST)

parameters = {
    # 4 voices for polyphonic note output (MIDI note numbers)
    "voice1": {"min": 0, "max": 127},
    "voice2": {"min": 0, "max": 127},
    "voice3": {"min": 0, "max": 127},
    "voice4": {"min": 0, "max": 127},
    # 8 probe points for receiving values from the graph
    "mon1": {"min": 0, "max": 127},
    "mon2": {"min": 0, "max": 127},
    "mon3": {"min": 0, "max": 127},
    "mon4": {"min": 0, "max": 127},
    "mon5": {"min": 0, "max": 127},
    "mon6": {"min": 0, "max": 127},
    "mon7": {"min": 0, "max": 127},
    "mon8": {"min": 0, "max": 127},
}

config = {k: 0 for k in parameters}

service = bus.register("external", "claude", parameters, config)


def on_message(msg):
    # Incoming values on probe points (mon1-mon8) wired from the graph
    print(f"  probe {msg['on']} = {msg['value']:.2f}")


service.onmessage = on_message
service.onopen = lambda _: print("Claude neuron registered.")

# Wait for registration to complete
time.sleep(2)

# --- Playing notes ---
# Voices map to MIDI note numbers. Send 0 for note-off.
# To retrigger the same note, insert a brief 0 gap.

# Play a single note
service.send("voice1", 60)   # C4
time.sleep(0.5)
service.send("voice1", 0)    # note-off
time.sleep(0.05)

# Play a chord (C major)
service.send("voice1", 60)   # C4
service.send("voice2", 64)   # E4
service.send("voice3", 67)   # G4
time.sleep(0.8)

# All notes off
for v in ["voice1", "voice2", "voice3", "voice4"]:
    service.send(v, 0)
time.sleep(0.05)

# --- Wiring ---
# After registration, the neuron appears on the WebSocketBus device.
# Wire via Trevor protocol (port 6788) using cv_name for patching:
#
#   Voice outputs (topology/patching):
#     WEBSOCKETBUS_ID::__virtual__::claude_voice1_cv  -> SYNTH_ID::keys::all_keys_or_pads
#     WEBSOCKETBUS_ID::__virtual__::claude_voice2_cv  -> SYNTH_ID::keys::all_keys_or_pads
#     WEBSOCKETBUS_ID::__virtual__::claude_voice3_cv  -> SYNTH_ID::keys::all_keys_or_pads
#     WEBSOCKETBUS_ID::__virtual__::claude_voice4_cv  -> SYNTH_ID::keys::all_keys_or_pads
#
#   Probe inputs (wire any neuron output to these to observe values):
#     LFO_ID::__virtual__::output_cv  -> WEBSOCKETBUS_ID::__virtual__::claude_mon1_cv
#     SEQ_ID::__virtual__::output_cv  -> WEBSOCKETBUS_ID::__virtual__::claude_mon2_cv
#
# The config dict is updated in real-time with incoming probe values:
print(f"Current probe values: {config}")

service.dispose()
```

### Notes

- **`cv_name` vs `name`**: `cv_name` (e.g. `claude_voice1_cv`) is used for patching / topology modification via the Trevor protocol. Plain `name` (e.g. `voice1`) is used when sending values through the connector.
- **Note sustain**: Notes are held until you send `0`. To retrigger the same note, send `0` first and wait ~50ms.
- **Auto-reconnect**: If the Nallely session restarts, the connector automatically reconnects and re-registers after 1 second.
- **Probes are passive**: The `mon1`-`mon8` parameters only receive values when something is wired to them via the Trevor protocol.
