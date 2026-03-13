#!/usr/bin/env bash

# micromamba run -n nallely-nogil pip uninstall nallely -y
# micromamba run -n nallely-nogil pip install git+https://github.com/dr-schlange/nallely-midi.git
# (cd nallely-midi && git pull && ./prepare-trevor-ui.bash)
(cd nallely-midi && git pull)
sudo systemctl restart nallely
