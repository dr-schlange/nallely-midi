# Nallely C Connector

*LLM-generated*

C library for registering external neurons on the Nallely WebSocket Bus. Handles connection, registration, binary frame encoding/decoding, auto-reconnect, and thread-safe sending from any thread. Mirrors the API of the [JavaScript](../js/) and [Python](../python/) connectors.

## Requirements

- [libwebsockets](https://libwebsockets.org/) (>= 4.x)
- pthreads

On Arch Linux: `pacman -S libwebsockets`. On Debian/Ubuntu: `apt install libwebsockets-dev`.

## Build

```bash
make            # static + shared + examples
make static     # libnallely.a only
make shared     # libnallely.so only
make examples   # echo and example binaries
```

## Quick Start

```c
#include "nallely-websocket.h"

void on_message(const nly_message_t *msg, void *ud) {
    printf("%s = %g\n", msg->name, msg->value);
}

int main(void) {
    nly_param_t params[] = {
        { "note", 0, 127 },
        { "gate", 0, 1   },
    };

    nly_service_t *svc = nly_service_create("mysynth", NULL, params, 2);
    nly_service_on_message(svc, on_message, NULL);
    nly_service_start(svc);

    /* send from any thread */
    nly_service_send(svc, "note", 60);

    /* ... */

    nly_service_dispose(svc);
}
```

Compile against the static library:

```bash
cc -o mysynth mysynth.c -L/path/to/libs/C -lnallely -lwebsockets -lpthread
```

Or against the shared library:

```bash
cc -o mysynth mysynth.c -L/path/to/libs/C -lnallely -lwebsockets -lpthread
LD_LIBRARY_PATH=/path/to/libs/C ./mysynth
```

## Neuron Naming

Neuron names **must not contain underscores**. The WebSocket Bus internally builds parameter names as `{neuron}_{param}` and splits on `_` to recover the neuron name, taking only the first segment. A name like `my_synth` would break routing. Use `mysynth` instead.

## API

### Types

```c
/* Parameter definition (for registration) */
typedef struct nly_param {
    const char *name;   /* plain name, e.g. "note" */
    double      min;    /* range minimum            */
    double      max;    /* range maximum            */
} nly_param_t;

/* Incoming message (from the bus) */
typedef struct nly_message {
    char   name[256];
    double value;
} nly_message_t;
```

### Callbacks

All callbacks receive a `void *userdata` pointer set when registering the callback.

```c
typedef void (*nly_open_cb)(void *userdata);
typedef void (*nly_close_cb)(void *userdata);
typedef void (*nly_error_cb)(const char *msg, void *userdata);
typedef void (*nly_message_cb)(const nly_message_t *msg, void *userdata);
```

### Lifecycle

| Function | Description |
|----------|-------------|
| `nly_service_create(name, address, params, count)` | Create a service. `address` is `"host:port"` or `NULL` for `localhost:6789`. Returns `NULL` on failure. |
| `nly_service_on_open(svc, cb, ud)` | Set callback for successful registration. |
| `nly_service_on_close(svc, cb, ud)` | Set callback for connection close. |
| `nly_service_on_error(svc, cb, ud)` | Set callback for errors. |
| `nly_service_on_message(svc, cb, ud)` | Set callback for incoming values. |
| `nly_service_start(svc)` | Start background thread. Connects, registers, auto-reconnects. Returns `0`/`-1`. |
| `nly_service_send(svc, param, value)` | Thread-safe send. Returns `0`/`-1`. |
| `nly_service_dispose(svc)` | Stop, join thread, free everything. Pointer is invalid after this. |

### Binary Frame Helpers

Exposed for advanced use (e.g. building your own transport).

```c
/* Encode into buf. Returns bytes written or -1. Required size: 1 + strlen(name) + 8. */
int nly_frame_encode(uint8_t *buf, size_t bufsz, const char *name, double value);

/* Decode a frame. Returns 0 on success, -1 on malformed data. */
int nly_frame_decode(const uint8_t *data, size_t len, nly_message_t *out);
```

Frame layout: `[1 byte: name_length][N bytes: UTF-8 name][8 bytes: float64 big-endian]`.

## Example: Echo Neuron

`examples/echo.c` registers as `"cecho"` with `input` and `output` parameters. Every value received on `input` is sent back on `output`. The `userdata` pointer passes the service handle into the message callback so it can call `nly_service_send`:

```c
void on_message(const nly_message_t *msg, void *ud) {
    nly_service_t *svc = (nly_service_t *)ud;
    if (strcmp(msg->name, "input") == 0)
        nly_service_send(svc, "output", msg->value);
}

/* ... */
nly_service_on_message(svc, on_message, svc);  /* svc as userdata */
```

Run it:

```bash
make examples
./examples/echo                    # connects to localhost:6789
./examples/echo 192.168.1.74:6789  # or a remote host
```

## Notes

- **`cv_name` vs `name`**: use plain names (e.g. `"note"`) when sending/receiving through the connector. The internal `cv_name` (e.g. `mysynth_note_cv`) is only used for wiring via the Trevor protocol.
- **Auto-reconnect**: on disconnect, the service waits 1 second and reconnects. Existing wiring in the session is preserved.
- **Thread safety**: `nly_service_send` can be called from any thread. The message is queued and sent on the next event loop iteration.
