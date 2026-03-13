#!/usr/bin/env bash

set -euo pipefail

if lsof -i:6788 &>/dev/null; then
    echo "Port 6788 already in use — not starting a second instance."
    exit 1
fi

trap "echo 'Received stop signal, exiting...'; exit 0" SIGTERM SIGINT

source /home/drschlange/.bashrc
export PYTHON_GIL=0
while true; do
	# micromamba run -n nallely nallely run -b --with-trevor -l nallely-midi/configs/*.py nallely-midi/ai_generated_devices/*.py --experimental
	micromamba run -n "nallely-nogil-3.14" nallely run -b --with-trevor -l nallely-midi/configs/*.py nallely-midi/ai_generated_devices/*.py --experimental
	echo "Process exited, restarting in 2 seconds..."
	sleep 2
done
