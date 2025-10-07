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
