#!/usr/bin/env bash

echo "* Install micromamba"
"${SHELL}" <(curl -L micro.mamba.pm/install.sh)

echo "* Reload .bashrc"
source ~/.bashrc

echo "* Create Nallely venv"
micromamba create -n nallely-nogil-3.14 -c conda-forge python-freethreading=3.14

echo "* Clone Nallely source"
git clone https://github.com/dr-schlange/nallely-midi

echo "* Activate micromamba env & install Nallely"
eval "$(micromamba shell hook --shell bash)"
micromamba activate nallely-nogil-3.14
(cd nallely-midi && pip install -e.)
(cd nallely-midi && bash ./prepare-trevor-ui.bash)
micromamba deactivate nallely-nogil-3.14

echo "* Pull necesary scripts"
wget https://raw.githubusercontent.com/dr-schlange/nallely-midi/refs/heads/main/rpi-files/serve-trevor-ui.bash
wget https://raw.githubusercontent.com/dr-schlange/nallely-midi/refs/heads/main/rpi-files/start-nallely.bash
wget https://raw.githubusercontent.com/dr-schlange/nallely-midi/refs/heads/main/rpi-files/update-nallely.bash
wget https://raw.githubusercontent.com/dr-schlange/nallely-midi/refs/heads/main/rpi-files/systemd-services/nallely.service
wget https://raw.githubusercontent.com/dr-schlange/nallely-midi/refs/heads/main/rpi-files/systemd-services/trevor.service
mkdir systemd-services
mv {nallely,trevor}.service systemd-services

echo "* Install systemd scripts"
systemctl --user enable systemd-services/nallely.service
systemctl --user enable systemd-services/trevor.service
systemctl --user daemon-reload
systemctl --user restart nallely trevor
