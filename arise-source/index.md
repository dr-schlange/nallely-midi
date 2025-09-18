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

# A Hackable System for MIDI and Signal Experimentation

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

Currently, Nallely includes a few remote neurons coded in JavaScript, introducing 3D visuals (mental imagery for your brain) that can be controlled by signals received from your Nallely session (your modular brain instance). It also includes a webcam-aware neuron, providing visual input to your small MIDI brain (the "eyes" for your brain).

| Get a Smalltalk-like playground | Trevor is always here
:-------------------------:|:-------------------------:
![Get a Smalltalk-like playground](https://github.com/user-attachments/assets/e247e41e-8850-4987-80a1-2ce6d98d72b6) | ![Trevor loves you](https://github.com/user-attachments/assets/13b208d3-14b3-44aa-8e28-9344eca69f60)


Nallely is available, open-source, free, and will remain free and open-source.