/*
 * nallely-websocket.c — Nallely External Neuron Connector for C
 *
 * Implementation of the WebSocket Bus connector.
 * Uses libwebsockets for the WebSocket transport and pthreads for
 * the background connection thread.
 *
 * Compile with: -lwebsockets -lpthread
 *
 *   *LLM generated*
 */

#include "nallely-websocket.h"

#include <libwebsockets.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* ── Send queue (thread-safe linked list) ───────────────────────────── */

typedef struct nly_queue_entry {
    uint8_t *frame;                   /* LWS_PRE + payload           */
    size_t   frame_len;               /* payload length (after PRE)  */
    struct nly_queue_entry *next;
} nly_queue_entry_t;

typedef struct nly_queue {
    nly_queue_entry_t *head;
    nly_queue_entry_t *tail;
    pthread_mutex_t    mtx;
} nly_queue_t;

static void nly_queue_init(nly_queue_t *q)
{
    q->head = q->tail = NULL;
    pthread_mutex_init(&q->mtx, NULL);
}

static void nly_queue_destroy(nly_queue_t *q)
{
    pthread_mutex_lock(&q->mtx);
    nly_queue_entry_t *e = q->head;
    while (e) {
        nly_queue_entry_t *next = e->next;
        free(e->frame);
        free(e);
        e = next;
    }
    q->head = q->tail = NULL;
    pthread_mutex_unlock(&q->mtx);
    pthread_mutex_destroy(&q->mtx);
}

/* Enqueue a pre-built frame (caller passes ownership of `frame`).
 * `frame` must have LWS_PRE bytes of headroom before the payload.
 * `payload_len` is the length of the actual payload (after LWS_PRE). */
static void nly_queue_push(nly_queue_t *q, uint8_t *frame, size_t payload_len)
{
    nly_queue_entry_t *e = malloc(sizeof(*e));
    if (!e) { free(frame); return; }
    e->frame     = frame;
    e->frame_len = payload_len;
    e->next      = NULL;

    pthread_mutex_lock(&q->mtx);
    if (q->tail) { q->tail->next = e; q->tail = e; }
    else         { q->head = q->tail = e; }
    pthread_mutex_unlock(&q->mtx);
}

/* Dequeue one entry.  Returns NULL if the queue is empty. */
static nly_queue_entry_t *nly_queue_pop(nly_queue_t *q)
{
    pthread_mutex_lock(&q->mtx);
    nly_queue_entry_t *e = q->head;
    if (e) {
        q->head = e->next;
        if (!q->head) q->tail = NULL;
    }
    pthread_mutex_unlock(&q->mtx);
    return e;
}

static int nly_queue_empty(nly_queue_t *q)
{
    pthread_mutex_lock(&q->mtx);
    int empty = (q->head == NULL);
    pthread_mutex_unlock(&q->mtx);
    return empty;
}

/* ── Service internals ──────────────────────────────────────────────── */

enum nly_conn_phase {
    NLY_PHASE_REGISTER,     /* need to send registration JSON   */
    NLY_PHASE_RUNNING,      /* normal send/receive              */
};

struct nly_service {
    /* Configuration */
    char       *name;
    char       *host;
    int         port;
    char       *path;       /* "/<name>/autoconfig" */

    /* Registration payload (pre-built JSON string) */
    char       *reg_json;
    size_t      reg_json_len;

    /* Stored parameters for re-registration */
    nly_param_t *params;
    int          param_count;

    /* Connection state */
    volatile int         running;
    volatile int         conn_alive;  /* set 1 on connect, 0 on close/error */
    enum nly_conn_phase  phase;
    struct lws_context  *ctx;
    struct lws          *wsi;
    pthread_t            thread;

    /* Send queue */
    nly_queue_t queue;

    /* Receive accumulation buffer (for fragmented messages) */
    uint8_t *rx_buf;
    size_t   rx_len;
    size_t   rx_cap;
    int      rx_is_binary;

    /* Callbacks */
    nly_open_cb    on_open;     void *ud_open;
    nly_close_cb   on_close;    void *ud_close;
    nly_error_cb   on_error;    void *ud_error;
    nly_message_cb on_message;  void *ud_message;
};

/* ── Frame codec ────────────────────────────────────────────────────── */

int nly_frame_encode(uint8_t *buf, size_t bufsz,
                     const char *name, double value)
{
    size_t name_len = strlen(name);
    if (name_len > 255) return -1;
    size_t total = 1 + name_len + 8;
    if (bufsz < total) return -1;

    buf[0] = (uint8_t)name_len;
    memcpy(buf + 1, name, name_len);

    /* big-endian float64 */
    union { double d; uint64_t u; } conv;
    conv.d = value;
    uint64_t be = __builtin_bswap64(conv.u);
    memcpy(buf + 1 + name_len, &be, 8);

    return (int)total;
}

int nly_frame_decode(const uint8_t *data, size_t len, nly_message_t *out)
{
    if (len < 1) return -1;
    uint8_t name_len = data[0];
    if (len < (size_t)(1 + name_len + 8)) return -1;
    memcpy(out->name, data + 1, name_len);
    out->name[name_len] = '\0';

    uint64_t be;
    memcpy(&be, data + 1 + name_len, 8);
    union { double d; uint64_t u; } conv;
    conv.u = __builtin_bswap64(be);
    out->value = conv.d;

    return 0;
}

/* ── Build registration JSON ────────────────────────────────────────── */

static char *build_registration_json(const nly_param_t *params, int count,
                                     size_t *out_len)
{
    /* Estimate size: generous upper bound */
    size_t cap = 64 + count * 128;
    char *buf = malloc(cap);
    if (!buf) return NULL;

    int off = snprintf(buf, cap, "{\"kind\":\"external\",\"parameters\":[");

    for (int i = 0; i < count; i++) {
        if (i > 0) off += snprintf(buf + off, cap - off, ",");
        off += snprintf(buf + off, cap - off,
                        "{\"name\":\"%s\",\"range\":[%g,%g]}",
                        params[i].name, params[i].min, params[i].max);
    }
    off += snprintf(buf + off, cap - off, "]}");

    *out_len = (size_t)off;
    return buf;
}

/* ── Receive buffer helpers ─────────────────────────────────────────── */

static void rx_reset(nly_service_t *svc)
{
    svc->rx_len = 0;
}

static int rx_append(nly_service_t *svc, const void *data, size_t len)
{
    size_t need = svc->rx_len + len;
    if (need > svc->rx_cap) {
        size_t newcap = need * 2;
        if (newcap < 512) newcap = 512;
        uint8_t *tmp = realloc(svc->rx_buf, newcap);
        if (!tmp) return -1;
        svc->rx_buf = tmp;
        svc->rx_cap = newcap;
    }
    memcpy(svc->rx_buf + svc->rx_len, data, len);
    svc->rx_len += len;
    return 0;
}

/* ── Handle a complete incoming message ─────────────────────────────── */

static void handle_complete_message(nly_service_t *svc)
{
    nly_message_t msg;

    if (svc->rx_is_binary) {
        if (nly_frame_decode(svc->rx_buf, svc->rx_len, &msg) == 0) {
            if (svc->on_message) svc->on_message(&msg, svc->ud_message);
        }
    } else {
        /* JSON text: {"on": "name", "value": 42.5}
         * Minimal hand-parsing to avoid a JSON dependency. */
        svc->rx_buf[svc->rx_len] = '\0';
        const char *json = (const char *)svc->rx_buf;

        const char *on_key = strstr(json, "\"on\"");
        const char *val_key = strstr(json, "\"value\"");
        if (on_key && val_key) {
            /* Extract name: find the string after "on": */
            const char *p = strchr(on_key + 4, '"');
            if (p) {
                p++; /* skip opening quote */
                const char *end = strchr(p, '"');
                if (end) {
                    size_t nlen = end - p;
                    if (nlen < sizeof(msg.name)) {
                        memcpy(msg.name, p, nlen);
                        msg.name[nlen] = '\0';

                        /* Extract value: skip past "value": */
                        const char *vp = strchr(val_key + 7, ':');
                        if (vp) {
                            msg.value = strtod(vp + 1, NULL);
                            if (svc->on_message)
                                svc->on_message(&msg, svc->ud_message);
                        }
                    }
                }
            }
        }
    }
}

/* ── libwebsockets callback ─────────────────────────────────────────── */

static int nly_lws_callback(struct lws *wsi, enum lws_callback_reasons reason,
                             void *user __attribute__((unused)),
                             void *in, size_t len)
{
    nly_service_t *svc = (nly_service_t *)lws_context_user(lws_get_context(wsi));
    if (!svc) return 0;

    switch (reason) {

    case LWS_CALLBACK_CLIENT_ESTABLISHED:
        svc->wsi        = wsi;
        svc->conn_alive = 1;
        svc->phase      = NLY_PHASE_REGISTER;
        lws_callback_on_writable(wsi);
        break;

    case LWS_CALLBACK_CLIENT_WRITEABLE: {
        if (svc->phase == NLY_PHASE_REGISTER) {
            /* Send registration JSON as text frame */
            size_t plen = svc->reg_json_len;
            uint8_t *buf = malloc(LWS_PRE + plen);
            if (!buf) return -1;
            memcpy(buf + LWS_PRE, svc->reg_json, plen);
            lws_write(wsi, buf + LWS_PRE, plen, LWS_WRITE_TEXT);
            free(buf);
            svc->phase = NLY_PHASE_RUNNING;

            if (svc->on_open) svc->on_open(svc->ud_open);

            /* Check if there are queued messages to send */
            if (!nly_queue_empty(&svc->queue))
                lws_callback_on_writable(wsi);
            break;
        }

        /* Drain one entry from the send queue */
        nly_queue_entry_t *e = nly_queue_pop(&svc->queue);
        if (e) {
            lws_write(wsi, e->frame + LWS_PRE, e->frame_len, LWS_WRITE_BINARY);
            free(e->frame);
            free(e);
            /* More in queue? Request another writable callback */
            if (!nly_queue_empty(&svc->queue))
                lws_callback_on_writable(wsi);
        }
        break;
    }

    case LWS_CALLBACK_CLIENT_RECEIVE:
        if (lws_frame_is_binary(wsi))
            svc->rx_is_binary = 1;
        else if (lws_is_first_fragment(wsi))
            svc->rx_is_binary = 0;

        rx_append(svc, in, len);

        if (lws_is_final_fragment(wsi)) {
            handle_complete_message(svc);
            rx_reset(svc);
        }
        break;

    case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
        if (svc->on_error) {
            const char *err = in ? (const char *)in : "connection error";
            svc->on_error(err, svc->ud_error);
        }
        svc->wsi        = NULL;
        svc->conn_alive = 0;
        return -1;

    case LWS_CALLBACK_CLOSED:
        svc->wsi        = NULL;
        svc->conn_alive = 0;
        if (svc->on_close) svc->on_close(svc->ud_close);
        return -1;

    default:
        break;
    }

    return 0;
}

static const struct lws_protocols nly_protocols[] = {
    { "nallely", nly_lws_callback, 0, 4096, 0, NULL, 0 },
    { NULL, NULL, 0, 0, 0, NULL, 0 }
};

/* ── Connection thread ──────────────────────────────────────────────── */

static void *nly_thread_func(void *arg)
{
    nly_service_t *svc = (nly_service_t *)arg;

    while (svc->running) {
        /* Create a fresh lws context for each connection attempt */
        struct lws_context_creation_info cinfo;
        memset(&cinfo, 0, sizeof(cinfo));
        cinfo.port      = CONTEXT_PORT_NO_LISTEN;
        cinfo.protocols = nly_protocols;
        cinfo.gid       = -1;
        cinfo.uid       = -1;
        cinfo.user      = svc;

        svc->ctx = lws_create_context(&cinfo);
        if (!svc->ctx) {
            if (svc->on_error)
                svc->on_error("lws_create_context failed", svc->ud_error);
            if (!svc->running) break;
            sleep(1);
            continue;
        }

        struct lws_client_connect_info ccinfo;
        memset(&ccinfo, 0, sizeof(ccinfo));
        ccinfo.context            = svc->ctx;
        ccinfo.address            = svc->host;
        ccinfo.port               = svc->port;
        ccinfo.path               = svc->path;
        ccinfo.host               = svc->host;
        ccinfo.origin             = svc->host;
        ccinfo.protocol            = NULL;
        ccinfo.local_protocol_name = "nallely";

        struct lws *w = lws_client_connect_via_info(&ccinfo);
        if (!w) {
            if (svc->on_error)
                svc->on_error("lws_client_connect failed", svc->ud_error);
            lws_context_destroy(svc->ctx);
            svc->ctx = NULL;
            if (!svc->running) break;
            sleep(1);
            continue;
        }

        rx_reset(svc);
        svc->conn_alive = 1;  /* assume alive until error/close callback */

        /* Event loop — runs until connection drops or we're stopped */
        while (svc->running && svc->conn_alive) {
            lws_service(svc->ctx, 50);

            /* If there are pending sends, request writability */
            if (svc->wsi && svc->phase == NLY_PHASE_RUNNING
                && !nly_queue_empty(&svc->queue)) {
                lws_callback_on_writable(svc->wsi);
            }
        }

        lws_context_destroy(svc->ctx);
        svc->ctx = NULL;
        svc->wsi = NULL;

        if (!svc->running) break;

        /* Auto-reconnect delay */
        sleep(1);
    }

    return NULL;
}

/* ── Public API ─────────────────────────────────────────────────────── */

nly_service_t *nly_service_create(const char        *name,
                                  const char        *address,
                                  const nly_param_t *params,
                                  int                param_count)
{
    nly_service_t *svc = calloc(1, sizeof(*svc));
    if (!svc) return NULL;

    svc->name = strdup(name);

    /* Parse address into host + port */
    if (address) {
        const char *colon = strrchr(address, ':');
        if (colon) {
            svc->host = strndup(address, colon - address);
            svc->port = atoi(colon + 1);
        } else {
            svc->host = strdup(address);
            svc->port = 6789;
        }
    } else {
        svc->host = strdup("localhost");
        svc->port = 6789;
    }

    /* Build URL path */
    size_t path_len = 1 + strlen(name) + strlen("/autoconfig") + 1;
    svc->path = malloc(path_len);
    snprintf(svc->path, path_len, "/%s/autoconfig", name);

    /* Copy parameters */
    svc->param_count = param_count;
    svc->params = malloc(sizeof(nly_param_t) * param_count);
    for (int i = 0; i < param_count; i++) {
        svc->params[i].name = strdup(params[i].name);
        svc->params[i].min  = params[i].min;
        svc->params[i].max  = params[i].max;
    }

    /* Build registration JSON */
    svc->reg_json = build_registration_json(params, param_count,
                                            &svc->reg_json_len);

    nly_queue_init(&svc->queue);

    return svc;
}

void nly_service_on_open(nly_service_t *svc, nly_open_cb cb, void *ud)
    { svc->on_open = cb; svc->ud_open = ud; }

void nly_service_on_close(nly_service_t *svc, nly_close_cb cb, void *ud)
    { svc->on_close = cb; svc->ud_close = ud; }

void nly_service_on_error(nly_service_t *svc, nly_error_cb cb, void *ud)
    { svc->on_error = cb; svc->ud_error = ud; }

void nly_service_on_message(nly_service_t *svc, nly_message_cb cb, void *ud)
    { svc->on_message = cb; svc->ud_message = ud; }

int nly_service_start(nly_service_t *svc)
{
    svc->running = 1;
    if (pthread_create(&svc->thread, NULL, nly_thread_func, svc) != 0)
        return -1;
    return 0;
}

int nly_service_send(nly_service_t *svc, const char *parameter, double value)
{
    size_t name_len = strlen(parameter);
    size_t payload  = 1 + name_len + 8;
    uint8_t *buf    = malloc(LWS_PRE + payload);
    if (!buf) return -1;

    int n = nly_frame_encode(buf + LWS_PRE, payload, parameter, value);
    if (n < 0) { free(buf); return -1; }

    nly_queue_push(&svc->queue, buf, (size_t)n);

    /* Wake the event loop so it picks up the queued frame */
    if (svc->ctx)
        lws_cancel_service(svc->ctx);

    return 0;
}

void nly_service_dispose(nly_service_t *svc)
{
    if (!svc) return;

    svc->running = 0;

    /* Wake the event loop so it exits */
    if (svc->ctx)
        lws_cancel_service(svc->ctx);

    /* Close the WebSocket to unblock lws_service */
    if (svc->wsi) {
        /* lws_set_timeout forces a close on the next service call */
        lws_set_timeout(svc->wsi, PENDING_TIMEOUT_CLOSE_SEND, 0);
    }

    pthread_join(svc->thread, NULL);

    nly_queue_destroy(&svc->queue);

    free(svc->rx_buf);
    free(svc->reg_json);
    free(svc->path);
    free(svc->host);
    free(svc->name);

    for (int i = 0; i < svc->param_count; i++)
        free((void *)svc->params[i].name);
    free(svc->params);

    free(svc);
}
