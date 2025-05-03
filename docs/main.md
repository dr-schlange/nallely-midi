# Documentation for Nallely Midi

This documentation is a first draft and tries to concentrate the various concepts that are part of Nallely in a single document, as well as the way of writing your own devices/modules for Nallely to handle.
The documentation starts by giving a general overview of the concepts that are known by Nallely and how to handle them.

NOTE: Please note that this library/platform makes an intensive use of meta-programming, meaning that sometimes, the auto-completion can be lost. This will be fixed in future versions as much as possible when concepts will be made more polymorphic.

## General Overview

Nallely is a companion for your MIDI devices, and a platform for scripting interaction between your devices and experiment with other technologies (e.g: Three.js) to give visual animations that are driven by your MIDI devices.
Basically Nallely defines two big kind of devices: VirtualDevices and MidiDevices. Those devices exposes a bunch of attributes (ports) that can be mapped between each others. To communicate to other devices, a device registers callbacks towards the devices it needs to modify, and how information is transmitted to the mapped devices. In complement, a websocket server coded as a `VirtualDevice`, allows you to subscribe to external modules and send value changes to them. All devices are non-blocking, so a classic "pattern" for a code would be:

```python
import nallely

try:
    # ... All your mapping/logic/use of devices
finally:
    nallely.stop_all_connected_devices()
```

The `stop_all_connected_devices()` let you stop all the thread that have been started, as well as closing all the connection that have been opened towards the MIDI devices.

## Virtual Devices

This kind of devices represents devices that are not MIDI devices, but that generates Control Changes (CC) values. Currenly, `VirtualDevices` can only be mapped to CC controls of other devices. In a near future, it will be possible to map them on other the keys/notes of a target device.
Each `VirtualDevice` runs in its own thread. Consequently, they need to be started to start send information, they can be paused/resumed, and needs to be stopped when they are not used anymore (or using `stop_all_connected_devices()`).

```python
import time
import nallely

try:
    # Defines a triangle LFO that will vary between 15 and 500 at 10Hz
    lfo = nallely.LFO(waveform="triangle", min_value=15, max_value=500, speed=10)
    lfo.start()

    input("Press enter to pause the LFO...")

    lfo.pause()    # We pause

    input("Press enter to resume the LFO...)

    lfo.resume()
finally:
    nallely.stop_all_connected_devices()
```

As you can see in this example, the concept of `VirtualDevice` is reified in various subclasses. One of them, `TimeBasedDevice` represents virtual device that produces data on a regular time basis, following a `speed`. `LFO` and `Cycler` are reifications of `TimeBasedDevice`.

There is currently three pre-defined virtual devices:

1. LFO: represents Low Frequency Oscillators,
2. Cycler: represents a kind of LFO that cycles through a list of values at a specific speed,
3. WebSocketSwitch: a websocket server that is used more or less as a bus to send information from local devices (virtual device or MIDI device) to external modules.

### LFOs

Low Frequency Oscillator are defined by instanciating the `LFO` class. A set of information to configure the LFO can be passed as parameter (all of them are optionals):

```python
from nallely import LFO

# Creates a sine signal at 2Hz speed, sampled at 1kHz, which will oscillate between 14 and 50
l = LFO(waveform="sine", min_value=14, max_value=50, speed=2, sampling_rate=1000)
l.start()  # starts the LFO

input("Press enter to stop the LFO...")

stop_all_connected_devices()
```

The parameters that are accepted are:

* `waveform`: the shape of the LFO, can be `"triangle"`, `"sine"`, `"square"`, `"sawtooth"`, `"invert_sawtooth"` (default: `"sine"`).
* `min_value`: the lower bound of the LFO (default: `0`).
* `min_value`: the upper bound of the LFO, not included in the result (default: `128`).
* `speed`: the speed in Hz of the LFO (default: `10.0`)
* `sampling_rate`: the sampling rate for the produced signal (default: `"auto"`)

The values that are generated depends on `min_value`, `max_value`, as well as their type: if both, `min_value` and `max_value` are `int`, then the values produced by the LFO will be rounded as integers. If one of the value is a `float` or a `Decimal`, the values produced will be of type `float`.

Currently it's not possible to set an offset, but it will be in the future versions (as much as possible).

When the value of `sampling_rate` is set as `"auto"`, then automatically, the LFO instance will compute the best sampling rate to have a clean resolution while not sending "too much" information, leveraging a little bit the load on the CPU.

#### Control parameters of the LFO dynamically

It's possible to change the parameters of the LFO dynamically by simply setting the new value.

```python
l = LFO(waveform="sine", min_value=14, max_value=50, speed=2)
time.sleep(2)  # We pause the main execution for 2s, the LFO still runs in the background
l.speed = 0.001

input("Press enter to stop the LFO...")

stop_all_connected_devices()
```

You can also drive an LFO from another one (or from a `Cycler`), but you need to associate the LFO to a special attribute of the LFO that needs to be modified:

```python
main_lfo = (waveform="triangle", min_value=0.001, max_value=1, speed=1)
sub_lfo = LFO(waveform="sine", min_value=14, max_value=50, speed=2)

sub_lfo.speed_cv = main_lfo  # associate the values produced by main_lfo to sub_lfo

# associate the values produced by main_lfo, but scaled between 0 and 127 in a linear fashion
sub_lfo.max_value_cv = main_lfo.scale(min=0, max=127, method="lin")
```

The fact of using `speed_cv` instead of `speed` is implementation dependent of the virtual device. For the LFO, `speed` is an accessor (getter/setter), so as it adjusts some values if a new value is set (e.g: for the speed), `xxx_cv` acts as an indirection that knows how to install the required callbacks on the `xxx` attribute.

The last line associated the `main_lfo` to the `max_value_cv` of the LFO, but this time, a scaler is applied. A scaler lets you change the range of the produced values, thus mapping the produced values to a new scale.

#### Arithmetic

LFOs let you compose them by applying mathematical operations on them:

```python
l1 = (waveform="triangle", min_value=0.001, max_value=1, speed=1)
l2 = LFO(waveform="sine", min_value=14, max_value=50, speed=2)

l = l1 + l2  # get the value of l1 and l2 for a dedicated point, adds them and clip the result in the range of min(l1.min, l2.min), max(l1.max, l2.max).
l.start()
l.stop()

l = (l1 + l2) > l1 / l2
l.start()
```
When composing a LFO from others, only the final LFO created from the composition of the others needs to be started. The others LFO do not need to be started.
The operations that are supported are: `+`, `-`, `/`, `*`, `<`, `>`. They are self explanatory beside `<` and `>` which returns the max, and min of the two sub-lfos.

### Build your own virtual device

You can build your own virtual device by inheriting from the `VirtualDevice` class. This class inherits from `Thread` and let you overrides few methods to customize the behavior. When the virtual device is started, it first calls `setup()` which returns a context that is used to pass some information to the `main(ctx)` method. This latter method is called automatically by the virtual device at a specific rate (by default every O.OO5s, so a rate of 200Hz). If you want to make a blocking call "non blocking", then you can put it in `main(...)`.

The virtual device lets you also override the `receiving(value, on, ctx)` method that is triggered by an external source (other virtual device or MIDI device). To see an example of how to code a virtual device, you can check the `LFO` class and the `Cycler` class. They are both based on the `TimeBasedDevice`, so they override the `generate_value(t)` method that generates a value for a time `t` automatically passed to the method.

Here is the code for the `Cycler`:

```python
class Cycler(LFO):
    def __init__(self, values: list[Any], speed=10, waveform="triangle"):
        self.values = values
        super().__init__(
            waveform=waveform, speed=speed, min_value=0, max_value=len(values)
        )

    def generate_value(self, t) -> Any:
        idx = super().generate_value(t)
        return self.values[idx]
```

The initialization method accepts the speed, the type of wave that needs to be applied, as well as the list element to cycle from. The min and max values are set to `0` and the length of the input list (`values`).
The class inherits from `LFO` and only overrides the `generate_value(t)` method. For a time `t`, as we inherits from LFO, we will compute a value that will be in the range [0, length of values]. This value is considered as the index of the list of values. The value associated to this index is simply returned.

To declare controls that can be driven by another device, like a MIDI device, or another virtual device, you need to declare a `VirtualParameter` on the class that defines your new virtual device.

```python
class LFO(TimeBasedDevice):
    speed_cv = VirtualParameter("speed")
    ...  # rest of the code
```

For example, this is how the LFO defines the speed control. It explicitly says that when this attribute will be controled, it will impact the `speed` attribute of the device.
There is some options that can be passed to the `VirtualParamter`. If your parameter is supposed to be only an attribute that will "receive" information, but that will never be used as source of other controls/parameters, you have to tag it as `consumer`. It's also possible to state that the parameter will be used in a `stream` fashion. When information is produced by a virtual device, the information is sent to all the device mapped to the virtual device only if the new value computed is different from the old one. However, if the virtual parameter is set as "steam", it means that the devices mapped to this parameter needs to send the computed information every tick, even if the computed value is not different from the old one. This is handy when information needs to be visualized depending on the time.
Here is how the `TerminalOscilloscope` defines a channel that will receive information to display later:

```python
class TerminalOscilloscope(VirtualDevice):
    data = VirtualParameter("data", stream=True, consumer=True)
    ...  # rest of the code
```

The virtual device channel `data` is declared as `consumer`, meaning that it will only consume data, not produce any from this attribute, and it requires all the values when they are produced (`stream=True`) even if it is not different from the previously computed one.
There is also two additional optinal parameters for `VirtualParameter`: `range` and `description`. `range` is used to give the lower and higher value that are accepted by this parameter. By default, the range is defined as `(None, None)`, which means that there is no limit for the min and the max. If you set values, the type of the values are important. If the min/low, max/high are `int`, then only integers are considered for the range.
The second optional parameter you can use is `description`, it's a textual description of the parameter. It's not directly used by Nallely, but it can be used by any app built using Nallely to help you give more information to the final user.

## Physical MIDI Devices

Nallely defines a simple way to declare a MIDI device in the form of code. This `MidiDevice` could be seen as a kind of proxy towards the real device. It is used to send notes/cc changes, and it also tracks automatically the values that are send to the physical device by each CC changes, or the CC changes sent from the physical device. This lets you later query controls of the device to know the last recorded value.

Midi devices are split in various modules, which are sections of the device. Each section then defines the set of buttons/controls that can be accessed and controled by Nallely.

### Pre-defined MIDI Devices

Nallely knows a first version of configuration for the Korg NTS-1, as well as a kind of dedicated configuration for the Akai MPD32.
Those devices comes with a specific configuration. If your device is setup differently, it's necessary to change the configuration. Depending on how you declared your device in the first place:
* if you wrote the configuration in pure Python, you need to modify the Python code directly to change the CC values and sections,
* if you generated the Python API code for your device from a CSV or YAML configuration, you need to adapt the CSV/YAML configuration and generate the code again (see sections below).

Here is how to start the NTS-1 device, or any `MidiDevice` based device:

```python
from nallely.devices import NTS1

try:
    nts1 = NTS1()
    ...  # From here the device is ready to use
    input("Press enter to stop...")
finally:
    stop_all_connected_devices()
```
We can access the internal sections/modules of the device programmatically by navigating in the attributes of the elements. You can either access a parameter of a section by using: `<device>.modules.<section_name>.<parameter_name>` or, if you generated the Python API code: `<device>.<section_name>.<parameter_name>`. Accessing a parameter of a section returns its currently tracked value:

```python
nts1.filter.cutoff  # access the cutoff of the filter section of the NTS-1
# or
nts1.modules.filter.cutoff  # access the cutoff of the filter secton of the NTS-1
print("Cutoff", nts1.filter.cutoff)

input("Tweak the cutoff button on your NTS1 and press enter...")

print("Cutoff", nts1.filter.cutoff)  # the value is automatically updated
```

You can send a specific value on a control simply by "setting" the value:

```python
nts1.filter.cutoff = 45  # sets the value of the cutoff to 45
# or
nts1.modules.filter.cutoff = 45  # sets the value of the cutoff to 45
```

Obviously, it's possible to map virtual devices or modules parameters to the MIDI device. Here is how to map the MPD32 to the NTS1:

```python
from nallely.devices import NTS1, MPD32

try:
    nts1 = NTS1()
    mpd32 = MPD32()  # loads this basic config, you might need to create your own for your device

    # We map the k1 button to the cutoff of the NTS1
    nts1.filter.cutoff = mpd32.buttons.k1

    # We map also k2 to the cutoff (now k1 and k2 are mapped), but using a scaler
    nts1.filter.cutoff = mpd32.buttons.k2.scale(min=20, max=100, method="log")
    input("Press enter to stop...")
finally:
    stop_all_connected_devices()
```

Some things to consider here: it's **not mandatory** that the CC value associated to `k1` and `cutoff` matches. Nallely does the translation when sending the value to the target control/device.
Also, please note that for each device, the part `filter.cutoff` and `buttons.k1`, ... depends on how the device is declared:

* for a MIDI device declared on the fly (no generated code), we access the internal modules using `.modules`, then we navigates to the section: e.g: `.filter` or `.buttons`, then we access the control: e.g: `.cutoff` or `.k1`, etc. For another device that would have other sections and controls, the only invariant part would be `<device>.modules`, the rest would depend on the declaration.
* for a MIDI device where you generated the code (or wrote the equivalent of the generated code, it's really simple to write), we access the internal section directly: `<device>.filter.cutoff` or `<device>.arp.length`. Obviously, the section and parameter part depends on the device you are using. When you are developping, if you use the generated Python API for a device, the auto-completion tells you the sections, then the parameters you can use.


#### Map keys and pads

The support for keys and pads is quite simple at the moment, here is how it's implemented for the NTS-1 and the MPD32 at the moment, and how you can associate pads to the keys of the NTS-1 or to other devices

```python
# associate all the pads to all the notes of the NTS-1
nts1.keys.notes = mpd32.pads[:]

# or:
nts1.modules.keys.notes = mpd32.modules.pads[:]

# or
nts1.keys[:] = mpd32.modules.pads[:]

# associate only the pad 36 to the notes of the NTS-1
nts1.keys.notes = mpd32.pads[36]

# associate only pads 36 to 44 to the notes of the NTS-1
nts1.keys.notes = mpd32.pads[36:45]
```

The way to assign a pad to something has slighly different syntax than for the controls. This time, we don't need to navigate until the underlying control of the section that owns the pads/keys, but we stop on the section, and we access the value of the pad/key that interests us.

It's also possible to map a pad to a control from another device:

```python
nts1.filter.cutoff = mpd32.pads[36]
```

In this case, the note of the pad/key will be sent as value for the control change to the target control. It's possible to map instead the velocity to the target control:

```python
nts1.filter.cutoff = mpd32.pads[36].velocity
```

This will send the value of the velocity to the target control. When dealing with the velocity, you have acces to 2 extra controls: `hold` and `latch`.

```python
nts1.filter.cutoff = mpd32.pads[36].velocity_hold
nts1.filter.cutoff = mpd32.pads[36].velocity_latch
```

In `hold` mode, only the `note_on` from the pads are considered, meaning that `note_off` with velocity 0 are not sent. When a pad/key is pressed, the value of the velocity is hold until the pad is hit again. After another press, the new velocity value is hold, etc.

In `latch` mode, the pad "remembers" the old value of the target CC before seting the new value. When the new value is set, then pressing again the pad/key will reset the CC value to the previously saved value.

Please note that scalers can also be applied to pads. Consequently, it's possible to fix a range of action for the pads. The way of doing it is by simply adding the `.scale(...)` method call after accessing the pad/key, or the velocity parameter.

### Generating a new configuration for a device

If your device is listed by the [MIDI CC & NRPN database](https://github.com/pencilresearch/midi) project, you can directly download the CSV file for your device, and use the `generator.py` script that is at the root of this repository. This script is quickly written and will be rewritten at some point, but right now it's enough for my use (KORG NTS-1 and Minilogue).

The script takes 2 parameters: the path towards the CSV file that contains the device MIDI config, and a name of a file where the Python code will be written:

```bash
nallely generate -i NTS1.csv -o KORG.py
```

This command line will read `NTS1.csv` and generates the Python API code for the NTS-1 device in the `KORG.py` file, and it will also generate a `NTS1.yaml` file which is the YAML representation of the transformed CSV.

### Define a new configuration for a device using YAML

The script is also able to read YAML configuration, that follow the same structure than the CSV, more or less, and generate the Python API code, exactly the same way the generator does it for CSV -> Python.

You can describe your device following this structure:

```yaml
manufacturer:
    device:
        section:
            parameter:
                cc: int
                description: str
                min: int
                max: int
                init: int
            parameter_2: 'keys_or_pads'
```

The different parts of the YAML are:
* `manufacturer`: the name of the manufacturer
* `device`: the name of the device, for better integration, it's nice if you can name it following the name that would appear in the MIDI port (e.g: for the NTS-1, the full name would be something like `NTS-1 digital kit:NTS-1 digital kit NTS-1 digital`, you can set the name to `NTS-1`, that would be enough)
* `section`: the name of the section
* `cc`: the control change number
* `min`: the min value of this parameter (usually 0)
* `max`: the max value of this parameter (usually 127)
* `description`: the description of the parameter
* `init`: the initial value of the parameter when you power the device
* if a `parameter` has `keys_or_pads` as value, the generator will include in the Python API a key/pad section.

Here is an excerpt about how the NTS-1 configuration is described in YAML:

```yaml
KORG:
  NTS-1:
    arpeggiator:
      intervals: {cc: 118, description: '', max: 127, min: 0}
      length: {cc: 119, description: '', max: 127, min: 0}
      pattern: {cc: 117, description: ARP pattern length, max: 127, min: 0}
    delay:
      depth: {cc: 31, description: '', max: 127, min: 0}
      mix: {cc: 33, description: '', max: 127, min: 0}
      time: {cc: 30, description: '', max: 127, min: 0}
    envelope_generator:
      attack: {cc: 16, description: Sets the time required for the EG to reach its
          maximum level once a note is played, max: 127, min: 0}
      release: {cc: 19, description: Sets the time required, max: 127, min: 0}
    keys:
      notes: 'keys_or_pads'
    # ...
```

Once you have your YAML configuration for your device, you can simply run (here for the NTS-1):

```bash
nallely generate -i NTS1.yaml -o KORG.py
```

and you can directly use it:

```python
from KORG import NTS1

nts1 = NTS1()  # here it supposes that the name of the port will contain "NTS-1"

# you can target a specific device changing the name
nts1 = NTS1(device_name="myname")  # it will look to map the device to a port that contains "myname"
```

Then to run the script, you can pass again by `nallely` cli:

```bash
nallely run -i myscript.py
```

### Define a new configuration for a device programmatically

Defining a new device and a configuration is done by subclassing `MidiDevice` and `Module`. The `MidiDevice` class is the base class that launch all the MIDI glue using `mido` and `rtmidi`. The `Module` base class lets you define the sections of your device, and then `ModuleParameter` and `ModulePadsOrKeys` are descriptors that lets you define the various controls of your device.

To help you building your configuration, you can start with this simple script:

```python
import nallely

try:
    device = nallely.MidiDevice("MyDevice", debug=True)

    input()
finally:
    nallely.stop_all_connected_devices()
```

This snippet creates an instance of `MidiDevice` and will look for a device named `MyDevice` (the name doesn't have to be exact, it can be a sub string of the full name), connects to it, and pass in `debug` mode. In `debug` mode, the device logs all the informations that it receives from the device. This way, you can see what CC value and channel is used for a specific control or pad/key.

Once you have those informations, you can tell Nallely about your device. Here is an example about how it's done for the NTS-1:

```python
...  # other sections before

@dataclass
class FilterSection(Module):
    type = ModuleParameter(42)
    cutoff = ModuleParameter(43)
    resonance = ModuleParameter(44)
    sweep_depth = ModuleParameter(45)
    sweep_rate = ModuleParameter(46)

@dataclass
class ReverbSection(Module):
    type = ModuleParameter(90)
    time = ModuleParameter(34)
    depth = ModuleParameter(35)
    mix = ModuleParameter(36, init_value=128 // 2)

@dataclass
class KeysSection(Module):
    notes = ModulePadsOrKeys()

class NTS1(MidiDevice):
    osc: OSCSection
    filter: FilterSection
    eg: EGSection
    mod: ModSection
    delay: DelaySection
    reverb: ReverbSection
    arp: ArpSection
    keys: KeysSection

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(*args, device_name=device_name or "NTS-1", **kwargs)
```

We can see that the `FilterSection` inherits from `Module`, then, it defines a bunch of parameters, which are instances of `ModuleParameter` with the CC value associated. For example, in this configuration, we can see that `type` is the CC `43`.
As you can see in the `ReverbSection`, there is a way to set a `init_value` for each parameter. This value is the one that is considered as initial value for the device. This value can be important depending on your MIDI device as it will consider it as the equivalent of the value that is supposed to be the one of the physical device when you power it. As Nallely is keeping track of the values for each parameter automatically, it needs to have a first value to consider that this is the "normal startup value" and to not impact preset when they are saved from a freshly powered MIDI device. The default value of the `init_value` parameter is `0`. In this example, for the `ReverbSection`, the `mix` is explicitally set to `64` as with the NTS-1, the mix for this section starts in the middle of the [0..127] CC MIDI range.
In complement, there is two additional parameters that can be passed to a `ModulParameter`. They are optionals, so you don't have to deal with them directly. On, `range` gives the lower and the higher value that is accepted by the parameter. By default for `ModuleParameter` the value is `(0, 127)`. If you set values, the type of the values are important. If the min/low, max/high are `int`, then only integers are considered for the range.
The other parameter is `description`, you can use this to give a textual description about the parameter, what are the interesting values (if there is some). This is not directly used by Nallely, but it can be used if you develop that uses Nallely as the underlying library.

The keys section is declared using an instance of `ModulePadsOrKeys`.
Once you have all the section, you just put them at the class level of your `MidiDevice` by associating a name to a type.

You can also see that in the initializer of the class, the name of the device is passed to target explicitally the NTS-1 device all the time. If various devices contains `NTS-1` in the name, the first one will be selected. To target a specific one, the full name must be used.

That's all. Following this configuration, we can now access the various sections and controls:

```python
nts1 = NTS1()
nts1.modules.reverb.time = 15

l = LFO(waveform="triangle", min_value=1, max_value=10, speed=0.25)
l.start()

nts1.modules.reverb.time = l  #  we map an LFO to the reverb time
```

#### Going further with your device configuration

This configuration we declared works, and lets you use your newly declarated device this way:

```python
nts1 = NTS1()
nts1.modules.filter.cutoff = 15
```

but doesn't let you access the parameters using `<device>.<section>.<parameter>` nor enables auto-completion for your code editor. If you want to enables thoses, you need to add some `@property` on the class of your device, think them as "typed shortcuts" to access sections and parameters:

```python
...  # sections declared before, you need to have them declared

class NTS1(MidiDevice):
    osc: OSCSection        # type: ignore <- this is just so typecheckers don't complain
    filter: FilterSection  # type: ignore
    eg: EGSection          # type: ignore
    mod: ModSection        # type: ignore
    delay: DelaySection    # type: ignore
    reverb: ReverbSection  # type: ignore
    arp: ArpSection        # type: ignore
    keys: KeysSection      # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(*args, device_name=device_name or "NTS-1", **kwargs)

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    ... # etc
```

By the way, you don't have to create a new class to define your device, you can also do it by creating a new instance of `MidiDevice` and gives the sections in a dict to the class initializer:

```python
...  # sections declared before, you need to have them declared

nts1 = MidiDevice(device_name="NTS-1", modules_descr={
    "osc": OSCSection,
    "filter": FilterSection,
    "eg": EGSection,
    "mod": ModSection,
    "delay": DelaySection,
    "reverb": ReverbSection,
    "arp": ArpSection,
    "keys": KeySection
})
```

You can also wrap this way of declaring the device in a class, and set `@property` if you want to have auto-completion in your code editor:

```python
# you can wrap it in a class also if you want and provide some @property if you want
class NTS1(MidiDevice):
    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args,
            device_name=device_name or "NTS-1",
            modules_descr={
                "osc": OSCSection,
                "filter": FilterSection,
                "eg": EGSection,
                "mod": ModSection,
                "delay": DelaySection,
                "reverb": ReverbSection,
                "arp": ArpSection,
                "keys": KeySection
            }
            **kwargs,
        )

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    ... # etc
```

Please note that while it's possible to write your device configuration in Python directly, it's more recommended to pass by the YAML configuration and the code generator which will generates the same code that you would wrote, unless you really want to modify the classes to introduce new features or facilities for the Python API code of your device. And even, you could generate the API code for your device, then modify the generated code by hand.

## How to map components together

Now that we know how to create virtual devices, how to create MIDI devices, let's see how we can map them together.

### Map virtual device to physical devices

Mapping a virtual device to a MIDI device is done by navigating towards the control of the target device, and assigning to it the virtual device directly, or the special VirtualParameter of the virtual device.

```python
l = LFO(waveform="triangle", min_value=1, max_value=10, speed=0.25)
l.start()

# We map the output of the LFO to the cutoff of the NTS-1
nts1.filter.cutoff = l

# We map the speed of the LFO to the cutoff of the NTS-1
nts1.filter.cutoff = l.speed_cv
```

Note that you can start the LFO before or after binding it to a target device. Also, the assignation is cumulative. Assigning two devices/controls to a control will not override it, it will add them. To remove a binding, you need to use the `-=` operation:

```python
# We bind the speed
nts1.filter.cutoff = l.speed_cv

# We map the output of the LFO
nts1.filter.cutoff = l

# the cutoff is driven now by two "controls"
# we remove one
nts1.filter.cutoff -= l.speed_cv
```

### Map physical devices to virtual devices

You can control your virtual devices from physical ones the same way you would to associate virtual to physical ones:

```python
l = LFO(waveform="triangle", min_value=1, max_value=10, speed=0.25)
l.start()

mpd32 = MPD32()
l.speed_cv = mpd32.buttons.k1
l.waveform_cv = mpd32.buttons.k2
```

In this example, we map `k1` from the MPD32 to the speed of the LFO, and `k2` to the waveform.

### Map multiple sources to a same target

Nallely lets you associate multiple sources to the same target, and the same source to multiple targets.

You can associate multiple sources to a target simply by assigning it:

```python
nts1.filter.cutoff = mpd32.buttons.k1
nts1.filter.cutoff = mpd32.buttons.k2

l = LFO(waveform="triangle", min_value=10, max_value=100, speed=0.25)
l.start()
nts1.filter.cutoff = l
```
In this snipped the cutoff is associated to `k1`, `k2`, and to an LFO.

You can also assign the same source to multiple target to change multiple CCs at the same time from the same control:

```python
nts1.filter.cutoff = mpd32.buttons.k1
nts1.filter.resonance = mpd32.buttons.k1
nts1.delay.time = mpd32.buttons.k1.scale(min=10, max=50, method="log")
```

This snippet maps `k1` to the cutoff, the resonance, and the delay time. It also applies a scaler on `k1` to have a value for the delay that will be between `10` and `50`.


### Map Python function to MIDI device

Nallely lets you map Python functions to the controls/keys/pads of `MidiDevices`. The syntax is more or less equivalent to the one in the previous section, but "in reverse" (at least it feels like this to me). Basically, you tell the device control/pad/key what it will trigger by assigning the function to the control/pad/key. Here is an example using the MPD32 configuration we already used in the documentation:

```python
mpd32 = MPD32()

# We map a function to k1
foo = lambda value, ctx: print("Received", value, "with context", ctx)
mpd32.buttons.k1 = foo
# We map a function to pad 36
mpd32.pads[36] = foo

# We map a function to pad 36 velocity
mpd32.pads[36].velocity = foo

# We map a function to pad 36 velocity in "hold" mode
mpd32.pads[36].velocity_hold = foo
```

The function that is passed as callback **must** have 2 parameters: the first parameter (here `value`) is the value that will be received by the function, while the second one (named `ctx` here), is a context with more informations. Basically for pads/keys, in note mode, you'll have the velocity inside the context, in velocity mode, you'll have the note.

To unmap the function, you can use then the `-=` operator, exactly the same way it's done in the previous sections:

```python
mpd32.buttons.k1 -= foo
mpd32.pads[36] -= foo
mpd32.pads[36].velocity -= foo  # removes the callback for "velocity"
mpd32.pads[36].velocity_hold -= foo  # removes the callback for "velocity hold"
```

Please note that when you attached a callback to the velocity, you need to explicitally express that you want to remove the function from `.velocity`. Otherwise, it will remove the callback for the `"note"` mode (normal non-velocity mode).

### Remove mapping

As seen in the previous section, to remove a mapping, you need to use the `-=` operator. Basically, it's the inverse operation than the `=` that creates the mapping.

```python
l = LFO(waveform="triangle", min_value=1, max_value=10, speed=0.25)
l.start()

nts1.filter.cutoff = mpd32.buttons.k1
l.waveform_cv = mpd32.buttons.k2

input("Press enter to remove the bindings...")

nts1.filter.cutoff -= mpd32.buttons.k1
l.waveform_cv -= mpd32.buttons.k2
```

### Scalers

Scalers let you define a new range for your controls/pads or virtual devices. This allows you to have a same control that can drive multiple targets with different values that makes sense for the target in question. This becomes especially handy for animation and visuals as often, the amplitude varation for thos is sometimes between 0 and 1.

You can create a scaler from any control, any pad, any virtual device, or any virtual parameter of a virtual device. If you want to restrict the output to a specific range, the syntax is the following:

```python
mymodule.access.to.the.control.scale(min=..., max=..., method=...)
```
`min` and `max` represent the lower and upper bound of the new scale, and `method` the kind of method that need to be applied. By default, `method` is `"lin"`.

#### Auto scaler

If the parameter you are binding to has a `range` specificed and that you want to adapt from the source parameter (the parameter that will feed the receiver, typically, the parameter from the right side of the assignment when you bind them together), you can ask it to auto-scale. This means that you don't have to set manually the `min` and `max` for your scaler, you can just let it adapt itself depending on the source range and the target range:

```python
# Let's assume we have a virtual device with a virtual parameter declared as [0.0001, 1]
vdevice.param_cv = mpd32.buttons.k1.scale()
```

If the `min` and `max` are not set, the auto-scale is activated. By default, the method used is `"lin"`, if you want to use `"log"`, you can just pass it as parameter. Be careful that in this configuration, auto-scale with `"log"` only works if the target parameter defines a closed range, no open range is accepted:

```python
# Let's assume we have a virtual device with a virtual parameter declared as [0.0001, 1]
vdevice.param_cv = mpd32.buttons.k1.scale(method="log")
```

## Move computation to other process/machine using the websocket server

See the example at the root of the repository: `visual-spiral.py` to see how to start the websocket server. While running it the first time, the server places the devices that wants to send information to a specific external module in a waiting room until the external module connects. When the external module connects, it auto-configure itself by registering itself in the websocket server, and declare all the parameters that can be accessed by other devices.

#### External module auto-registration

See `spiral.html`

#### Send information to an external module

See `visual-spiral.py` and `external_scope.py`

#### Send information from an external module to any device
// Soon

## Dynamically explore running devices/modules
