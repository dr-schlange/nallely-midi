<!-- BEGIN ARISE ------------------------------
Title:: "Nallely MIDI"

Author:: "Dr. Schlange"
Description:: "Nallely is an experimental organic system for advanced MIDI patching, live coding, generative music, and multimodal art, built for hacker/musicians, developed in Python, inspired by Smalltalk"
Language:: "en"
Thumbnail:: "arise-icon.png"
Published Date:: "2025-06-12"
Modified Date:: "2025-06-12"

content_header:: "false"
rss_hide:: "true"
---- END ARISE \\ DO NOT MODIFY THIS LINE ---->

# A system for MIDI experimentations

Nallely - pronounced "Nayeli" - is an organic open-source Python platform for experimentation around the idea of MIDI meta-synth for live coding, generative music, and multimodal art, built for hacker and musicians, inspired by Smalltalk. Nallely is a MIDI companion to help you easily map MIDI controllers, MIDI instruments together, as well as create or use virtual devices (LFOs, EGs), patch them, cross-modulate them, and the possibility to expose and create remote services with parameters on which you can map your MIDI controllers, instruments or virtual devices. Nallely exposes an extensible core, as well as a bus to communicate with the external world and other technologies, letting you integrate new capabilities into the system, such as visuals for example.

Think about Nallely as a small brain, where each device is kind of biological neurone that receives signals and emits signals. All those small neurons can connect to each other in various ways. By connecting neurons as you want, you might connect some which - in a normal running brain - would not usually communicate, a little bit as if you had a brain under psychedelics: mapped in an unusual way, producing unexpected, but always amazing results. Some dedicated neurons (MIDI devices) are abstraction of the physical world and can create sound physically using MIDI devices (the voice), or get impulses from external MIDI devices, while visuals could be seen as visual mental imageries, influenced by how the small neurons are connected. Soon modules to introduce impluses from webcam and, or audio will arrive, giving this small muscial brain the capacity to see and hear.

## Advanced MIDI mapping

Anything that is exposed as a parameter of a device is patchable. In Nallely, patchs are reified and actors of the system. They are smart adaptors between your MIDI devices and any virtual device, performing automatic MIDI message conversion on the fly, and auto adapting data range to the target. This enables for powerful actions:

* with a single MIDI controller you can connect multiple MIDI devices having different MIDI implementation without needing to reconfigure your controller;
* you can modify the range of data that transit on each patch individually;
* you can map the full keyboard of your MIDI device to another;
* you can map only one key note to another key note; 
* you can map multiple keys to different target;
* you can map even the full keyboard notes, or velocity, to a CC parameter;
* don't have a controller but two synths? Well, you can patch your controls from one of your synth to the other, even if they are not implementing the same MIDI CC;
* ... 


## Connect visuals

## Control from everywhere

## Live-coding

## Enhance the system

### Code your own devices

### Code your own visuals

## An organic system inspired by live systems 

## Open-source

Nallely is available, open-source, free, and will remain free and open-source.