/*
 * example.c — Minimal Nallely external neuron in C
 *
 * Registers a neuron called "c_demo" with two parameters (note, gate),
 * prints incoming values, and sends a short note sequence.
 *
 * Build:
 *   cc -o example example.c ../nallely-websocket.c -lwebsockets -lpthread
 *
 * Run (with a Nallely session already running on localhost):
 *   ./example
 */

#include "../nallely-websocket.h"

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static void on_open(void *ud)
{
    (void)ud;
    printf("[c_demo] connected and registered\n");
}

static void on_close(void *ud)
{
    (void)ud;
    printf("[c_demo] disconnected\n");
}

static void on_error(const char *msg, void *ud)
{
    (void)ud;
    fprintf(stderr, "[c_demo] error: %s\n", msg);
}

static void on_message(const nly_message_t *msg, void *ud)
{
    (void)ud;
    printf("[c_demo] recv %s = %g\n", msg->name, msg->value);
}

int main(int argc, char **argv)
{
    const char *address = NULL;
    if (argc > 1) address = argv[1]; /* e.g. "192.168.1.74:6789" */

    nly_param_t params[] = {
        { "note", 0, 127 },
        { "gate", 0, 1   },
    };

    nly_service_t *svc = nly_service_create("c_demo", address,
                                            params, 2);
    if (!svc) {
        fprintf(stderr, "failed to create service\n");
        return 1;
    }

    nly_service_on_open(svc, on_open, NULL);
    nly_service_on_close(svc, on_close, NULL);
    nly_service_on_error(svc, on_error, NULL);
    nly_service_on_message(svc, on_message, NULL);

    if (nly_service_start(svc) != 0) {
        fprintf(stderr, "failed to start service\n");
        nly_service_dispose(svc);
        return 1;
    }

    /* Wait for connection */
    sleep(1);

    /* Send a short note sequence */
    double notes[] = { 60, 64, 67, 72 };
    for (int i = 0; i < 4; i++) {
        printf("[c_demo] send note=%g gate=1\n", notes[i]);
        nly_service_send(svc, "note", notes[i]);
        nly_service_send(svc, "gate", 1.0);
        usleep(300000);

        nly_service_send(svc, "gate", 0.0);
        usleep(100000);
    }

    /* Keep running to receive values (Ctrl-C to quit) */
    printf("[c_demo] listening... press Ctrl-C to quit\n");
    while (1) sleep(1);

    nly_service_dispose(svc);
    return 0;
}
