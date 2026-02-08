CC      ?= cc
AR      ?= ar
CFLAGS  ?= -Wall -Wextra -O2
LDFLAGS  = -lwebsockets -lpthread

LIB_SRC    = nallely-websocket.c
LIB_HDR    = nallely-websocket.h

LIB_OBJ    = nallely-websocket.o
LIB_PIC    = nallely-websocket.pic.o
LIB_A      = libnallely.a
LIB_SO     = libnallely.so

EXAMPLES   = examples/example examples/echo

.PHONY: all clean static shared examples

all: static shared examples

# ── Libraries ───────────────────────────────────────────────────────

static: $(LIB_A)

shared: $(LIB_SO)

$(LIB_OBJ): $(LIB_SRC) $(LIB_HDR)
	$(CC) $(CFLAGS) -c -o $@ $(LIB_SRC)

$(LIB_A): $(LIB_OBJ)
	$(AR) rcs $@ $<

$(LIB_PIC): $(LIB_SRC) $(LIB_HDR)
	$(CC) $(CFLAGS) -fPIC -c -o $@ $(LIB_SRC)

$(LIB_SO): $(LIB_PIC)
	$(CC) -shared -o $@ $< $(LDFLAGS)

# ── Examples ────────────────────────────────────────────────────────

examples: $(LIB_A) $(EXAMPLES)

examples/example: examples/example.c $(LIB_A) $(LIB_HDR)
	$(CC) $(CFLAGS) -o $@ examples/example.c $(LIB_A) $(LDFLAGS)

examples/echo: examples/echo.c $(LIB_A) $(LIB_HDR)
	$(CC) $(CFLAGS) -o $@ examples/echo.c $(LIB_A) $(LDFLAGS)

# ── Cleanup ─────────────────────────────────────────────────────────

clean:
	rm -f $(LIB_OBJ) $(LIB_PIC) $(LIB_A) $(LIB_SO) $(EXAMPLES)
