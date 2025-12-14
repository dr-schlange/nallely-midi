<!-- BEGIN ARISE ------------------------------
Title:: "Nallely MIDI"

Author:: "Dr. Schlange"
Description:: "Nallely is an experimental organic system for advanced MIDI patching, live coding, generative music, and multimodal art, built for hacker/musicians, developed in Python, inspired by Smalltalk and Systems as Living Things"
Language:: "en"
Thumbnail:: "arise-icon.png"
Published Date:: "2025-06-12"
Modified Date:: "2025-09-17"

content_header:: "false"
rss_hide:: "true"
---- END ARISE \\ DO NOT MODIFY THIS LINE ---->

# A Small Organic Live-Programmable Modular Brain for MIDI and CV-like Signals

Nallely - pronounced "Nayeli" - is an organic open-source Python platform for modular signal processing and meta-synth creation. Nallely lets you build your own modular instrument or machine from any signal producing source: MIDI devices, sensors, webcams, or even other computers on the same network. Signals can be generated, transformed, filtered, or split, then routed back into MIDI devices or into any application registered in a Nallely session. Designed for hackers and musicians, Nallely supports live coding, complex MIDI routing, generative music, and multimodal art.


| Control multiple MIDI devices |  Patch your devices
:-------------------------:|:-------------------------:
![Control multiple MIDI devices](https://github.com/user-attachments/assets/df545edc-6fa8-424f-9039-dd2046a9f406) | ![Patch in a graphical way](https://github.com/user-attachments/assets/d5d96809-159d-4cbb-81e2-5a1b7c3f9452)



Think of Nallely as a small brain, where each device acts a bit like a biological neuron by receiving and emitting signals. Each neuron runs independently on its own thread, and they can connect in countless ways by exchanging messages with each other. By wiring them freely, you can link neurons that in a "normal" brain would not usually communicate. The result is a small brain that can behave like a regular one, or like a brain under psychedelics, mapped in unusual ways, producing unexpected, but always amazing results. Nallely is designed for experimentation, happy accidents, and emergent behavior.

| Monitor the signals | Explore your patch in 3D
:-------------------------:|:-------------------------:
![See the signal at any point](https://github.com/user-attachments/assets/94e8cb6b-44a8-407b-acdb-1b66a148ad71) | ![Explore your patch in 3D](https://github.com/user-attachments/assets/6d5abee2-73af-4ea8-a68a-7445e64cf0e6)

Inspired by the "Systems as Living Things" philosophy and by Smalltalk, Nallely tries to be as dynamic as possible: you can create your own meta-synth and build your custom MIDI brain while it's running, from any computer or phone on the network (with a touch-friendly interface). Developed in Python, Nallely exposes an extensible core and an easy-to-use Python API, so you can create your own neurons without efforts, and have them integrated directly into the system in a seemless way.


| Manage your patchs as a memory versioned on git | Tweak your neurons
:-------------------------:|:-------------------------:
![Manage your patchs as a versioned memory](https://github.com/user-attachments/assets/177cb536-dee2-4f1d-9275-49cf0805fb13) | ![Change any settings](https://github.com/user-attachments/assets/3509e077-cc97-424f-ac52-3c382e0fbaaa)


Nallely comes with a set of pre-existing neurons, including:

* abstraction of the physical world that can create sound using MIDI devices (the "voice" for your brain);
* signal-processing neurons that filter, transform, split, or generate signals;
* network buses, where distributed remote neurons coded in any technology can register and emit or receive signals;
* meta-neurons which can control, create, modify other neurons.

Nallely includes a few remote neurons coded in JavaScript, introducing 3D visuals (mental imagery for your brain) that can be controlled by signals received from your Nallely session (your modular brain instance). It also includes a webcam-aware neuron, providing visual input to your small MIDI brain (the "eyes" for your brain).

| Get a Smalltalk-like playground | Trevor is always here
:-------------------------:|:-------------------------:
![Get a Smalltalk-like playground](https://github.com/user-attachments/assets/e247e41e-8850-4987-80a1-2ce6d98d72b6) | ![Trevor loves you](https://github.com/user-attachments/assets/13b208d3-14b3-44aa-8e28-9344eca69f60)



## How is it different from existing systems?

Nallely has properties that are different from traditional modular synthesis softwares:

* each module (neuron) runs in its own independent thread and communicates with others neurons (or your synths) by sending asynchronous messages. This property (message sending), copied from Smalltalk and reactive actor-based systems, enables neuron isolation, resiliency and fault-tolerancy. If a module "fails", the system continues to run, and lets you the possibility to kill the faulty module, or live-debug it and restart it;
* it emulates time, running by wall-clock and doesn't simulate time. There is no global tick, no global clock: each module can run a it's own speed;
* synchronization happens, because it happens, not because it's enforced;
* everything is a signal. MIDI notes and CV-like data is unified as a stream of numbers. You don't need to wonder which kind of patch you need to use, which CC you should target, how to map the information range, all is automatical: the patch jit-compiles a small adapter when you connect two ports to ensure speed and hide dedicated behaviors;
* patchs are directed, they indicate how the signal will be sent from one neuron to another;
* ports can be input and output at the same time. Depending on how the module is developed, a port can yield datas or receive data. This enables a new class of modules where you can can seemlessly code reaction chains, observable memory, ...;
* talks network in an unified way;
* patch from anywhere in the same network: sessions are headless and are controlled by a web-interface. Connect to a session from your phone or your laptop. The web-UI is stateless, if you're connected to a session, you'll always be in sync with it;
* all patch modification is versionned using Git: don't loose your patches, or their history, go back in time to revive a previous version, branch to make experiments, sync your memory with a remote Git repository to share your patches.

## Extension/hacking is encouraged

Nallely is built to be fully extensible and hackable, at it's core, and at the neuron level, all live:

* you don't like the web-interface? You can follow a simple small protocol to control a running session and you'll get a snapshot representing the new full state of the session, letting you the option to display it as you want;
* you can live-code your Python neurons while the system runs, you can create modules, edit the Python code from the web-UI, even debug it with standard Python cli debugging tools;
* you can live-patch your Python neurons while the system runs: modify the code of your running module and directly sees the result. No need to restart the system, no hot-reload, no instance re-creation, Nallely embedds an object-centric hot-patch system with instance migration. Never loose your code, all is versionned with git;
* you can write your modules and code from your phone if you want, to help you with bootstrapping new neurons, the code editor proposes a code generator and a smart templating system relying on a user-driven term-rewriting system. Write your own snippets templates, and recursive templates grammar directly in the editor to help you code faster.
* you don't like Python? You can develop neurons in your favorite language as long as it knows how to connect to a websocket server. Just declare the ports your want to expose, register callbacks and your good to go. There's examples with webcam, finger trackings, gameboy emulator, ..., integrating a software to Nallely is easy and it opens for experimentation;
* neurons have access to an introspective API that lets them be able to create new neurons instances, auto-patch themselves, monitor other neurons, ...

## So...

Nallely is not a DAW or a system for computer-based sound synthesis; it's more meta-synth focused and eventually a companion for your MIDI devices: to combine or manipulate them in order to create a new instrument, or to make semi-modular synths a little bit more modular.

If you're looking for something that ensures strong strict time, Nallely is not made for you. If you're looking for high-predictability, Nallely might not be for you.

By embracing asynchronous as first-class feature, Nallely is a playground that promotes emergent behaviors. So, it's not a DAW, it's not a DSP. It's a playground for emergent behaviors, generative control, and turning synth rigs into living systems in the form of a programmable small living brain. Quickly experiments with crazy ideas: connect everything with anything and everything.


Nallely is available, open-source, free, and will remain free and open-source.