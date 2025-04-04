# Nallely-midi, your Midi/NTS1 Companion

Nallely (pronounced "Nayeli") is a MIDI companion to help you easily map MIDI controllers/instruments together, as well as create virtual LFOs, compose them, and the possibility to expose/create remote services with parameters on which you can map your MIDI controllers/instruments.

Features:
* provides programmatic seemless interface to your MIDI Device,
* provides virtual devices (LFOs for example) and let you connect them to your MIDI devices (as source or target),
* let you bind/unbing any Python function to any control/pad/key of your MIDI Device,
* let you bind/unbing control/pad/key of your MIDI devices between each other or virtual devices, converting the CC between source and target,
* let you bind/unbing the velocity of the pad/key of your MIDI devices to any CC control,
* let you bind/unbing pad/ey individualy to any control, note, parameter of MIDI devices or virtual devices,
* let you provide a scale for the values that goes from a source to a target: you can restrict the range of values that will be sent to the target,
* let you apply auto-scaling if you want the source to adapt to the range of the target without setting the range yourself,
* provides a websocket-based bus on which external services can auto-register and expose parameters to which you can bind your MIDI/virtual devices in a seemless way,
* provides simple LFOs with various waveform that you can compose with mathematical expressions,
* let you save/reload patch for a MIDI device.

Planned:
* handle mulple banks per device/per module,
* scaler that maps to a list of elements, or to true/false (boolean scaler), useful for external services,
* program change support for devices that do not support them (to change banks for example),
* some new virtual devices:
  * arpegiator
  * sequencer
  * envelope generator
* code generator to help your describe your MIDI device interface,
* possibility to broadcast messages and information from the external services,
* a TUI or web interface to help you create new virtual devices instances and map your MIDI/virtual devices together.


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
