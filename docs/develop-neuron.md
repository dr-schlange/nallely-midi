# How to develop your own neuron (module)

This document describes how to develop your own processing neuron that will be integrated seemlessly in Nallely. The document focuses:

* on the internal API to let you write your own neuron in Python,
* on how you can write neurons directly from TrevorUI,
* on how to write an external neuron in JS (could be in any technology),
* how to fine tune, debug and troubleshoot neurons from the UI, as well as how to deal with some issues later if your Nallely's memory get corrupted.

One important note, the general flow of coding a new neuron is impacted by the solution you'll choose:

1. developing from a local code editor implies that you'll be in a: (code -> stop the session -> restart the session) loop;
2. developing from TrevorUI implies that you'll be in a Smalltalk-like live-programming context: (code -> save -> impacts the running system) loop.

The main difference being that in the second case, you'll not need to restart the system, and your saved modifications on your new neuron will directly impact the running system and the running patch without loosing the neuron identity. The instance will be migrated to the new class of your neuron without destroying it or reseting the state (the system tries to not reset the state, but sometimes it has to reset it partially).

**NOTE:** in this document, we use either the term module or neuron to refer to the module, the terminologies are considered interchangeable here.

Before starting, there is things that needs to be remembered about the neurons/modules:

* each module/neuron instance lives in its own independent thread;
* there is no global clock, each neuron/module runs at its own speed;
* each module/neuron decides of the semantic hold by an incoming/outgoing signal on a port;
* neurons/modules can be purely reactive, purely continuous or hybrid;
* neurons/modules communicates by async message send through a channel;
* synchronization is not enforced and happens because it happens;
* ports of a module/neuron can be input, output or both, the code you write determines if they will only receive information, send information or do both;
* any kind of ports is patchaeable with any other port in the system, even on the same module/neuron instance;
* ports usually defines a range in which they operate, but you can define ports that are unbound;
* sending a value on a port sends it directly, not on the next tick or something;
* by default, each module/neuron has an `output_cv` port that can be disabled;
* modules can purely consume data, produce data or consume/produce data;
* feedback loops are supported by design and are not considered corner-cases;
* neurons/modules can create new instances of modules/neurons, patch itself or other neurons/modules, change the topology of the patch at run time, etc;
* neurons/modules have their own backpressure solution, you don't need to care about how the module/neuron will consume data;
* the neuron/module execution model is an asynchroneous real-time hybrid (reactive/continuous) actor model.

Finally, the most important rule: when you write a neuron, you don't need to care about how the neuron will interact with other modules. The overall behavior and transformation of your signal will emerge from the way you patch the modules. You need to write the neuron by placing yourself at a specific point in time and asking yourself "if I'm a neuron, what should I do when X happens" (reactive neurons), and "if I'm a neuron, what should I compute and produce now" (continuous). Please note that the term "continuous" is a little bit exagerated, it's not continuous as in an analog system, but it's used here in opposition to "reactive" to indicate that the computation will happen regardless of if a neuron receives a message or not.

## Writing a neuron in Python

In this section, we don't consider the development of a neuron from the UI, but by using a code editor on your machine. The overall workflow is the following:

```
code -> restart the system to include the modifications
```

This is for the general high-level flow, but at a lower-level, there is again a small distinction. You can either write the neuron:

1. all manually, by extending the `VirtualDevice` class and describing your module ports by creating `VirtualParameter` instances at the class level;
2. or you can generate this boilerplate code from a higher-level small DSL embedded in the docstring of your module class.

In this section, we will focus on the second case. The main flow will then be:

1. write the docstring of your neuron/module;
2. generates the skeleton;
3. write the behavior of your neuron/module;
4. test your neuron/modules in a session.

**NOTE:** once the skeleton is generated, the module/neuron is already in a state where it can be integrated in a session, you can create instances of it, patch it, but it will just do nothing.


## Docstring DSL to describe your module

Nallely internal API to create modules/neurons relies on the static declaration of what's a module. This declaration is written in the docstring of the module and serves as unified documentation and as source of the boilerplate code generation. Let's take a look about how the DSL in the docstring looks like, how to generate the boilerplate code, then how to integrate the fresh neuron/module in Nallely.

```python
class MyNeuron:
    """MyNeuron

    MyNeuron description in plain english, you can write whatever you want.

    inputs:
    * an_input_port_cv [lower_bound, upper_bound] init=opt_init_value opt_conv <opt_reactive_edges>: port_description
    * an_other_input_port_cv [lower_bound, upper_bound] init=opt_init_value opt_conv <opt_reactive_edges>: port_description

    outputs:
    * an_output_port_cv [lower_bound, upper_bound]: port description
    * an_other_output_port_cv [lower_bound, upper_bound]: port description

    type: (reactive, continuous, hybrid)
    category: (category)
    # meta: disable default output
    """
```

The DSL relies on 3 major sections: an `inputs` section, an `outputs` section and a last section that defines meta informations. As you perhaps remember, in the beginning of the document, we said that "ports are either input, output or both". The separation that is done here between inputs and outputs is mainly for the end-user documentation, but doesn't have a strong impact on the code that will be generated. The only difference between inputs and outputs in the DSL is what you can write about them in the DSL and the generation order.
In the DSL, `#` denotes a comment and will not be interpreted by the code generator later. The `inputs` section defines a list of "input" ports. Each port is defined on a new line and starts with a `*`, followed by the name of the port (tradition wants it to be postfixed with `_cv`), followed then by the range of the port (can be the bounds or a set of accepted values), an optional initial value (default value) for the port, then an optional converted for the incoming value, an optional list of the edges the port should react to, and finally the description of the port. The "output" section follows the same pattern, but doesn't include the default value/converted/edges sections. If you need to define a port that is input and output, it would be more logical to describe it in the `inputs` section.
Finally, the last section defines meta-data that is more about information transmited to the end-user than something that is used for code generation. The `type` entry defines if the neuron/module is `reactive`, `continuous` or `hybrid`. The `category` entry defines the kind of module, while the last `meta` entry defines if the default output should be disabled or not.

Lets see the docstring for a simple pitch shifter module/neuron that will takes as input a note that we will consider on the MIDI range (0, 127), then shift its value of few notes.

```python
class PitchShifter:
    """Pitch Shifter

    This module takes a value as input, considers it as a note, and produces a new note shifted positively or negatively of few notes.

    inputs:
    * input_cv [0, 127] <any>: where the values come in
    * shift_cv [-48, 48] init=0 round: shift value (how many steps the original note is shifted)

    outputs:

    type: reactive
    category: shifter
    """
```

Our pitch shifter is defined with 2 inputs: `input_cv` and `shift_cv`, which have different ranges. The input is declared over a range of `0, 127`, and indicates that the port will react on `any` edge arriving on the port. The values that are admitted for the reactive edges are:

* `rising` for a transition from 0 to non-0 value;
* `falling` for a transition from non-0 to 0 value;
* `increase` for an increasing transition, i.e: going from a value X to Y where Y > X;
* `decrease` for a decreasing transition, i.e: going from a value X to Y where Y < X;
* `flat` for a value that maintains itself, i.e: going from a value X to Y where X = Y;
* `any` for any transition, i.e: going from a value X to Y without any condition;
* `both` for a transition where the new value is different from the previous one, i.e: going from a value X to Y where X != Y.

The `shift_cv` port declares that it will operate over the range `-48, 48`, that the default value will be `0` and that the incoming values will be converted as `int` values by being rounded. This port doesn't declare that it will react to any incoming edge. Regarding the conversion policies, there is currently 3 different conversions policies you can adopt:

* `round`: will round the input value to an `int` using Python `round(...)` function;
* `>0`: will round the input value to the range upper bound when the received value is greater than 0;
* `!=0`: will round theinput value to the range upper bound when the received value is different from 0.

We can also notice that the `outputs` section is empty, it's because by default neurons/modules have a `output_cv` port which is defined over `0, 127`, which is the range we will work on.

**NOTE:** you don't have to track notes, track old/new values (unless you want to do something with), all is done automatically.

## Generate the skeleton of the neuron

Now that we have the neuron/module docstring that is written, we can generate the code for it. To do so, we need to add a decorator on the class that we want to generate the code for, then to just either import the Python module that defines our class module/neuron, or to execute it on the command line. First, we will import and add the decorator onto the `PitchShifter` class that we wrote in a file named `my_neuron.py`.

```python
from nallely.codegen import gencode


@gencode(keep_decorator=True)
class PitchShifter:
    """Pitch Shifter

    This module takes a value as input, considers it as a note, and produces a new note shifted positively or negatively of few notes.

    inputs:
    * input_cv [0, 127] <any>: where the values come in
    * shift_cv [-48, 48] init=0 round: shift value (how many steps the original note is shifted)

    outputs:

    type: reactive
    category: shifter
    """
```

The decorator will perform multiple things: on import of the Python module (file) that contains the neuron code, it will add the right Nallely imports, alter the class hierachie by introducing the necessary super class, generate the ports following their declaration in the docstring, generate the necessary reactive methods, remove the `gencode` decorator unless specified otherwise (using `keep_decorator=True`).

To launch then the code generation, just execute:

```bash
python my_neuron.py
```

The resulting code will be the following:

```python
from nallely import VirtualDevice, VirtualParameter, on
from nallely.codegen import gencode


@gencode(keep_decorator=True)
class PitchShifter(VirtualDevice):
    """Pitch Shifter

    This module takes a value as input, considers it as a note, and produces a new note shifted positively or negatively of few notes.

    inputs:
    * input_cv [0, 127] <any>: where the values come in
    * shift_cv [-48, 48] init=0 round: shift value (how many steps the original note is shifted)

    outputs:

    type: reactive
    category: shifter
    """

    input_cv = VirtualParameter(name="input", range=(0.0, 127.0))
    shift_cv = VirtualParameter(
        name="shift", range=(-48.0, 48.0), conversion_policy="round", default=0.0
    )

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        ...
```

The neuron generated in this state is already integreable in Nallely. You can start a new session including the new neuron, serving the web-ui and TrevorUI by running:

```bash
nallely run --with-trevor --serve-ui -l my_neuron.py
```

**NOTE:** The code generator is smart. If you modify the generated code, it will consider and keep your modifications. If you modify the declaration in the docstring, it will modify the modified inputs/outputs, generate the new inputs/outputs, generate the new methods for the edges, but will not remove code that you would have wrote of coming from a previous generation to avoid to loose content. This means that if you create a port `a_cv`, then that you rename it in `b_cv`, the generated `VirtualParameter` named `a_cv` will still be present in your generated code, deleting it is your reponsibility.


## Code the actual behavior of your neuron/module

Now that we have the skeleton of the module, we need to actually code the behavior. We are developing a purely reactive neuron, that means that the transformed note will be called directly produced from when a note will actually be received on the port. If we follow the mental model that "I'm a neuron, what do I do when I receive an information on the input port", then the only action that we have to do is to sum the `shift`. The method that reacts to the `any` edge then becomes:

```python
@on(input_cv, edge="any")
def on_input_any(self, value, ctx):
    return value + self.shift
```

That's pretty much it. This method, integrated to the neuron, produces a perfectly valid and working neuron.
We simply return the `value` arriving on the port with the `shift` of the module. This `shift` value is accessible from the `self.shift` instance variable. This variable is automatically created and kept up to date by the system following the successive arrival of new values. You don't have to handle it yourself, but you can alter it if you need or want, there is no restriction.

If we test this neuron, it will work perfectly, you can already patch it in the system, patch it also with MIDI devices picking notes from your MIDI controller or MIDI buttons/sliders, associate them to the `input_cv` port, and redirecting the `output_cv` port to a MIDI synth, or the various scopes that are present in TrevorUI (if you use the UI).

However, even if this neuron is working, if you listen well to the sound after you release a key (for example), you'll hear a kind of very low note adding unpeasant noise. This is important and due to the fact that `0` as a special meaning that is kind of enforced by default. By default, the `0` is considered as an universal "no note" information. When you release the key, Nallely tracks the notes you played, and generates here a `0` to indicate that one of the held note is released. This translates by the fact of receiving a `0` at the neuron level. In our case, it means that this leads to the execution of `0 + self.shift` at some point, and if we have a shift of `5`, it will then produces a note: the note `5`. This note is really low and there is almost no chance your MIDI synth is actually dealing with those, so it produces this low-pitch note. To overcome that, we just need to either transmit the `0` information, or to return `None`:

* returning `0` would mean that we transmit the information that potentially a note have been released;
* returning `None` would mean that we need to do "nothing", and that no information will be sent on the port to the destination.

We consider here that it's more important to transmit the `0` information as we are in a neuron that will handle notes. The method evolves into:

```python
@on(input_cv, edge="any")
def on_input_any(self, value, ctx):
    if value == 0:
        return 0
    return value + self.shift
```

Included in the whole code of your `PitchShifter` neuron, here is the result:

```python
class PitchShifter(VirtualDevice):
    """Pitch Shifter

    This module takes a value as input, considers it as a note, and produces a new note shifted positively or negatively of few notes.

    inputs:
    * input_cv [0, 127] <any>: where the values come in
    * shift_cv [-48, 48] init=0 round: shift value (how many steps the original note is shifted)

    outputs:

    type: reactive
    category: shifter
    """

    input_cv = VirtualParameter(name="input", range=(0.0, 127.0))
    shift_cv = VirtualParameter(
        name="shift", range=(-48.0, 48.0), conversion_policy="round", default=0.0
    )

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        if value == 0:
            return 0
        return value + self.shift
```

That's it, we just created a first simple neuron in Nallely, starting from the docstring specification, declaring the ports and to what they react, then generating the skeleton of the body, and finally implementing the reactive method that produces a new note when one is arriving. We also saw that the `0` has a special meaning and that depending on what you do, it might be interesting to consider it.


### Can I use the module in a pure programmatic way?

You can definitely use the module in a pure programmatic way, it's not necessary to pass by the UI to create instances and patch your freshly created module. Here is a snippet of code that'll show you how you can create an instance of the module with some existing values, how you can then alter programmatically parameters of your neuron.

```python
from nallely import LFO
from my_neuron import PitchShifter
import time

shifter = PitchShifter(shift=5)
shifter.start()

# We create a random LFO with a speed of 1Hz
lfo = LFO(waveform="random", speed=1)
lfo.start()

# We patch it to the input of the shifter
shifter.input_cv = lfo
# or alternative notation
# shifter.input_cv = lfo.output_cv

time.sleep(5)  # we let the system run for 5 seconds

# We set a new value for the "shift"
shifter.set_parameter("shift", 12)

time.sleep(5)  # we let the system run for 5 more seconds

# We patch the output of the random LFO to the
# shift_cv port, and we map the output of the LFO to
# the -12, 12 range
shifter.shift_cv = lfo.output_cv.scale(-12, 12)

# Lets also include a feedback loop, just because
# now the output of the shifter will impact the speed of the LFO
# which will impact the input of the shifter, that will impact the
# speed of the LFO, etc
lfo.speed_cv = shifter.output_cv.scale(0.1, 5)
```

What's important to take from there:

* creating an instance of a neuron looks like creating a Python instance, there is no difference in a syntax point of view;
* starting a neuron actually means "starting the thread that represents the instance of the neuron";
* you can initialize a neuron with keyword arguments directly in the constructor, they are derived from the `VirtualParameter`;
* using the assignment operation between ports creates a channel between them, it doesn't affect a value to the port;
* passing a value to a port of a neuron is done using `set_parameter(...)`;
* values are cross-domain, we have the output of the LFO that can either represent a variation of the `shift` value, or the shifted note from the `shifter` can be linked to the `speed` of the LFO;
* there is no special syntax for feedback loops, you just patch the system;
* when assigning a neuron to a port, it's not necessary to reference `output_cv` if that's the default output that will be used;
* scaling values allows you to remap ranges between ports.

You can either run your script in a standalone fashion:

```bash
python my_script.py
```

But it's recommended to actually uses Nallely from the command line:

```bash
nallely run -i my_script.py
```

Running the script using the runner introduces automatically the cleanup logic and blocking logic to avoid to finish the main thread while reaching the end of the script. Don't forget that the execution model is purely asynchroneous, thus, none of the creation of the LFO, the PitchShifter, patching and setting values are non-blocking.


## Going further, having more complex behaviors with your neuron

This section describes various points that lets you be more expressive with your neurons. The section is split in multiple sub-sections, each of them covering specific points of the execution model and the semantic of neurons in Nallely. Will be covered:

* how to make you neuron sleep without blocking the reception of messages;
* how to program ports that are input and output;
* how to yield values on a specific output port, or multiple specific ports;
* how to yield multiple values on a specific port or multiple ports from inside the neuron;
* how to create a purely continuous neuron;
* how to create an hybrid neuron and details about execution order between reactive and continuous methods;
* what's the `ctx`, how to use it, or not use it;
* how to create ports that accept multiple predefined values (drop-down like);
* feedback loops through the example of an integrator, jitters, pinging and poking the running system;
* how to test your neurons using BDD.

### Make your neuron sleep in a non-blocking way and define ports that are input and output

As stated in the beginning of the document, there is no global clock, that means that time can be interpreted as relative to each neuron, or "global" if we consider the wall-clock time. Nallely doesn't enforce the way you want to look at the time, it entirely depends on the neuron and how you want to manipulate it. In this section we will see how we can make a neuron sleep for a specific time and triggers of multiple sleep are handled. To highlight the behavior and the API around sleep, we are going to develop a purely reactive neuron that can create delayed chain reactions by considering ports that are input and output at the same time.

#### A delayed reaction chain neuron

This neuron will expose 4 differents i/o ports that will forward the received value after a parametrable delay. The behavior of such a neuron implements a kind of delayed push-sub pattern. As each port is input and output, even if each port is independent, you can later patch the first i/o into the second i/o, then the second in the third i/o, etc, creating a longer delay line that will propagate the value received step after step.
To create such a module, we will need:

* 4 i/o ports that will react to any transition/movement,
* 1 port that will define the delay time in ms.

Lets write the docstring of such a neuron.

```python
class DelayedPushSub:
    """Delayed Push Sub

    This neuron lets you create delayed reaction chain.

    inputs:
    * io0_cv [0, 127] <any>: 1st io
    * io1_cv [0, 127] <any>: 2nd io
    * io2_cv [0, 127] <any>: 3rd io
    * io3_cv [0, 127] <any>: 4th io
    * time_cv [0, 5000]: how long is the delay (in ms)

    outputs:

    type: reactive
    category: chain reaction
    meta: disable default output
    """
```

Then generate the skeleton.

```python
class DelayedPushSub(VirtualDevice):
    """Delayed Push Sub

    This neuron lets you create delayed reaction chain.

    inputs:
    * io0_cv [0, 127] <any>: 1st io
    * io1_cv [0, 127] <any>: 2nd io
    * io2_cv [0, 127] <any>: 3rd io
    * io3_cv [0, 127] <any>: 4th io
    * time_cv [0, 5000]: how long is the delay (in ms)

    outputs:

    type: reactive
    category: chain reaction
    meta: disable default output
    """

    io0_cv = VirtualParameter(name="io0", range=(0.0, 127.0))
    io1_cv = VirtualParameter(name="io1", range=(0.0, 127.0))
    io2_cv = VirtualParameter(name="io2", range=(0.0, 127.0))
    io3_cv = VirtualParameter(name="io3", range=(0.0, 127.0))
    time_cv = VirtualParameter(name="time", range=(0.0, 5000.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(io3_cv, edge="any")
    def on_io3_any(self, value, ctx): ...

    @on(io2_cv, edge="any")
    def on_io2_any(self, value, ctx): ...

    @on(io1_cv, edge="any")
    def on_io1_any(self, value, ctx): ...

    @on(io0_cv, edge="any")
    def on_io0_any(self, value, ctx): ...
```

If you read the documentation until there, you'll see almost nothing new, beside the `__post_init__` method. This method is used here to disable the default output, but this method is also used when you need to add specific internal state variable that will not be exposed as port.

Now that we have the skeleton, lets write the method for our first io. The implementation is pretty straight forward: we receive a value, then we send it on the same port.

```python
@on(io0_cv, edge="any")
def on_io0_any(self, value, ctx):
    yield from self.sleep(self.time)
    yield value, [self.io0_cv]
```

The method to call to make a neuron sleep is `self.sleep(...)` that takes as parameter the number of ms the neuron will sleep. You can see that the method is called using `yield from`. This is required, as the sleep is non-fully-blocking, it just makes the reactive method and the overall neuron sleep, but it doesn't interfer with the neurons ability to receive values on various ports. Once the neuron finished to sleep, it sends the value on `self.io0_cv`. The syntax to send a value on a specific port is the following:

```python
yield <value>, [ports]
# or
return <value>, [ports]

# send a value on the default output_cv port
yield <value>, [self.output_cv]
# or
yield <value>
# or
return <value>, [self.output_cv]
# or
return <value>
```

The fact of using either `return` or `yield` entirely dependen on the behavior of your neuron and reactive method. When the `output_cv` default output is targetted, the port is optional. You can see also that the syntax accepts a list as second parameter when the value is sent on specific ports. This list can be multiple ports. If there is more than one port, the value is sent to each ports in a loop, in the order described by the port list.

**NOTE:** when you send a value on a port using return/yield, the value is written on the port instance. This behavior lets you query the module at any moment and always know what's the value on the port.

Now that we have a first method for the first i/o, we can copy/paste the same behavior for each method, and we are good, our neuron is finished and fully functionnal.

```python
class DelayedPushSub(VirtualDevice):
    """Delayed Push Sub

    This neuron lets you create delayed reaction chain.

    inputs:
    * io0_cv [0, 127] <any>: 1st io
    * io1_cv [0, 127] <any>: 2nd io
    * io2_cv [0, 127] <any>: 3rd io
    * io3_cv [0, 127] <any>: 4th io
    * time_cv [0, 5000]: how long is the delay (in ms)

    outputs:

    type: reactive
    category: chain reaction
    meta: disable default output
    """

    io0_cv = VirtualParameter(name="io0", range=(0.0, 127.0))
    io1_cv = VirtualParameter(name="io1", range=(0.0, 127.0))
    io2_cv = VirtualParameter(name="io2", range=(0.0, 127.0))
    io3_cv = VirtualParameter(name="io3", range=(0.0, 127.0))
    time_cv = VirtualParameter(name="time", range=(0.0, 5000.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(io3_cv, edge="any")
    def on_io3_any(self, value, ctx):
        yield from self.sleep(self.time)
        yield value, [self.io3_cv]

    @on(io2_cv, edge="any")
    def on_io2_any(self, value, ctx):
        yield from self.sleep(self.time)
        yield value, [self.io2_cv]

    @on(io1_cv, edge="any")
    def on_io1_any(self, value, ctx):
        yield from self.sleep(self.time)
        yield value, [self.io1_cv]

    @on(io0_cv, edge="any")
    def on_io0_any(self, value, ctx):
        yield from self.sleep(self.time)
        yield value, [self.io0_cv]
```

We observe that the behavior for each method is the same at the exception of the port. There is multiple ways of refactoring this code, we will not enter into details in this document, but I'm sure you have an idea or a trick up your sleeve.

Lets chat just a little bit about what happens in this situation:

* a value arrives on `io0` with a sleep time of 5s
* while the neuron is sleeping, another value arrives on `io1`.

What happens? In this case, the value that arrives on `io1` is stored in the queue for `io1` (each port get its own queue). Then after the 5s passed, the method for `io1` will be called and the neuron will go to sleep, etc.
