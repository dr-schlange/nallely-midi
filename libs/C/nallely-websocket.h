/*
 * nallely-websocket.h — Nallely External Neuron Connector for C
 *
 * Registers a C program as an external neuron on the Nallely WebSocket Bus.
 * Mirrors the API of libs/js/nallely-websocket.js and
 * libs/python/nallely_connector.py.
 *
 * Requires: libwebsockets, pthreads
 *
 *   *LLM generated*
 */

#ifndef NALLELY_WEBSOCKET_H
#define NALLELY_WEBSOCKET_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Parameter definition ───────────────────────────────────────────── */

typedef struct nly_param {
    const char *name;       /* plain name, e.g. "note" */
    double      min;        /* range minimum            */
    double      max;        /* range maximum            */
} nly_param_t;

/* ── Incoming message ───────────────────────────────────────────────── */

typedef struct nly_message {
    char   name[256];
    double value;
} nly_message_t;

/* ── Callbacks ──────────────────────────────────────────────────────── */

typedef void (*nly_open_cb)(void *userdata);
typedef void (*nly_close_cb)(void *userdata);
typedef void (*nly_error_cb)(const char *msg, void *userdata);
typedef void (*nly_message_cb)(const nly_message_t *msg, void *userdata);

/* ── Service (opaque) ───────────────────────────────────────────────── */

typedef struct nly_service nly_service_t;

/*
 * Create a service that will connect to the Nallely WebSocket Bus.
 *
 *   name       – neuron name (used in the URL path)
 *   address    – "host:port" or NULL for "localhost:6789"
 *   params     – array of parameter definitions
 *   param_count – number of elements in params
 *
 * Returns NULL on allocation failure.  The connection is NOT started yet;
 * call nly_service_start() after setting callbacks.
 */
nly_service_t *nly_service_create(const char        *name,
                                  const char        *address,
                                  const nly_param_t *params,
                                  int                param_count);

/* ── Callbacks ──────────────────────────────────────────────────────── */

void nly_service_on_open(nly_service_t *svc, nly_open_cb cb, void *ud);
void nly_service_on_close(nly_service_t *svc, nly_close_cb cb, void *ud);
void nly_service_on_error(nly_service_t *svc, nly_error_cb cb, void *ud);
void nly_service_on_message(nly_service_t *svc, nly_message_cb cb, void *ud);

/*
 * Start the connection loop in a background thread.
 * Automatically registers, receives values, and reconnects on failure.
 * Returns 0 on success, -1 on error.
 */
int nly_service_start(nly_service_t *svc);

/*
 * Send a parameter value as a binary frame.
 * Thread-safe — can be called from any thread.
 * Returns 0 on success, -1 if the connection is not open.
 */
int nly_service_send(nly_service_t *svc, const char *parameter, double value);

/*
 * Stop the connection loop, close the socket, and free all resources.
 * After this call the pointer is invalid.
 */
void nly_service_dispose(nly_service_t *svc);

/* ── Binary frame helpers (public for advanced use) ─────────────────── */

/*
 * Build a binary frame into buf.  Returns the number of bytes written,
 * or -1 if the buffer is too small.  Required size: 1 + strlen(name) + 8.
 */
int nly_frame_encode(uint8_t *buf, size_t bufsz,
                     const char *name, double value);

/*
 * Parse a binary frame.  Returns 0 on success, -1 on malformed data.
 */
int nly_frame_decode(const uint8_t *data, size_t len, nly_message_t *out);

#ifdef __cplusplus
}
#endif

#endif /* NALLELY_WEBSOCKET_H */
