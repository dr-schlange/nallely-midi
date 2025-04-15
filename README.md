# Nallely-midi, your Midi devices companion: connect anything with everything

Nallely (pronounced "Nayeli") is a MIDI companion to help you easily map MIDI controllers/instruments together, as well as create virtual LFOs, compose them, and the possibility to expose/create remote services with parameters on which you can map your MIDI controllers/instruments.

Features:
* programmatic seemless interface to your MIDI Device,
* virtual devices (LFOs for example) you can connect to your MIDI devices (as source or target),
* the Python API code generator for your device if it is listed by the [MIDI CC & NRPN database](https://github.com/pencilresearch/midi) project,
* bind/unbind any Python function to any control/pad/key of your MIDI Device,
* bind/unbind control/pad/key of your MIDI devices between each other or virtual devices, converting the CC between source and target if required,
* bind/unbind the velocity of the pad/key of your MIDI devices to any CC control,
* bind/unbind pad/key individualy to any control, note, parameter of MIDI devices or virtual devices,
* bind/unbind a key/pad to another one (even if not the same note, you can map a note to its octave on the same device or another one),
* scaler for the values that goes from a source to a target: you can restrict the range of values that will be sent to the target,
* auto-scaling: if you want the source to adapt to the range of the target without setting the range yourself,
* websocket-based bus on which external services can auto-register and expose parameters to which you can bind your MIDI/virtual devices in a seemless way,
* LFOs composition with mathematical expressions,
* save/reload patch for any MIDI device.

Planned:
* handle multiple banks per device/per section,
* scaler that maps to a list of elements, or to true/false (boolean scaler), useful for external services,
* program change support for devices that do not support them (to change banks for example),
* some new virtual devices:
  * arpegiator
  * sequencer
  * envelope generator
* possibility to broadcast messages and information from the external services,
* a TUI or web interface to help you create new virtual devices instances and map your MIDI/virtual devices together.


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

## Documentation

A first draft about how Nallely can help you declare your devices and map them using the current API can be find in the [documentation](./docs/main.md).

## Launch the example

This repo comes with one example of a spiral that is controlled by LFOs created by Nallely. To launch it, once you have installed the library:

1. Simply copy those file from this repository:
   * `visual-spiral.py` => core system for this small example, creates 2 LFOs, waits for external modules (spiral and possibly terminal-based oscilloscope) to connect and maps all together,
   * `spiral.hml` => simple three.js spiral controlled by some parameters,
   * `external_scope.py` => simple terminal-based oscilloscope relying on `plotext`.
2. Open `spiral.html` in your browser (chrome/chromium/brave or firefox),
3. Launch `visual-spiral.py`
4. ...
5. Profit
6. (Optional) if you want to see the LFO shape, launch `external-scope.py` from another terminal.

The screenshot below shows you what the result looks like with everything launched

![shot](https://github.com/user-attachments/assets/0fc1a194-5281-4cbc-9ce9-bc2fc86e7342)
