# Porting the Nallely External Neuron Connector to Another Language

*LLM-generated.*

This document describes what to implement, in what order, to build an external neuron connector for Nallely in any language. The connector lets a program register as a neuron in a running Nallely session, send and receive values, and participate in the reactive graph like any native neuron.

The only requirement is a WebSocket client library in the target language.

## Prerequisites

Understand the two protocols:
- **WebSocket Bus** (port 6789) — register as an external neuron, send/receive signal values as binary frames
- **Trevor protocol** (port 6788) — session control: create devices, wire connections, set parameters (optional for the connector itself, but needed to wire the external neuron into the graph)

Reference implementations:
- JavaScript: `libs/js/nallely-websocket.js`
- Python: `libs/python/nallely_connector.py` (WebSocket Bus) and `libs/python/trevor_client.py` (Trevor)

## Step 1: Binary frame codec

Implement encode and decode for the binary frame format. This is the core data unit on the bus.

**Frame layout:**
```
[1 byte: name_length (uint8)]
[N bytes: parameter_name (UTF-8)]
[8 bytes: value (float64, big-endian / network byte order)]
```

Total size: `1 + name_length + 8` bytes.

**Encode** (for sending):
1. UTF-8 encode the parameter name
2. Write 1 byte with the name length
3. Write the name bytes
4. Write the value as a big-endian 64-bit float (IEEE 754 double)

**Decode** (for receiving):
1. Read byte 0 as the name length
2. Read bytes 1 through 1+length as UTF-8 string — this is the parameter name
3. Read 8 bytes starting at offset 1+length as a big-endian float64 — this is the value

Use the plain parameter name (e.g. `"note"`), not the internal cv_name (e.g. `"claude_note_cv"`).

## Step 2: Registration

Connect via WebSocket to `ws://HOST:6789/NEURON_NAME/autoconfig` and send a single JSON text message declaring the neuron's parameters.

**Naming constraint**: The neuron name **must not contain underscores**. Internally, the WebSocket Bus builds parameter names as `{neuron}_{param}` and the `receiving()` method splits on `_` to recover the neuron name — taking only the first segment. A name like `my_synth` with parameter `note` produces `my_synth_note`; the bus then splits it as neuron=`my`, parameter=`synth_note`, which is wrong. Use `mysynth` instead.

```json
{
  "kind": "external",
  "parameters": [
    {"name": "output1", "range": [0, 127]},
    {"name": "input1", "range": [0, 127]}
  ]
}
```

Each parameter has:
- `name` (required) — plain name, no suffix
- `range` (optional) — `[min, max]` array, defaults to `[null, null]`

After sending this message, the neuron is registered on the Nallely session. It appears as a proxy device on the WebSocketBus with parameters named `{neuron}_{param}_cv` internally.

Only declare `name` and `range`. Do not include `consumer`, `stream`, or other internal fields.

## Step 3: Sending values

After registration, send binary frames on the same WebSocket connection to push values into the graph:

```
encode("output1", 60.0)  →  send as binary message
```

The bus picks up the value, sets the internal parameter, and propagates it through all outgoing connections.

## Step 4: Receiving values

When other neurons in the graph are wired to the external neuron's parameters, incoming values arrive as binary frames on the same connection:

```
receive binary message  →  decode  →  ("input1", 42.5)
```

Values can also arrive as JSON text messages in the format `{"on": "param_name", "value": float}`. The connector should handle both.

## Step 5: Auto-reconnect

The Nallely session preserves service registrations and wiring after a client disconnect. When the client reconnects to the same `/autoconfig` endpoint, the registration JSON is consumed but ignored — the existing parameters and connections are reused.

Implement a reconnect loop:
1. On connection close or error, wait ~1 second
2. Reconnect to the same URL
3. Send the registration JSON again (it will be consumed but skipped)
4. Resume the receive loop

This makes the connector resilient to network interruptions and session restarts.

## Step 6: Cleanup

To disconnect cleanly:
1. Close the WebSocket connection

To fully unregister the neuron (remove parameters and wiring):
1. Close the WebSocket connection
2. Use the Trevor protocol to call `unregister_service` with the service name, OR connect to `ws://HOST:6789/NEURON_NAME/unregister`

## Step 7 (optional): Service registry

If the connector will manage multiple external neurons from the same program, add a registry layer that:
- Tracks registered services by `kind::name`
- Provides a `register()` factory that creates a service and starts its connection
- Delegates `send()` calls to the right service

This mirrors `NallelyWebsocketBus` in the Python and JS implementations.

## Step 8 (optional): Trevor protocol client

For full session control (creating devices, wiring, setting parameters), implement a client for the Trevor protocol:

1. Connect to `ws://HOST:6788/trevor`
2. First `recv()` returns the full session state as JSON
3. Send commands as flat JSON: `{"command": "command_name", "param": "value", ...}`
4. Every command returns an updated session state — always `recv()` after each `send()`

This is a separate concern from the bus connector but needed to wire the external neuron into the graph programmatically.

## Summary of implementation order

| Step | What | Required |
|------|------|----------|
| 1 | Binary frame encode/decode | Yes |
| 2 | Registration (connect + JSON) | Yes |
| 3 | Sending values (binary frames) | Yes |
| 4 | Receiving values (binary + JSON) | Yes |
| 5 | Auto-reconnect loop | Recommended |
| 6 | Cleanup / unregister | Recommended |
| 7 | Service registry (multi-neuron) | Optional |
| 8 | Trevor protocol client | Optional |

Steps 1-4 give you a working external neuron. Step 5 makes it production-ready. Steps 7-8 add convenience.

## Testing

1. Register with a simple parameter (e.g. `"test"` with range `[0, 127]`)
2. Connect to Trevor (port 6788), call `full_state`, verify the proxy device appears
3. Send a binary frame with a known value
4. Wire the parameter to another neuron via Trevor and verify the value propagates
5. Disconnect and reconnect — verify wiring is preserved
6. Unregister and verify the proxy device disappears from the state
