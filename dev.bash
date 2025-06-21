#!/bin/bash

set -e

live-server --quiet --wait="3000" --mount="/nallely-midi:arise-out" &
LIVE_SERVER_PID=$!

cleanup() {
    echo "Stopping live-server..."
    kill $LIVE_SERVER_PID
    exit
}
trap cleanup INT TERM

watchexec -w arise-source  "yes | ./arise build -f"

# && ln -s arise-out arise-out/nallely-midi