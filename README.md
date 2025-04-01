# Nallely-midi, your Midi/NTS1 Companion

Nallely (pronounced "Nayely") is a MIDI companion to help you easily map MIDI controllers/instruments together, as well as create virtual LFOs, compose them, and the possibility to expose/create remote services with parameters on which you can map your MIDI controllers/instruments.


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
