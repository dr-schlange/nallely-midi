<!-- BEGIN ARISE ------------------------------
Title:: "How to make Nallely understand new MIDI devices"

Author:: "Dr. Schlange"
Description:: "How to add a new MIDI device in Nallely"
Language:: "en"
Published Date:: "2025-07-10"
Modified Date:: "2025-07-10"

---- END ARISE \\ DO NOT MODIFY THIS LINE ---->

# How to add a new MIDI device in Nallely

By default, Nallely understands few MIDI devices:

* Korg NTS-1,
* Korg Minilogue,
* Akai MPD32 (specific configuration).

This doesn't mean that Nallely cannot understand other MIDI devices, it just means that we need to manually add new MIDI devices to Nallely. Nallely works by reflecting on an abstraction of the MIDI device through a Python API that is dedicated to each MIDI device. The Python API is an internal Python DSL that allows you to describe in a declarative way the MIDI device. All the goal to make a new MIDI device understood by Nallely is to produce this Python API. There is basically 3 ways of doing it:

1. generate the Python API using Nallely from a YAML description,
2. generate the Python API using Nallely from a CSV description coming from the [MIDI CC & NRPN database](https://midi.guide/),
3. write the Python API by hand.

In this article, we will review the three methods so you can decide which one fits you the best.

**NOTE**: Among the three methods, there is no "best method". Each of them is valid, it's just a matter of taste, but the one that generates from the CSV provided by the `MIDI CC & NRPN database` might require a little bit of attention as - despite the effort made by the author to hamronize the description - some CSV descriptions are not exactly well formed.
