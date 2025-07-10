<!-- BEGIN ARISE ------------------------------
Title:: "How to make Nallely understand new MIDI devices"

Author:: "Dr. Schlange"
Description:: "How to add a new MIDI device in Nallely"
Language:: "en"
Published Date:: "2025-07-10"
Modified Date:: "2025-07-10"

---- END ARISE \\ DO NOT MODIFY THIS LINE ---->

# How to add a new MIDI device in Nallely

**The article is still a draft**

By default, Nallely understands few MIDI devices:

* Korg NTS-1,
* Korg Minilogue,
* Akai MPD32 (specific configuration).

This doesn't mean that Nallely cannot understand other MIDI devices, it just means that we need to manually add new MIDI devices to Nallely. Nallely works by reflecting on an abstraction of the MIDI device through a Python API that is dedicated to each MIDI device. The Python API is an internal Python DSL that allows you to describe in a declarative way the MIDI device. All the goal to make a new MIDI device understood by Nallely is to produce this Python API. There is basically 3 ways of doing it:

1. generate the Python API using Nallely from a YAML description,
2. generate the Python API using Nallely from a CSV description coming from the [MIDI CC & NRPN database](https://midi.guide/),
3. write the Python API by hand.

In this article, we make Nallely understand the Roland S-1 mini synth. We review the three methods so you can decide which one fits you the best. For each method we show a brief overview of the process - "from a file to a living neuron in Nallely" - we then show the specific syntaxes involved in the form of a small tutorial, and we finally reflect on the key points related to this method. 

**NOTE**: Among the three methods, there is no "best method". Each of them is valid, it's just a matter of taste, but the one that generates from the CSV provided by the `MIDI CC & NRPN database` might require a little bit of attention as - despite the efforts made by the authors to harmonize the descriptions - some CSV descriptions are not entirely well formed.

**Limitations**: the current version of the Python internal DSL for describing MIDI devices supports LSB CC description, keyboard, and pitchwheel. Currently MSB CC and sysex messages are not supported, but they will in future version. More importantly, the Python internal DSL to describe MIDI devices will always be retro compatible. If for some reasons, in the future, the internal DSL changes, automatic converters will be provided (it should be only a matter of doing AST transformation, so not a big deal). 

## Generate the Python API from a YAML description

This method is perhaps the simplest in the sense that you just have to write a YAML file, by referring to the MIDI implementation chart of your device. In this section we focus on the Roland S-1. We first describe the process at coarse granularity, then we write a first incomplete version that we directly integrate into Nallely, then we interate on our first version to get the full MIDI device's Python API generated. Finally, we conclude over this methods, the gotchas and important points to consider. 

### Process overview

This method considers as entry point a YAML description. This description is the main and only artifact that needs to be written by hand. This YAML description is then fed to the API code generator provided by Nallely, which will produce the Python API in a dedicated Python module which can be directly added to a Nallely session.

```
YAML file --(nallely generate)--> dedicated Python API
```

If some adjustments needs to be done, the generated Python module shouldn't be modified by hand, only the YAML description should, then the code should be generated again using Nallely.

#### YAML format understood by Nallely 

Nallely uses a specific structured format for the YAML description as we can see in the following snippet. 

```yaml
manufacturer name:
MIDI device name:
section 1:
parameter name:
cc:
description:
min:
max:
init:
```

The `manufacturer name` is the name of the company that built the device. This entry is currently not really used, but will be in the future. It will help to sort various devices and search them by manufacturer name (for example). If you have multiple devices of this brand, it's better to use the same name each time, just for harmony purpose. 

As sub-section of the `manufacturer name`, we have the device name. This information is used in the generated code to try to automatically connect the device to a MIDI I/O port. To choose this name properly, if you use MIDI-USB, the best is to check the device name when connected to you machine and use a fragment of this name as the `device name`. 

When you have described the `manufacturer name` and the `device name`, then you can add multiple sections, and in each section, multiple `parameter names` configured by:

* their CC number, 
* their min and max value (default values are `0` for min and and `127` for max),
* their init value (which value has this parameter when the unit is freshly powered, default value is `0`)
* their description. 

Some of those configurations entry are optional, the only important mandatory one is the `CC` number. The other can be omitted if they are not different from the default values. 

### A first version for the Roland S-1

When we write a new YAML description (configuration), we need to have first the MIDI implementation chart. This is something that is provided by all manufacturer about their product, if the device supports MIDI, obviously. For the Roland S-1, we can find the implementation chart [here in html]() in their website.

Now that we have a implementation chart, we need to read it a little bit to check how it's structured and to decide what are the different sections that we should add. All MIDI implementation charts are not structured the same, some already have sections for the parameters, others no (usually they don't), so it's your responsibility to decide in which section you want to sort your parameters and how you want to name them. 

In the implementation chart for the S-1, we can quickly identify at least a section for the oscillators. For a first version, we will then only add two sections: one for the oscillators, and a section that is never explicitly added in those charts (as implicit) the keys section.

Here is a first small version of the YAML and description for Roland S-1. 

```yaml
Roland:
S-1:
oscillators:

keys:
notes: "keys_or_pads"
pitchwheel: "pitchwheel"
```

As you probably notice, the parameters in the `keys` section are a little bit special. The `notes` parameter is not defined by a `CC`, but is defined by `"keys_or_pads`", and `pitchwheel` is defined by `"pitchwheel"`. These are specific parameters. Nallely will know how to generate the right code for the keys to let you patch later either the full keyboard, or specific keys. The pitchwheel will be generated as a special element also, to let you patch the pitchwheel. Those are necessary as, under the hood they imply:

* different MIDI messages that need to be sent to the MIDI device,
* different hooks that needs to be injected in the interruption table, 
* and it also gives more information about the parameter, which will imply a specific callback compilation at run time when those ports are patched with any other port.

Now that we have a first version, even minimal, we can generate the code using Nallely and we can directly add it to a Nallely session:

```
nallely generate -i s1.yaml -o s1.py # generate the API in s1.py
nallely run -l s1.py # add it to a new session
```

That's it, the device is now here and working, we can start to use it, patch it with virtual devices, and patch it with other MIDI devices. 


## Generate the Python API from a CVS description

### Overview 

### With a well formatted CSV 

### With a badly formatted CSV

### Bootstrap from CSV, work on YAML

## Write the Python API by hand

### Process overview

### Conclusion, gotchas 

This way of doing, while not being complicated, is perhaps the less recommended. The internal Python DSL is not hard to understand and to use, but it feels just a little bit tedious to me to have to


## What could be improved? 

### Make it interactive?

### Automatic fetch configuration files from a remote DB?