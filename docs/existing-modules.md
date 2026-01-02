# Nallely's Virtual Modules (Neurons) Documentation

This document centralize the various virtual modules (neurons) that exists in the system and provides a quick documentation to each device.

## Built-in Neurons

<details>
    <summary>ADSREnvelope: Simple envelope generator with attack, decay, sustain, release.</summary>


```
ADSR Envelope Generator

Simple envelope generator with attack, decay, sustain, release.
Generates an envelope from a gate:
  - when the gate is up -> triggers the envelope generation
  - when the gate is down -> closes the envelope

inputs:
* gate_cv [0, 1] !=0 <rising, falling>: Gate/control voltage input
* attack_cv [0.0, 1.0] init=0.1: Attack time control in seconds
* decay_cv [0.0, 1.0] init=0.2: Decay time control in seconds
* sustain_cv [0.0, 1.0] init=0.7: Sustain level control (0 -> 0%, 1 -> 100%)
* release_cv [0.0, 1.0] init=0.3: Release time control in seconds

outputs:
* output_cv [0, 1]: the generated envelope

type: continuous
category: envelope-generator

```

</details>

<details>
    <summary>Arpegiator: No description/documentation</summary>

</details>

<details>
    <summary>BernoulliTrigger: No description/documentation</summary>

</details>

<details>
    <summary>BitCounter: No description/documentation</summary>

</details>

<details>
    <summary>Bitwise: No description/documentation</summary>

</details>

<details>
    <summary>ChordGenerator: No description/documentation</summary>

</details>

<details>
    <summary>Clock: Simple clock that produces a tick depending on a tempo (BPM) for various divisions.</summary>


```
Clock

Simple clock that produces a tick depending on a tempo (BPM) for various divisions.

inputs:
* tempo_cv [20, 600] init=120: Clock BPM
* play_cv [0, 1] init=0 >0: Control if the clock must be started or not (1 = start, 0 = stop).
                            By default, the clock is stopped.
* reset_cv [0, 1] >0 <rising>: Reset the clock to 0

outputs:
* lead_cv [0, 1]: quater note output
* div4_cv [0, 1]: /4 output (whole note)
* div2_cv [0, 1]: /2 output (half note)
* mul2_cv [0, 1]: x2 output (eighth note)
* mul4_cv [0, 1]: x4 output (sixteenth note)
* div3_cv [0, 1]: /3 output (1 tick all 3 quater notes)
* div5_cv [0, 1]: /5 output (1 tick all 5 quater notes)
* mul3_cv [0, 1]: x3 output (3 ticks per 1 quater note)
* mul5_cv [0, 1]: x5 output (5 ticks per 1 quater note)
* mul7_cv [0, 1]: x3 output (5 ticks per 1 quater note)

type: continuous
category: clock
meta: disable default output

```

</details>

<details>
    <summary>ClockDivider: </summary>


```
Clock Divider

inputs:
* trigger_cv [0, 1] >0 <rising>: Trigger the divider
* reset_cv [0, 1] >0 <rising>: Reset the internal count to 0
* mode_cv [gate, tick]: Choose between gate (square mode) or tick (short pulse)

outputs:
* div1_cv [0, 1]: /1 output -> usefull to get a gate from a clock
* div2_cv [0, 1]: /2 output
* div3_cv [0, 1]: /3 output
* div4_cv [0, 1]: /4 output
* div5_cv [0, 1]: /5 output
* div6_cv [0, 1]: /6 output
* div7_cv [0, 1]: /7 output
* div8_cv [0, 1]: /8 output
* div16_cv [0, 1]: /16 output
* div32_cv [0, 1]: /32 output

type: ondemand
category: clock
meta: disable default output

```

</details>

<details>
    <summary>Comparator: No description/documentation</summary>

</details>

<details>
    <summary>Crossfade: Dual crossfader, proposes 2 inputs and 2 outputs.</summary>


```
Dual crossfader

Dual crossfader, proposes 2 inputs and 2 outputs.

inputs:
* in0_cv [0, 127] <any>: Input signal.
* in1_cv [0, 127] <any>: Input signal.
* in2_cv [0, 127] <any>: Input signal.
* in3_cv [0, 127] <any>: Input signal.
* level_cv [0, 100] <any>: Crossfader level.
* type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                  ondemand = value produced when reacting to an input only.
                                  continuous = value produced at the cycle speed of the module.

outputs:
* out0_cv [0, 127]: The crossfaded signal for in0 and in1.
* out1_cv [0, 127]: The filtered signal for in2 and in3.

type: ondemand, continuous
category: filter
meta: disable default output

```

</details>

<details>
    <summary>Demultiplexer: Demultiplexer</summary>


```

Demultiplexer

inputs:
# * %name [%range] %options: %doc
* input_cv [0, 127] <any>: input
* selector_cv [0, 7] round <both>: selector

outputs:
# * %name [%range]: %doc
* out0_cv [0, 127]: out0
* out1_cv [0, 127]: out1
* out2_cv [0, 127]: out2
* out3_cv [0, 127]: out3
* out4_cv [0, 127]: out4
* out5_cv [0, 127]: out5
* out6_cv [0, 127]: out6
* out7_cv [0, 127]: out7

type: <ondemand | continuous>
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>DownScaler: DownScaler</summary>


```

DownScaler

Splits a signal in 2 outputs, distributing alternating between the various outputs.

inputs:
* input_cv [0, 127] init=0 <any>: The input signal

outputs:
* out0_cv [0, 127]: First downscaled version
* out1_cv [0, 127]: Second downscaled version

type: ondemand
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>DualRouter: Routes 1 of 2 inputs to the output:</summary>


```
DualRouter

Routes 1 of 2 inputs to the output:
 * on a rising ede on selector,
 * or considering selector as an absolute selector (0 = route in0, 1 = route in1)

inputs:
# * %inname [%range] %options: %doc
* in0_cv [0, 127] <any>: input 1
* in1_cv [0, 127] <any>: input 2
* type_cv [toggle, absolute] round: toggle behavior or absolute
* selector_cv [0, 1] >0 <any, rising>: select input to deliver

outputs:
# * %outname [%range]: %doc

type: <ondemand | continuous>
category: <category>
# meta: disable default output

```

</details>

<details>
    <summary>EnvelopeSlew: Envelope Follower or Slew Limiter depending on the chosen type.</summary>


```
Envelope Follower & Slew Limiter

Envelope Follower or Slew Limiter depending on the chosen type.
The Envelope Follower tracks the amplitude of an input signal, producing a smooth envelope.
The Slew Limiter restricts how quickly the signal can change, smoothing rapid variations.

inputs:
* input_cv [0, 127] <any>: Input signal.
* attack_cv [0, 99.99] init=50.0: Attack control in %.
* release_cv [0, 99.99] init=50.0: Release control in %.
* type_cv [envelope, slew]: Choose between Envelope Follower and Slew Limiter
* mode_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                  ondemand = value produced when reacting to an input only.
                                  continuous = value produced at the cycle speed of the module.

outputs:
* output_cv [0, 127]: The filtered signal.

type: ondemand, continuous
category: filter

```

</details>

<details>
    <summary>EuclidianSequencer: </summary>


```
Basic Euclidian Sequencer

inputs:
* clock_cv [0, 1] >0 <rising>: Input clock
* length_cv [0, 128] init=8 round <any>: Sequence length
* hits_cv [0, 128] init=4 round <any>: Number of hits
* shift_cv [0, 127] init=0 round: Program the pattern shift
* trig_shift_cv [0, 1] >0 <rising>: Displace the pattern
* reset_cv [0, 1] >0 <rising>: Reset the sequence

outputs:
* trigger_out_cv [0, 1]: main output trigger
* gate_out_cv [0, 1]: main output gate
* step_out_cv [0, 1]: current number of step

type: ondemand
category: Sequencer
meta: disable default output

```

</details>

<details>
    <summary>FineTuneNote: FineTuneNote</summary>


```

FineTuneNote

inputs:
# * %inname [%range] %options: %doc
* input_cv [0, 127] <any>: main input
* slide_cv [0, 1] init=1 >0: if activated each pitch variation will not produce a new note on
* finetune_cv [0, 8191] init=2048 round: fine tune how the conversion for fraction should be handled (depends on your synth/preset)

outputs:
# * %outname [%range]: %doc
* note_out_cv [0, 127]: main note output (connect to the key of the synth)
* pitchwheel_out_cv [-8192, 8191]: main fine-tuned note (connect to the pitchwheel of the synth)

type: <ondemand | continuous>
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>FlipFlop: No description/documentation</summary>

</details>

<details>
    <summary>Gate: No description/documentation</summary>

</details>

<details>
    <summary>HarmonicGenerator: No description/documentation</summary>

</details>

<details>
    <summary>Harmonizer: No description/documentation</summary>

</details>

<details>
    <summary>KeySplitter: Let's you route notes depending on ranges</summary>


```
KeySplitter

Let's you route notes depending on ranges

inputs:
# * %inname [%range] %options: %doc
* input_cv [0, 127] <any>: input notes
* range0_cv [0, 127] init=34: threshold for first note
* range1_cv [0, 127] init=64: threshold for second note
* range2_cv [0, 127] init=94: threshold for third note

outputs:
# * %outname [%range]: %doc
* out0_cv [0, 127]: note output
* out1_cv [0, 127]: note output
* out2_cv [0, 127]: note output
* out3_cv [0, 127]: note output

type: <ondemand | continuous>
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>LFO: No description/documentation</summary>

</details>

<details>
    <summary>Latch: No description/documentation</summary>

</details>

<details>
    <summary>Logical: No description/documentation</summary>

</details>

<details>
    <summary>Looper: No description/documentation</summary>

</details>

<details>
    <summary>Mixer: Simple 4-in mixer.</summary>


```
Mixer

Simple 4-in mixer.

inputs:
* in0_cv [0, 127] <any>: Input signal.
* in1_cv [0, 127] <any>: Input signal.
* in2_cv [0, 127] <any>: Input signal.
* in3_cv [0, 127] <any>: Input signal.
* level0_cv [0, 100] <any>: Input signal level.
* level1_cv [0, 100] <any>: Input signal level.
* level2_cv [0, 100] <any>: Input signal level.
* level3_cv [0, 100] <any>: Input signal level.
* nums_cv [2, 4] init=4 round <any>: The number of input to consider.
* type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                  ondemand = value produced when reacting to an input only.
                                  continuous = value produced at the cycle speed of the module.

outputs:
* output_cv [0, 127]: The filtered signal.

type: ondemand, continuous
category: mixing

```

</details>

<details>
    <summary>Modulo: No description/documentation</summary>

</details>

<details>
    <summary>MultiPoleFilter: Multiple filters depending on a selected type of filter (lowpass, highpass, bandpass).</summary>


```
Multi Pole Filter

Multiple filters depending on a selected type of filter (lowpass, highpass, bandpass).


inputs:
* input_cv [0, 127] <any>: Input signal.
* filter_cv [lowpass, highpass, bandpass]: The filter type (default=lowpass).
* mode_cv [cutoff, smoothing]: Choose between cutoff control or smoothing control.
* cutoff_cv [0.0, 3000.0] init=1.0: Control cutoff frequency.
* smoothing_cv [0.0, 1.0] init=0.1: Control smoothing factor.
* poles_cv [1, 4] init=1 round: Number of poles for the filter.
* reset_cv [0, 1] >0 <rising>: Reset all internal states.
* type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                  ondemand = value produced when reacting to an input only.
                                  continuous = value produced at the cycle speed of the module.

outputs:
* output_cv [0, 127]: The filtered signal.

type: ondemand, continuous
category: filter

```

</details>

<details>
    <summary>Multiplexer: Multiplexer</summary>


```

Multiplexer

inputs:
# * %name [%range] %options: %doc
* in0_cv [0, 127] <any>: input 0
* in1_cv [0, 127] <any>: input 2
* in2_cv [0, 127] <any>: input 3
* in3_cv [0, 127] <any>: input 4
* in4_cv [0, 127] <any>: input 5
* in5_cv [0, 127] <any>: input 6
* in6_cv [0, 127] <any>: input 7
* in7_cv [0, 127] <any>: input 8
* in8_cv [0, 127] <any>: input 9
* selector_cv [0, 7] init=0 round <both>: input selector

outputs:
# * %name [%range]: %doc
* out_cv [0, 127]: output

type: ondemand
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>Operator: No description/documentation</summary>

</details>

<details>
    <summary>PitchShifter: Shifts a note from -48.0 to +48.0 semitones.</summary>


```
Pitch shifter
Shifts a note from -48.0 to +48.0 semitones.
Semi-tones can be decimal values, input can be also a decimal values, they are quantized later if needed.

inputs:
* input_cv [0, 127] <any>: the input note to shift (0-127)
* shift_cv [-48, 48] init=0 <both>: the amount of shift to apply (-48 to +48)

outputs:
* output_cv [0, 127]: the shifted note (0-127)

type: ondemand
category: pitch

```

</details>

<details>
    <summary>Quantizer: No description/documentation</summary>

</details>

<details>
    <summary>RingCounter: No description/documentation</summary>

</details>

<details>
    <summary>SampleHold: Samples a value and hold it when the trigger input is rising.</summary>


```
Sample & Hold

Samples a value and hold it when the trigger input is rising.

inputs:
* input_cv [0, 127] <both>: Input signal
* trigger_cv [0, 1] >0 <rising>: Signal amplitude (0.0 -> 0%, 1.0 -> 100%)
* reset_cv [0, 1] >0 <rising>: Signal gain (default is 1.0)

outputs:
* output_cv [0, 127]: The sampled value

type: ondemand
category: modulation

```

</details>

<details>
    <summary>SeqSwitch: No description/documentation</summary>

</details>

<details>
    <summary>Sequencer: The sequencer can be started and stopped using the "play" port.</summary>


```
A simple 16-step sequencer with adjustable length.

The sequencer can be started and stopped using the "play" port.

inputs:
* trigger_cv [0, 1] >0 <rising>: Advance the sequencer by one step on each rising edge.
* length_cv [1, 16] init=16 round <any>: Set the length of the sequence (number of steps).
* play_cv [0, 1] >0 <rising, falling>: Control if the sequencer must be started or not (1 = start, 0 = stop).
                                              By default, the sequencer is stopped.
* reset_cv [0, 1] >0 <rising>: Reset the sequencer to the first step.
* step_cv [0, 15] round <any>: Set the current step of the sequencer (0-indexed).
* step0_cv [0, 127]: Set the output value of step 1.
* step1_cv [0, 127]: Set the output value of step 2.
* step2_cv [0, 127]: Set the output value of step 3.
* step3_cv [0, 127]: Set the output value of step 4.
* step4_cv [0, 127]: Set the output value of step 5.
* step5_cv [0, 127]: Set the output value of step 6.
* step6_cv [0, 127]: Set the output value of step 7.
* step7_cv [0, 127]: Set the output value of step 8.
* step8_cv [0, 127]: Set the output value of step 9.
* step9_cv [0, 127]: Set the output value of step 10.
* step10_cv [0, 127]: Set the output value of step 11.
* step11_cv [0, 127]: Set the output value of step 12.
* step12_cv [0, 127]: Set the output value of step 13.
* step13_cv [0, 127]: Set the output value of step 14.
* step14_cv [0, 127]: Set the output value of step 15.
* step15_cv [0, 127]: Set the output value of step 16.

outputs:
* current_step_cv [0, 15]: The current step of the sequencer (0-indexed).
* output_cv [0, 127]: The output value of the current step.
* trig_out_cv [0, 1]: A trigger signal that goes high when the sequencer advances to the next step.

type: ondemand
category: sequencer

```

</details>

<details>
    <summary>Sequencer8: The sequencer can be started and stopped using the "play" port</summary>


```
A simple 8-step sequencer with adjustable length and activable output.

The sequencer can be started and stopped using the "play" port
and by default all the outputs are active

inputs:
* prev_edit_step_cv [0, 1] >0 <rising>: Advance the sequencer edit index by one step on each rising edge.
* next_edit_step_cv [0, 1] >0 <rising>: Pull back the sequencer edit index by one step on each rising edge.
* input_cv [0, 127]: Input CV (not used in this module, reserved for future use).
* write_cv [0, 1] >0 <rising>: When high on a rising edge, writes the value of input_cv to the current edit step.
* trigger_cv [0, 1] >0 <rising>: Advance the sequencer by one step on each rising edge.
* length_cv [1, 8] init=8 round <any>: Set the length of the sequence (number of steps).
* play_cv [0, 1] init=1 >0 <rising, falling>: Control if the sequencer must be started or not (1 = start, 0 = stop).
                                              By default, the sequencer is started.
* reset_cv [0, 1] >0 <rising>: Reset the sequencer to the first step.
* set_step_cv [0, 7] round <any>: Set the current step of the sequencer (0-indexed).
* step0_cv [0, 127]: Set the output value of step 1.
* step1_cv [0, 127]: Set the output value of step 2.
* step2_cv [0, 127]: Set the output value of step 3.
* step3_cv [0, 127]: Set the output value of step 4.
* step4_cv [0, 127]: Set the output value of step 5.
* step5_cv [0, 127]: Set the output value of step 6.
* step6_cv [0, 127]: Set the output value of step 7.
* step7_cv [0, 127]: Set the output value of step 8.

* active0_cv [0, 1] init=1 >0: Set the output as active if >1.
* active1_cv [0, 1] init=1 >0: Set the output as active if >1.
* active2_cv [0, 1] init=1 >0: Set the output as active if >1.
* active3_cv [0, 1] init=1 >0: Set the output as active if >1.
* active4_cv [0, 1] init=1 >0: Set the output as active if >1.
* active5_cv [0, 1] init=1 >0: Set the output as active if >1.
* active6_cv [0, 1] init=1 >0: Set the output as active if >1.
* active7_cv [0, 1] init=1 >0: Set the output as active if >1.

outputs:
* current_step_cv [0, 7]: The current step of the sequencer (0-indexed).
* edit_step_cv [0, 7]: The current edit step index (0-indexed).
* output_cv [0, 127]: The output value of the current step.
* trig_out_cv [0, 1]: A trigger signal that goes high when the sequencer advances to the next step.

type: ondemand
category: sequencer

```

</details>

<details>
    <summary>ShiftRegister: No description/documentation</summary>

</details>

<details>
    <summary>SuperShiftRegister: Weird shift register where inputs/outputs are outputs/inputs and which bubbles values back in a loops.</summary>


```
SuperShiftRegister

Weird shift register where inputs/outputs are outputs/inputs and which bubbles values back in a loops.

inputs:
# * %inname [%range] %options: %doc
# * io<num>_cv [0, 127]: io, in to write out to read
* trigger_cv [0, 1] >0 <rising>: trigger next step
* io0_cv [0, 127]: io, in to write out to read
* io1_cv [0, 127]: io, in to write out to read
* io2_cv [0, 127]: io, in to write out to read
* io3_cv [0, 127]: io, in to write out to read
* io4_cv [0, 127]: io, in to write out to read
* io5_cv [0, 127]: io, in to write out to read
* io6_cv [0, 127]: io, in to write out to read
* io7_cv [0, 127]: io, in to write out to read
* idx_cv [0, 7] round: index sequence
* length_cv [1, 8] init=8 round: length sequence

outputs:
# * %outname [%range]: %doc

type: <ondemand | continuous>
category: <category>
meta: disable default output

```

</details>

<details>
    <summary>Switch: No description/documentation</summary>

</details>

<details>
    <summary>ThresholdGate: No description/documentation</summary>

</details>

<details>
    <summary>TuringMachine: </summary>


```
Simple Turing Machine Sequencer

inputs:
* trigger_cv [0, 1] >0 <rising>: Input clock
* mutation_cv [0, 1] init=0.5: Probability to mutate
* random_cv [0, 1] >0 <rising>: Random seed
* reset_cv [0, 1] >0 <rising>: Reset all to 0

outputs:
* out_main_cv [0, 1]: main output
* gate_out_cv [0, 1]: main output gate
* tape_out_cv [0, 255]: tape value output
* out0_cv [0, 1]: 1st bit value
* out1_cv [0, 1]: 2nd bit value
* out2_cv [0, 1]: 3rd bit value
* out3_cv [0, 1]: 4th bit value
* out4_cv [0, 1]: 5th bit value
* out5_cv [0, 1]: 6th bit value
* out6_cv [0, 1]: 7th bit value
* out7_cv [0, 1]: 8th bit value

type: ondemand
category: Sequencer
meta: disable default output

```

</details>

<details>
    <summary>VCA: Simple VCA implementation with gain</summary>


```
Voltage Controled Amplifier

Simple VCA implementation with gain

inputs:
* input_cv [0, 127] <any>: Input signal
* amplitude_cv [0.0, 1.0] init=0.0 <any>: Signal amplitude (0.0 -> 0%, 1.0 -> 100%)
* gain_cv [1.0, 2.0] init=1.0: Signal gain (default is 1.0)

outputs:
* output_cv [0, 127]: The amplified signal

type: ondemand
category: amplitude-modulation

```

</details>

<details>
    <summary>VoiceAllocator: following multiple allocation algorithms.</summary>


```
Takes a flow of values and "split" it in multiple voices (allocate a voice)
following multiple allocation algorithms.

inputs:
* input_cv [0, 127] round <any>: Input flow of values
# * mode_cv [round-robin, unison, last note]: Choose voice allocation mode
# * steal_mode_cv [oldest, quietest, r-robin cont., last note]: Mode for the way the voice is stolen

outputs:
* out0_cv [0, 127]: 1st voice
* out1_cv [0, 127]: 2nd voice
* out2_cv [0, 127]: 3rd voice
* out3_cv [0, 127]: 4th voice

type: ondemand
category: Voices
meta: disable default output

```

</details>

<details>
    <summary>VolumeMixer: Uses velocity to simulate a volume control</summary>


```
Volume mixer

Uses velocity to simulate a volume control

inputs:
* inA_cv [0, 127] round <any>: input A
* volA_cv [0, 127] round <any>: volume A
* inB_cv [0, 127] round <any>: input B
* volB_cv [0, 127] round <any>: volume B
* inC_cv [0, 127] round <any>: input C
* volC_cv [0, 127] round <any>: volume C
* inD_cv [0, 127] round <any>: input D
* volD_cv [0, 127] round <any>: volume D

outputs:
* output_cv [0, 127]: the adjusted volume signal

type: ondemand
category: Volume

```

</details>

<details>
    <summary>Waveshaper: Modulate a signal waveform to reshape it.</summary>


```
Waveshaper

Modulate a signal waveform to reshape it.

inputs:
* input_cv [0, 127] <any>: Input signal.
* mode_cv [linear, exp, log, sigmoid, fold, quantize]: Choose how to shape the input waveform.
* amount_cv [0, 1]: The filter type (default=lowpass).
* symmetry_cv [-1.0, 1] init=0.0: Adjusts the balance between "positive" and "negative" portions of the reshaped waveform.
* bias_cv [0.0, 5.0]: Offsets the input signal before applying the shaping function.
* exp_power_cv [0.1, 50]: Controls the exponent used in the exponential shaping mode.
* log_scale_cv [1, 30]: Scales the input for the logarithmic shaping mode.
* sigmoid_gain_cv [0.5, 20]: Determines the steepness of the curve in sigmoid shaping mode.
* fold_gain_cv [0.5, 10]: Controls how strongly the input signal is folded in fold mode.
* quantize_steps_cv [2, 64]: Sets the number of discrete levels for the quantize shaping mode.
* type_cv [ondemand, continuous]: Choose between a ondemand or continuous value production.
                                  ondemand = value produced when reacting to an input only.
                                  continuous = value produced at the cycle speed of the module.

outputs:
* output_cv [0, 127]: The reshaped signal.

type: ondemand, continuous
category: filter

```

</details>

<details>
    <summary>WindowDetector: No description/documentation</summary>

</details>



## Experimental Neurons

<details>
    <summary>BarnsleyProjector: No description/documentation</summary>

</details>

<details>
    <summary>BroadcastRAM8: Simple 8-slots piece of RAM that broadcast values of this slot when it's written.</summary>


```
8-slots Broadcast RAM

Simple 8-slots piece of RAM that broadcast values of this slot when it's written.

inputs:
* io0_cv [0, 127] <any>: Input/trigger/output 0
* io1_cv [0, 127] <any>: Input/trigger/Output 1
* io2_cv [0, 127] <any>: Input/trigger/Output 2
* io3_cv [0, 127] <any>: Input/trigger/Output 3
* io4_cv [0, 127] <any>: Input/trigger/Output 4
* io5_cv [0, 127] <any>: Input/trigger/Output 5
* io6_cv [0, 127] <any>: Input/trigger/Output 6
* io7_cv [0, 127] <any>: Input/trigger/Output 7
* mode_cv [previous, new, both]: Which value will be broacasted on a trigger
* trigger_cv [0, 1] >0 <rising>: Forces a global broadcast when triggered
* reset_cv [0, 1] >0 <rising>: Reset all RAM to 0

type: ondemand
category: delay
meta: disable default output

```

</details>

<details>
    <summary>BuddhabrotProjector: No description/documentation</summary>

</details>

<details>
    <summary>ConveyorLine: Stores input in a buffer then pass them one by one in a line trigger by trigger.</summary>


```
Conveyor line

Stores input in a buffer then pass them one by one in a line trigger by trigger.
Each input is processed once the previous input went down all the long the line

inputs:
* input_cv [0, 127] <any>: the input to store.
* trigger_cv [0, 1] >0 <rising>: trigger input consumption.
* buf_size_cv [1, 1000] init=20 round <any>: the buffer size.
* length_cv [1, 8] init=8 round <any>: the lenght of the line.
* reset_cv [0, 1] >0 <rising>: empty the buffer.

outputs:
* out0_cv [0, 127]: 1st position in the output line.
* out1_cv [0, 127]: 2nd position in the output line.
* out2_cv [0, 127]: 3rd position in the output line.
* out3_cv [0, 127]: 4th position in the output line.
* out4_cv [0, 127]: 5th position in the output line.
* out5_cv [0, 127]: 6th position in the output line.
* out6_cv [0, 127]: 7th position in the output line.
* out7_cv [0, 127]: 8th position in the output line.

type: ondemand
category: delay
meta: disable default output

```

</details>

<details>
    <summary>Delay: No description/documentation</summary>

</details>

<details>
    <summary>HenonProjector: No description/documentation</summary>

</details>

<details>
    <summary>InstanceCreator: No description/documentation</summary>

</details>

<details>
    <summary>LorenzProjector: No description/documentation</summary>

</details>

<details>
    <summary>MandelbrotProjector: No description/documentation</summary>

</details>

<details>
    <summary>Morton: No description/documentation</summary>

</details>

<details>
    <summary>RandomPatcher: No description/documentation</summary>

</details>

<details>
    <summary>RosslerProjector: No description/documentation</summary>

</details>

