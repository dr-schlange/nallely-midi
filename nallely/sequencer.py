from collections import deque
from math import floor
from random import randint, random

from .core import VirtualDevice, VirtualParameter, on


class Sequencer(VirtualDevice):
    """A simple 16-step sequencer with adjustable length.

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
    """

    trigger_cv = VirtualParameter(
        name="trigger", range=(0.0, 1.0), conversion_policy=">0"
    )
    play_cv = VirtualParameter(name="play", range=(0.0, 1.0), conversion_policy=">0")
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0), conversion_policy=">0")
    set_step_cv = VirtualParameter(
        name="set_step", range=(0.0, 15.0), conversion_policy="round"
    )
    length_cv = VirtualParameter(
        name="length", range=(1.0, 16.0), conversion_policy="round", default=16.0
    )

    step0_cv = VirtualParameter(name="step0", range=(0.0, 127.0))
    step1_cv = VirtualParameter(name="step1", range=(0.0, 127.0))
    step2_cv = VirtualParameter(name="step2", range=(0.0, 127.0))
    step3_cv = VirtualParameter(name="step3", range=(0.0, 127.0))
    step4_cv = VirtualParameter(name="step4", range=(0.0, 127.0))
    step5_cv = VirtualParameter(name="step5", range=(0.0, 127.0))
    step6_cv = VirtualParameter(name="step6", range=(0.0, 127.0))
    step7_cv = VirtualParameter(name="step7", range=(0.0, 127.0))
    step8_cv = VirtualParameter(name="step8", range=(0.0, 127.0))
    step9_cv = VirtualParameter(name="step9", range=(0.0, 127.0))
    step10_cv = VirtualParameter(name="step10", range=(0.0, 127.0))
    step11_cv = VirtualParameter(name="step11", range=(0.0, 127.0))
    step12_cv = VirtualParameter(name="step12", range=(0.0, 127.0))
    step13_cv = VirtualParameter(name="step13", range=(0.0, 127.0))
    step14_cv = VirtualParameter(name="step14", range=(0.0, 127.0))
    step15_cv = VirtualParameter(name="step15", range=(0.0, 127.0))

    trig_out_cv = VirtualParameter(name="trig_out", range=(0, 1))
    current_step_cv = VirtualParameter(name="current_step", range=(0, 15))

    def next_step(self):
        # advance step
        if self.current_step > self.length - 1:  # type: ignore
            next_step = 0
        else:
            next_step = (self.current_step + 1) % int(self.length)  # type: ignore
        yield next_step, [self.current_step_cv]

        # send gate out
        yield 1, [self.trig_out_cv]
        yield 0, [self.trig_out_cv]

        # send output
        output_value = getattr(self, f"step{self.current_step}")  # type: ignore
        yield output_value

    def clear_outs(self):
        for output in [self.trig_out_cv, self.output_cv, self.current_step_cv]:
            yield 0, [output]

    @on(play_cv, edge="rising")
    def on_play_rising(self, value, ctx):
        yield from self.next_step()

    @on(play_cv, edge="falling")
    def on_play_falling(self, value, ctx):
        yield from self.clear_outs()

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        yield from self.clear_outs()
        yield 0, [self.current_step_cv]

    @on(length_cv, edge="any")
    def on_length_any(self, value, ctx):
        if self.current_step > int(value):  # type: ignore
            yield from self.clear_outs()
            yield 0, [self.current_step_cv]
            yield from self.next_step()

    @on(trigger_cv, edge="rising")
    def on_trigger_rising(self, value, ctx):
        if self.play > 0:  # type: ignore
            yield from self.next_step()

    @on(set_step_cv, edge="any")
    def on_step_any(self, value, ctx):
        yield int(value), [self.current_step_cv]
        output_value = getattr(self, f"step{int(self.current_step)}")  # type: ignore
        yield output_value


class Sequencer8(VirtualDevice):
    """A simple 8-step sequencer with adjustable length and activable output.

    The sequencer can be started and stopped using the "play" port
    and by default all the outputs are active

    inputs:
    * trigger_cv [0, 1] >0 <rising>: Advance the sequencer by one step on each rising edge.
    * length_cv [1, 8] init=8 round <any>: Set the length of the sequence (number of steps).
    * play_cv [0, 1] init=1 >0 <rising, falling>: Control if the sequencer must be started or not (1 = start, 0 = stop).
                                                  By default, the sequencer is started.
    * reset_cv [0, 1] >0 <rising>: Reset the sequencer to the first step.
    * step_cv [0, 7] round <any>: Set the current step of the sequencer (0-indexed).
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
    * current_step_cv [0, 15]: The current step of the sequencer (0-indexed).
    * output_cv [0, 127]: The output value of the current step.
    * trig_out_cv [0, 1]: A trigger signal that goes high when the sequencer advances to the next step.

    type: ondemand
    category: sequencer
    """

    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    play_cv = VirtualParameter(
        name="play", range=(0, 1), conversion_policy=">0", default=1
    )
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy=">0")
    set_step_cv = VirtualParameter(
        name="set_step", range=(0, 7), conversion_policy="round"
    )
    length_cv = VirtualParameter(
        name="length", range=(1, 8), conversion_policy="round", default=8
    )

    step0_cv = VirtualParameter(name="step0", range=(0.0, 127.0))
    step1_cv = VirtualParameter(name="step1", range=(0.0, 127.0))
    step2_cv = VirtualParameter(name="step2", range=(0.0, 127.0))
    step3_cv = VirtualParameter(name="step3", range=(0.0, 127.0))
    step4_cv = VirtualParameter(name="step4", range=(0.0, 127.0))
    step5_cv = VirtualParameter(name="step5", range=(0.0, 127.0))
    step6_cv = VirtualParameter(name="step6", range=(0.0, 127.0))
    step7_cv = VirtualParameter(name="step7", range=(0.0, 127.0))
    active0_cv = VirtualParameter(
        name="active0", range=(0, 1), conversion_policy=">0", default=1
    )
    active1_cv = VirtualParameter(
        name="active1", range=(0, 1), conversion_policy=">0", default=1
    )
    active2_cv = VirtualParameter(
        name="active2", range=(0, 1), conversion_policy=">0", default=1
    )
    active3_cv = VirtualParameter(
        name="active3", range=(0, 1), conversion_policy=">0", default=1
    )
    active4_cv = VirtualParameter(
        name="active4", range=(0, 1), conversion_policy=">0", default=1
    )
    active5_cv = VirtualParameter(
        name="active5", range=(0, 1), conversion_policy=">0", default=1
    )
    active6_cv = VirtualParameter(
        name="active6", range=(0, 1), conversion_policy=">0", default=1
    )
    active7_cv = VirtualParameter(
        name="active7", range=(0, 1), conversion_policy=">0", default=1
    )

    trig_out_cv = VirtualParameter(name="trig_out", range=(0, 1))
    current_step_cv = VirtualParameter(name="current_step", range=(0, 15))

    def next_step(self):
        # advance step
        if self.current_step > self.length - 1:  # type: ignore
            next_step = 0
        else:
            next_step = (self.current_step + 1) % int(self.length)  # type: ignore
        yield next_step, [self.current_step_cv]
        if self.current_step_active():
            # send gate out
            yield 1, [self.trig_out_cv]
            yield 0, [self.trig_out_cv]

            # send output
            output_value = getattr(self, f"step{self.current_step}")  # type: ignore
            yield output_value
        else:
            yield 0

    def clear_outs(self):
        for output in [self.trig_out_cv, self.output_cv, self.current_step_cv]:
            yield 0, [output]

    def current_step_active(self):
        return getattr(self, f"active{self.current_step}") > 0  # type: ignore

    @on(play_cv, edge="rising")
    def on_play_rising(self, value, ctx):
        yield from self.next_step()

    @on(play_cv, edge="falling")
    def on_play_falling(self, value, ctx):
        yield from self.clear_outs()

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        yield from self.clear_outs()
        yield 0, [self.current_step_cv]

    @on(length_cv, edge="any")
    def on_length_any(self, value, ctx):
        if self.current_step > int(value):  # type: ignore
            yield from self.clear_outs()
            yield 0, [self.current_step_cv]
            yield from self.next_step()

    @on(trigger_cv, edge="rising")
    def on_trigger_rising(self, value, ctx):
        if self.play > 0:  # type: ignore
            yield from self.next_step()

    @on(set_step_cv, edge="any")
    def on_step_any(self, value, ctx):
        yield int(value), [self.current_step_cv]
        if self.current_step_active():
            output_value = getattr(self, f"step{int(self.current_step)}")  # type: ignore
            yield output_value
        else:
            yield 0


class TuringMachine(VirtualDevice):
    """Simple Turing Machine Sequencer

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
    """

    trigger_cv = VirtualParameter(
        name="trigger", range=(0.0, 1.0), conversion_policy=">0"
    )
    mutation_cv = VirtualParameter(name="mutation", range=(0.0, 1.0), default=0.5)
    random_cv = VirtualParameter(
        name="random", range=(0.0, 1.0), conversion_policy=">0"
    )
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0), conversion_policy=">0")
    out7_cv = VirtualParameter(name="out7", range=(0.0, 1.0))
    out6_cv = VirtualParameter(name="out6", range=(0.0, 1.0))
    out5_cv = VirtualParameter(name="out5", range=(0.0, 1.0))
    out4_cv = VirtualParameter(name="out4", range=(0.0, 1.0))
    out3_cv = VirtualParameter(name="out3", range=(0.0, 1.0))
    out2_cv = VirtualParameter(name="out2", range=(0.0, 1.0))
    out1_cv = VirtualParameter(name="out1", range=(0.0, 1.0))
    out0_cv = VirtualParameter(name="out0", range=(0.0, 1.0))
    tape_out_cv = VirtualParameter(name="tape_out", range=(0.0, 255))
    gate_out_cv = VirtualParameter(name="gate_out", range=(0.0, 1.0))
    out_main_cv = VirtualParameter(name="out_main", range=(0.0, 1.0))

    def __post_init__(self, **kwargs):
        self.memory = deque([0] * 8)
        return {"disable_output": True}

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.memory = deque([0] * 8)

    @on(random_cv, edge="rising")
    def on_random_rising(self, value, ctx):
        random_value = randint(0, 255)
        self.memory = deque((int(bit) for bit in bin(random_value)[2:].zfill(8)))

    @on(trigger_cv, edge="rising")
    def on_trigger_rising(self, value, ctx):
        mutation_probability = self.mutation  # type: ignore
        self.memory.rotate()
        if random() < mutation_probability:
            self.memory[0] = 1 - self.memory[0]
        memcell = self.memory[-1]
        yield int("".join(str(s) for s in self.memory), 2), [self.tape_out_cv]
        yield memcell, [self.out_main_cv]
        yield 0, [self.out_main_cv]
        if memcell:
            yield (1, [self.gate_out_cv])
        else:
            yield (0, [self.gate_out_cv])
        for i in range(8):
            yield (self.memory[i], [getattr(self, f"out{i}_cv")])


class EuclidianSequencer(VirtualDevice):
    """Basic Euclidian Sequencer

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
    """

    clock_cv = VirtualParameter(name="clock", range=(0, 1), conversion_policy=">0")
    length_cv = VirtualParameter(
        name="length", range=(0, 128), conversion_policy="round", default=8
    )
    hits_cv = VirtualParameter(
        name="hits", range=(0, 128), conversion_policy="round", default=4
    )
    shift_cv = VirtualParameter(
        name="shift", range=(0, 127), conversion_policy="round", default=0
    )
    trig_shift_cv = VirtualParameter(
        name="trig_shift", range=(0, 1), conversion_policy=">0"
    )
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy=">0")

    step_out_cv = VirtualParameter(name="step_out", range=(0, 128))
    gate_out_cv = VirtualParameter(name="gate_out", range=(0, 1))
    trigger_out_cv = VirtualParameter(name="trigger_out", range=(0, 1))

    def __post_init__(self, **kwargs):
        self.compute_sequence()
        self.step = 0
        return {"disable_output": True}

    def compute_sequence(self):
        n = self.length  # type: ignore
        k = self.hits  # type: ignore
        shift = self.shift % n  # type: ignore
        self.sequence = deque([0] * n)
        for i in range(k):
            p = floor((i * n) / k)
            self.sequence[p] = 1
        self.sequence.rotate(shift)

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.step = 0

    @on(trig_shift_cv, edge="rising")
    def on_trig_shift_rising(self, value, ctx):
        self.sequence.rotate(1)

    @on(shift_cv, edge="any")
    def on_shift_any(self, value, ctx):
        self.compute_sequence()

    @on(hits_cv, edge="any")
    def on_hits_any(self, value, ctx):
        self.compute_sequence()

    @on(length_cv, edge="any")
    def on_length_any(self, value, ctx):
        if self.step >= value:
            self.step = 0
        self.compute_sequence()

    @on(clock_cv, edge="rising")
    def on_clock_rising(self, value, ctx):
        yield self.step, [self.step_out_cv]

        step_value = self.sequence[self.step]

        # We output the gate
        yield step_value, [self.gate_out_cv]

        # We output a pulse
        if step_value:
            yield 1, [self.trigger_out_cv]
        yield 0, [self.trigger_out_cv]

        self.step = (self.step + 1) % len(self.sequence)
