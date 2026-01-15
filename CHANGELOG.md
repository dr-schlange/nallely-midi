# CHANGELOG

## Nallely v0.5.0 -- Tepezcohuite

### Features

* KeySplitter gains ability to either suppress or keep the last note yielded by a range
* Add rebinding of services registered to the websocket bus to other services registered on the websocket bus (extension of waiting room handling)
* Add new devices
  * Add experimental Universal Slope Generator in a Serge-style fashion (mostly LLM generated)
  * Add experimental Smooth Stepped Generator in a Serge-style fashion (mostly LLM generated)
  * Add experimentatl pure integrator

### Fix

* Fix imports during virtual module code generation
* Fix WebSocket Bus blocking when shutting down when too much information is still in the websockets buffers
* Fix output range for the operator module, from (0, 127) to (None, None) otherwise, scaler kicks in when we don't want

## Nallely v0.4.0 -- Tepezcohuite

### Features

* Change semantic for patch/links. Links can now be also polyphonic when originating from a MIDI synth source. When originating from a virtual module, they are monophonic by default (can be overriden from inside the module).
* Update js lib with new parameters to gain a flexible setup
* Add "force note off" button from UI (accessible in the right bar after clicking on the MIDI device, not a section)
* Add VIM mode for the code editor
* Add new modules:
  * "fine tuning" button that can transform non-integer values to a int MIDI value + pitchwheel value
  * webcam module (from localhost only at the moment)
  * audio module (first PoC, from localhost only at the moment)
  * gps module (from locahost only at the moment)
  * weird shift-register based on an auto-looping-modifying memory cells
  * js-based keyboard widget
  * generic "winow" widget to embedd any iframe
  * matrix-view widget (experimental) to be bound to any vdev to produce a matrix-based view
  * key splitter (split notes following 4 different programmable ranges)

### Fix

* Update size of some buttons
* Improve UI performances (still needs work)
* Avoid "set_pause" to be set by random preset generator
* Proxies appearing in the playground vdev list (should be handled better)
* Reset issue on 8-step sequencer
* Fix pitch shifter with new polyphonic semantic


## Nallely v0.3.0 -- Tepezcohuite

### Features

* Add new modules
  * Downscaler
  * DualRouter
  * Multiplexer
  * Demultiplexer

#### Fix

* Add welcome screen/message when running Nallely from the command line without any arguments
* Fix some double key registration in the UI
* Improve automatic completion for inputs/outputs for the docstring DSL
* Fix multiple imports copy when migrating an instance to a new class


## Nallely v0.2.1 -- Tepezcohuite

### Fix

* Fix labeling of controls on the GampadLike widget
* Fix indentation for the term rewriting system
* Fix unresponsive drag input on oscilloscopes

## Nallely v0.2.0 -- Tepezcohuite

### Features

#### Module user layer

* Add explicit support for [amsynth](https://github.com/amsynth/amsynth/) and any software MIDI synth
* Add program change support
* Add bank/preset loading priority
* Add new UI for virtual devices: devices are now looking more like modules in a modular synthesis rack
* Add drag and drop for modules in the mini rack system
* Add new modal to create multiple devices instances at once
* Add new control widgets:
  * XYPad
  * Pads
  * Sliders
  * Gamepad-like virtual controls
* Add new modules:
  * Mixer
  * Crossfade
  * Harmonic Generator
  * ThresholdGate
  * 16-step steps sequencer
  * 8-step flexible steps sequencer
  * experimental GB emulator
  * Voice Allocator
  * simple TuringMachine sequencer
  * Harmonizer
  * Euclidiant Sequencer
  * experimental Volume Mixer (based on key velocity)
  * Conveyor Line
  * experimental RAM broadcast module (allows patching observer/reactor patterns)
* Add edit mode for Sequencer8
* Sequencer8 steps are now not only input, but also output and yield their value on activation
* Add experimental keyboard support (for linux mainly)
* Add generic MIDI Bridge
* Improve ChordGenerator
* Add JS finger-tracking external device example
* Add possibility to unregister a service from the websocket bus
* Add new UI for MIDI ports I/O
* Add link velocity support
* Add back menu for MIDI devices in the right bar
* Add scaler range with drop down for target parameter with accepted values

#### Developer/Moduler developer layer

* Add exception handler for virtual devices
* Introduce >0, !=0 and round conversion policy
* Add `__post_init__(...)` hook for creating internal attributes for virtual devices
* Add dynamic class code generation (Smalltalk inspired)
* Add dynamic instances migrations (Smalltalk inspired)
* Add support for debugger (pdb/ipdb/...) and fake stdin redirected to the frontend
* Add support for hot-patching instances
* Add support for creating new virtual devices directly from the UI (Smalltalk inspired)
* Add support for codegeneration and versioning different versions of virtual devices
* Add support for "layers" (replacement of internal classes at run time), layers are versioned also
* Add better code editor support on mobile
* Add self-modifying decorator for module/virtual device auto-generator following the docstring
* Improve JS library for websocket connection
* Add kind of proxy support for virtual devices (mainly for the websocket bus): now each registered service on the websocket is shown as an independedent module
* Add code automatic code generator to generate the online doc for existing modules
* Add support for binary messages send by the websocket server
* Introduced a small system for fast doc typing in the editor (user-driven term-rewriting system based on recursive snippets)

### Bug fixes

* Fix missing conversion policy on SeqSwitch
* Fix multipel triggering of output when a value is sent from an external device
* Fix Bernouilli trigger
* Change clock divide interface
* Fix CSS horizontal display
* Fix scrolling + drag and drop for scope widgets and virtual device
* Fix links cleanup after a kill/stop of a device


## Nallely -- Tlitliltzin beta 1

### Features

* Add sample & hold module
* Add shift register module
* Add channel support for MIDI devices
* Add quantizer module
* Add clock module
* Add/fix LFO synchronization capabilities
* Add dangling ref detection when reloading a patch
* Add first documentation for the GUI (already a little bit obsolete... the GUI is evolving fast)
* Add auto sorting of ports when patching to have outputs/inputs presented more "in front" in the patching modal
* Add possibility to hide VirtualParameter if needed
* Add quick section/virtual device selection from the patching modal, you can now change the devices to patch without existing the patching modal
* Add indicators to mark with which other devices a selected device in the patching modal as relationship with
* Add first JS library to create external devices
* Add JS external device example that reads from the webcam and transmit signals to the running Nallely's session
* Patches are not directly clickable from inside the patching modal
* Devices have now a unique ID that is rehydrated when a patch is reload (enabling full patch traceability)
* Highlight incoming and outgoing patches when clicking on a patch
* Patch can now be individually muted
* Add comparator module
* Add new quick statistic command for the TUI when a session is running
* Add sequential switch module
* Add patch details display in the patch selection window
* Add experimental 3D explorer/view
* Add window detector module
* Add additionner/substractor/multiplicator, etc module (1 module providing the differente operations)
* Add boolean logical module (and/or/xor/nand, etc)
* Add bitwise logic module (&, |, ^, etc)
* Reify VirtualParameter to have automatic non-int conversion
* Reify VirtualParameter to have automatic conversion policies
* Add LowPass and HighPass filter module
* Add first Waveshaper module
* Add new internal API for automatic __init__ generation fromVirutalParameters
* Add ring counter module
* Add bit counter module with overflow
* Add bernouilli trigger module
* Add envelope follower/slew limiter
* Add latch module
* Add flip-flop module
* Add new patch save concept based on a versionned memory using git
* Add possibility to load an address from the command line
* Add experimental Delay (activated with the --experimental flag on the command line)
* Add chord generator module
* Add clock divider

### Bug fixes

* Fix eager sleep method for virtual devices
* Switch to perfcount_ns to have precise count
* Fix non draggeable widgets in some occasion
* Fix widget scrolling
* Fix patchs not being updated when DnD
* Fix missing synchronization between CC parameters in the rack and the one from the right settings panel
* Fix SVG canvas size for the patching device windows
* Reduce number of required div to display the interface
* Fix various bugs in the UI and in the way some values were rounded


## Nallely -- Ololiuhqui beta 6 Pre-release

* Add self.sleep(ms) method for virtual device which lets "sleep" the virtual device without blocking the virtual device thread, letting the virtual device receive and deal with inputs
* Refine internal API to let trigger multiple times multiple outputs
* Add possibility to directly start a session with a patch
* Add basic MIDI looper virtual device
* Add basic MIDI arpegiator virtual device
* Add Barnsley projector virtual device
* Add Morton encoder virtual device
* Add HenonProjector virtual device
* Add Lorenz Attractor virtual device
* Add Rossler attractor virtual device
* Add XY and XYX oscilloscope
* Add expand feature on XY and XYZ oscilloscope (2D and 3D)
* Add cyclic/linear mode for basic oscilloscope (1D)
* Add point mode and reset for 1D oscilloscope
* Fix reloading patches with dangling references
* Add first version of Behavioral testing using Gherkin features
* Add new experimental devices generated by LLMs
* Remove neutralino
* Add new basic Javascript/Typescript lib with examples to create and register external devices in JS/TS
* Fix issue with edge detection for virtual devices
* Add configuration for Roland S1
* Add configuration for Behringer Pro-VS mini
* Add configuration for Behringer JT-4000 micro
Assets
5

## Nallely -- Ololiuhqui beta 5

* Fix thread-safe implementation of "on" decorator
* Fix first miss trigger
* Pitch shifter made it to stable
* Fix issue with reloading patchs
* Add possility to select a dedicated output
* Add walker
* Fix issue with idle loop on virtual devices
* Add better support for links connections with bouncy links
* Fix issue with shared old param values
* Add modulo virtual device

## Nallely -- Ololiuhqui beta 4

* Fix callback compilation between keys and virtual ports
* Add experimental preliminary support for class browser
* Remove serialization of default values for midi devices
* Add option to force or not save of default values
* Add default pause/resume port for virtual devices
* Accomodate CSS for small devices
* Add new row for direct value feedback
* Add drag and drop for devices and widgets
* Add simple "switch" button for min max in scaler form
* Add distinction color on allocated sections
* Change font for an open-source one
* Add possibilitiy to set CC values from the interface
* Add phase, sync and polarity inversion for LFOs
* Refactor links and internal API to develop virtual devices
* Change from single serial input queue to a parallel input queue
* Introduce batching for CC value visualiation in frontend
* Add support for touchwheel

## Nallely -- Ololiuhqui beta 3

* Fix issue with reloading of the websocket bus
* Add possibility for external devices registered on the websocket bus to send values
* Add experimental flag to directly include experimental files
* Add notification system in Trevor
* Add quicksave
* Add special orientation for small devices
* Add automatic late-rebind of external service which send information on the websocket bus
* Stabilize potential leftovers when closing the websocket bus
* Fix missing scaler application on virtual <-> virtual connections
* Change orientation of labels in patching modal in portrait mode on small devices

## Nallely -- Ololiuhqui beta 2

* Change default websocketURL
* Change orientation on small devices (vertical to horizontal)
* Fix issue while reloading scaler values on the websocket bus
* Fix scaler as_int reloading
* Fix magnifing glass logger

## Nallely -- Ololiuhqui beta

* First official beta for v.0.0.1. The binaries have been built from github actions using pyinstaller. Tested on linux, but not tested for windows or macos.
