/*
 * echo.c — Echo neuron for testing the C connector.
 *
 * Registers as "cecho" with parameters "input" and "output".
 * Every value received on "input" is immediately sent back on "output".
 *
 * Build:
 *   cc -o echo echo.c ../nallely-websocket.c -lwebsockets -lpthread
 *
 * Run:
 *   ./echo [host:port]
 *
 *
 *   *LLM generated*
 */

#include "../nallely-websocket.h"

#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static volatile int running = 1;

static void on_open(void *ud)
{
    (void)ud;
    fprintf(stderr, "[cecho] registered\n");
}

static void on_close(void *ud)
{
    (void)ud;
    fprintf(stderr, "[cecho] disconnected\n");
}

static void on_error(const char *msg, void *ud)
{
    (void)ud;
    fprintf(stderr, "[cecho] error: %s\n", msg);
}

static void on_message(const nly_message_t *msg, void *ud)
{
    nly_service_t *svc = (nly_service_t *)ud;

    if (strcmp(msg->name, "input") == 0) {
        fprintf(stderr, "[cecho] input=%g -> output=%g\n",
                msg->value, msg->value);
        nly_service_send(svc, "output", msg->value);
    }
}

static void sighandler(int sig)
{
    (void)sig;
    running = 0;
}

int main(int argc, char **argv)
{
    const char *address = NULL;
    if (argc > 1) address = argv[1];

    nly_param_t params[] = {
        { "input",  0, 127 },
        { "output", 0, 127 },
    };

    nly_service_t *svc = nly_service_create("cecho", address, params, 2);
    if (!svc) {
        fprintf(stderr, "failed to create service\n");
        return 1;
    }

    nly_service_on_open(svc, on_open, NULL);
    nly_service_on_close(svc, on_close, NULL);
    nly_service_on_error(svc, on_error, NULL);
    /* Pass svc as userdata so the callback can send */
    nly_service_on_message(svc, on_message, svc);

    if (nly_service_start(svc) != 0) {
        fprintf(stderr, "failed to start\n");
        nly_service_dispose(svc);
        return 1;
    }

    signal(SIGINT, sighandler);
    signal(SIGTERM, sighandler);

    fprintf(stderr, "[cecho] running... Ctrl-C to quit\n");
    while (running) sleep(1);

    fprintf(stderr, "[cecho] shutting down\n");
    nly_service_dispose(svc);
    return 0;
}
