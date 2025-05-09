# Nallely-midi, an organic platform for experimentations around MIDI

Nallely (pronounced "Nayeli") is an organic platform for experimentation around the idea of MIDI meta-synth for live coding, generative music, and multimodal art, built for hacker/musicians, inspired by Smalltalk. Nallely is a MIDI companion to help you easily map MIDI controllers/instruments together, as well as create/use virtual devices (LFOs, EGs), compose them, and the possibility to expose/create remote services with parameters on which you can map your MIDI controllers/instruments or virtual devices.

Features:
* programmatic seemless API to your MIDI Device,
* virtual devices (LFOs for example) you can connect to your MIDI devices (as source or target),
* Python API code generator for your device if it is listed by the [MIDI CC & NRPN database](https://github.com/pencilresearch/midi) project,
* bind/unbind any Python function to any control/pad/key of your MIDI Device,
* bind/unbind control/pad/key of your MIDI devices between each other or virtual devices, converting the CC between source and target if required,
* bind/unbind the velocity of the pad/key of your MIDI devices to any CC control,
* bind/unbind pad/key individualy to any control, note, parameter of MIDI devices or virtual devices,
* bind/unbind a key/pad to another one (even if not the same note, you can map a note to its octave on the same device or another one),
* scaler for the values that goes from a source to a target: you can restrict the range of values that will be sent to the target,
* auto-scaling: if you want the source to adapt to the range of the target without setting the range yourself,
* websocket-based bus on which external services can auto-register and expose parameters to which you can bind your MIDI/virtual devices in a seemless way,
* LFOs composition with mathematical expressions,
* Envelope Generator,
* a web interface relying on a websocket protocol (named Trevor) which allows you to do graphically what you would ask Nallely to do in normal time (map devices, parameters, scalers),
* interactive code playground in the browser (through Trevor UI),
* small web-based widget oscilloscope integrated in the web interface,
* save/reload preset for any MIDI device,
* save/reload patch for full connection between MIDI devices and virtual devices,
* random preset generator for MIDI devices and virtual devices,
* full random patch generator (basic at the moment) with auto-generative capacity,
* introspective API for auto-adaptive virtual modules (still unstable at the moment).

Planned:
* handle multiple banks per device/per section,
* scaler that maps to a list of elements, or to true/false (boolean scaler), useful for external services,
* program change support for devices that do not support them (to change banks for example),
* some new virtual devices:
  * arpegiator
  * sequencer
* possibility to broadcast messages and information from the external services,


## Quick examples

Here is a simple example about how to map the cutoff of the KORG NTS-1 with the cutoff of the KORG Minilogue, in an inverse fashion:

```python
import nallely
from nallely.devices import NTS1, Minilogue

nts1 = NTS1()
minilogue = Minilogue()

try:
  nts1.filter.cutoff = minilogue.filter.cutoff.scale(127, 0)

  input("Press enter to stop...")
finally:
  nallely.stop_all_connected_devices()
```

Another example is how to bind the velocity of a pad of the Akai MPD32 to the cutoff of the Minilogue:

```python
import nallely
from nallely.devices import MPD32, Minilogue

mpd32 = MPD32()
minilogue = Minilogue()

try:
  minilogue.filter.cutoff = mpd32.pads[36].velocity

  input("Press enter to stop...")
finally:
  nallely.stop_all_connected_devices()
```

Another more complex example where we create a simple harmonizer for the Minilogue, where the NTS-1 is also playing the harmonized note:

```python
import nallely
from nallely.devices import NTS1, Minilogue

scale = [0, 2, 2, 1, 2, 2, 2]  # major scale
intervals = [4, 3, 3, 4, 4, 3, 3]  # 3rd intervals
nts1 = NTS1()
minilogue = Minilogue()

try:
  for root_note in range(0, 127, 12):  # We start on lower C key and iterate on each octaves
    note = root_note
    for config in zip(scale, intervals):
        offset, interval = config
        note += offset  # we compute the next note of the scale from the root
        new_note = note + interval  # we add the corresponding interval
        if new_note > 127:  # if the result goes over 127, no need to map
            break

        # here is the important part
        minilogue.keys[new_note] = minilogue.keys[note]  # we map the key to the 3rd on the minilogue
        nts1.keys[new_note] = minilogue.keys[note]  #  we map the key to the 3rd on the NTS-1
  input("Press enter to stop...")
finally:
  nallely.stop_all_connected_devices()
```


## Requirements and how to install

The current version requires Python >= 3.10. The library relies mainly on `mido` and `python-rtmidi`, so your system needs to support them.

### Installation

There is currently no pypi package for it, so the easiest way to install the library is to:

1. create a virtual env
2. `pip install git+https://github.com/dr-schlange/nallely-midi.git`

### Usage

Nallely's scripts are pure Python script and can be launched on their own, but to simplify the integration with Trevor (protocol/UI), or to avoid to have to write the `try/finally/input`, or to generate the Python API from a CSV or a YAML file configuration, there is a convenient command line interface.

```
$ nallely -h
usage: nallely [-h] {run,generate} ...

Playground for MIDI instruments that let's you focus on your device, not the exchanged MIDI messages

positional arguments:
  {run,generate}
    run           Run scripts and Trevor (protocol for remote control)
    generate      Generate a Python API for a MIDI device

options:
  -h, --help      show this help message and exit
```

#### Run a script or Trevor

The command line let's you either run a simple script (an "init scrip"), launch Trevor websocket server to connect later Trevor's UI, to include paths where you might have API for devices, or include the builtins device config (Korg NTS-1, Korg Minilogue).

```
$ nallely run -h
usage: nallely run [-h] [-l [LIBS ...]] [--with-trevor] [-b] [-i INIT_SCRIPT]

options:
  -h, --help            show this help message and exit
  -l, --libs [LIBS ...]
                        Includes one or more paths (file or directory) where to look for MIDI devices API (includes those paths to Python's lib paths).
                        The current working directory is always added, even if this option is not used. The paths that are Python files will be
                        automatically imported.
  --with-trevor         Launches the Trevor protocol/websocket server
  -b, --builtin-devices
                        Loads builtin MIDI devices (Korg NTS1, Korg Minilogue)
  -i, --init INIT_SCRIPT
                        Path towards an init script to launch. If used with "--with-trevor", the script will be launched *before* Trevor is started.
```

#### Generates a Python API for a MIDI device from a CSV or YAML configuration

If you have your MIDI device [listed in this repository](https://github.com/pencilresearch/midi) as CSV, or a YAML description of your MIDI device, you can generate the Python API for it to be integrable with Nallely.

```
$ nallely generate -h
usage: nallely generate [-h] -i INPUT -o OUTPUT

options:
  -h, --help           show this help message and exit
  -i, --input INPUT    Path to input CSV or YAML file
  -o, --output OUTPUT  Path to the file that will be generated
```

NOTE: If a CSV configuration is given as input, the equivalent YAML configuration will be generated at the same time.
Also, as you can see, there is no special mention of key/pads section in the CSV configuration available in the https://github.com/pencilresearch/midi repository.
If you want to generate a key section for your device, you can modify the YAML configuration by adding a `xxx: 'keys_or_pads'` entry. Here is how it's done for the Korg NTS-1:

```
KORG:
  NTS-1:
    # ... Other sections here
    keys:
      notes: 'keys_or_pads'
```

The `xxx: 'keys_or_pads'` entry doesn't have to be in an isolated section, it can be set with other sections, but it's only possible to have one `key_or_pads` entry by section.



## Documentation

A first draft about how Nallely can help you declare your devices and map them using the current API can be find in the [documentation](./docs/main.md).

## Launch the example

This repo comes with one example of a spiral that is controlled by LFOs created by Nallely. To launch it, once you have installed the library (obviously).

There is 3 ways of launching the demo, either launching the `visual-spiral.py` script, or loading the `visual-spiral.nly` patch through the UI, or loading by a script the `visual-spiral.nly` patch. We will demonstrate here the two first ways: using the `visual-spiral.py` script, and using the UI.

### Using the python script

1. Simply copy those file from this repository:
   * `visual-spiral.py` => core system for this small example, creates 2 LFOs, waits for external modules (spiral and possibly terminal-based oscilloscope) to connect and maps all together,
   * `spiral.hml` => simple three.js spiral controlled by some parameters,
   * `external_scope.py` => simple terminal-based oscilloscope relying on `plotext`.
2. Launch `python -m http.server 8000` in the project repository and go with your browser to [http://localhost:8000/spiral.html](http://localhost:8000/spiral.html),
3. Launch `visual-spiral.py`
4. ...
5. Profit
6. (Optional) if you want to see the LFO shape, launch `external-scope.py` from another terminal.

The screenshot below shows you what the result looks like with everything launched

![shot](https://github.com/user-attachments/assets/0fc1a194-5281-4cbc-9ce9-bc2fc86e7342)


### Using Trevor UI

https://github.com/user-attachments/assets/6913a9be-e4d8-4bb6-b604-5734ce9b6d15

## Trevor, Nallely's companion

Trevor is a communication protocol and a UI made to communicate with Nallely through websocket and ask Nallely to create device instance, map devices together or apply scaler. Trevor proposes a web UI that lets you bind everything at run time, without any need for stopping/starting again scripts, as well as an interactive code playground inspired by Smalltalk playgrounds that let's you code/script on the fly.

### Installation & how to launch it

Trevor runs in two parts: the websocket server (the backend), and the frontend. At the moment, this is the way to launch it, but in the future, it will be integrated in a more seemless way. The web UI is built with vite, react, and uses yarn. We consider here that you have all of this installed already. To install Trevor:

```
cd trevor
yarn install
```

Then to launch everything:

```
# in 1 terminal, inside of the "trevor" directory
yarn dev

# in another terminal, there is various other options you can pass, try --help to see all of them
nallely run --with-trevor
```

### Screenshots of Trevor UI
![trevor1](https://github.com/user-attachments/assets/aa611b38-4e12-4437-a0d3-d6079966dc7a)
![trevor2](https://github.com/user-attachments/assets/9baa2a96-5359-458b-abdd-7bf6f13e7eb6)

### Screenshots of Trevor UI (old)

![trevor-shot1](https://github.com/user-attachments/assets/011adf5c-47d4-4786-9375-bb337008b3cd)
![trevor-shot2](https://github.com/user-attachments/assets/e2955fd9-9ab4-4e6a-876b-aa6e9e1f2280)
![trevor-shot3](https://github.com/user-attachments/assets/5243180f-3e48-45e5-a21c-d5a05c4d7504)
