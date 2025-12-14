from collections import deque
from typing import Any

from nallely.core.world import ThreadContext

from .core import VirtualDevice, VirtualParameter, on


class Switch(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    selector_cv = VirtualParameter(name="selector", range=(0, 1))
    type_cv = VirtualParameter(name="type", accepted_values=("toggle", "absolute"))
    hold_last_cv = VirtualParameter(name="hold_last")

    output2_cv = VirtualParameter(name="output2", range=(0, 127))

    def __init__(self, **kwargs):
        self.input = 0
        self.output2 = 0
        self.selector = 0
        self.out_num = 0
        self.type = "toggle"
        self.hold_last = True
        self.outputs = [self.output_cv, self.output2_cv]
        super().__init__(target_cycle_time=1 / 100, **kwargs)

    def store_input(self, param: str, value):
        if param == "hold_last":
            value = bool(value)
        return super().store_input(param, value)

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        return value, [self.outputs[self.out_num]]

    @on(selector_cv, edge="rising")
    def rising_selector(self, value, ctx):
        old_out = self.out_num
        if self.type == "toggle":
            self.out_num = int(self.out_num + 1) % len(self.outputs)
        else:
            self.out_num = int(value)
        if not self.hold_last:
            yield 0, [self.outputs[old_out]]
        return self.input, [self.outputs[self.out_num]]

    @on(selector_cv, edge="falling")
    def falling_selector(self, value, ctx):
        if self.type == "absolute":
            old_out = self.out_num
            self.out_num = int(value)
            if not self.hold_last:
                yield 0, [self.outputs[old_out]]
            return self.input, [self.outputs[self.out_num]]


class ShiftRegister(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
    trigger_cv = VirtualParameter("trigger", range=(0, 1), conversion_policy=">0")
    reset_cv = VirtualParameter("reset", range=(0, 1))
    length_cv = VirtualParameter(
        "length", range=(2, 8), conversion_policy="round", default=8
    )

    output7_cv = VirtualParameter("output7", range=(0, 127))
    output6_cv = VirtualParameter("output6", range=(0, 127))
    output5_cv = VirtualParameter("output5", range=(0, 127))
    output4_cv = VirtualParameter("output4", range=(0, 127))
    output3_cv = VirtualParameter("output3", range=(0, 127))
    output2_cv = VirtualParameter("output2", range=(0, 127))
    output1_cv = VirtualParameter("output1", range=(0, 127))
    output0_cv = VirtualParameter("output0", range=(0, 127))

    def __init__(self, **kwargs):
        self.input = 0
        self.trigger = 0
        self.reset = 0
        self.length = 8
        self.registers: deque[int | None] = deque([None] * 8, maxlen=8)
        self.outputs = [None] * 8
        for i in range(8):
            setattr(self, f"output{i}", 0)
            self.outputs[i] = getattr(self, f"output{i}_cv")
        super().__init__(disable_output=True, **kwargs)

    @on(trigger_cv, edge="rising")
    def trigger_next_step(self, value, ctx):
        self.registers.appendleft(self.input)
        for i, (register, output) in enumerate(
            zip(list(self.registers)[: self.length], self.outputs[: self.length])
        ):
            if register is not None:
                yield register, [output]

    @on(reset_cv, edge="rising")
    def reset_values(self, value, ctx):
        for i in range(8):
            self.registers[i] = None
        yield 0, self.outputs


class SeqSwitch(VirtualDevice):
    trigger_cv = VirtualParameter("trigger", range=(0, 1), conversion_policy=">0")
    reset_cv = VirtualParameter("reset", range=(0, 1), conversion_policy=">0")
    steps_cv = VirtualParameter(
        "steps", range=(2, 4), default=4, conversion_policy="round"
    )
    mode_cv = VirtualParameter("mode", accepted_values=("IOs->OI", "OI->IOs"))

    io4_cv = VirtualParameter("io4", range=(0, 127))
    io3_cv = VirtualParameter("io3", range=(0, 127))
    io2_cv = VirtualParameter("io2", range=(0, 127))
    io1_cv = VirtualParameter("io1", range=(0, 127))
    oi_cv = VirtualParameter("oi", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.step = 0
        self.ios = [self.io1_cv, self.io2_cv, self.io3_cv, self.io4_cv]
        return {"disable_output": True}

    def next_step(self, _, ctx):
        if self.mode == "OI->IOs":  # type: ignore "mode" exists but as it's dynamic, the IDE cannot see it
            yield self.oi, [self.ios[self.step]]  # type: ignore "oi" exists but as it's dynamic, the IDE cannot see it
            prev = (self.step - 1) % self.steps  # type: ignore "steps" exists but as it's dynamic, the IDE cannot see it
            self.step = (self.step + 1) % self.steps  # type: ignore "steps" exists but as it's dynamic, the IDE cannot see it
            yield 0, [self.ios[prev]]
        else:
            value = getattr(self, self.ios[self.step].name)
            self.step = (self.step + 1) % self.steps  # type: ignore "steps" exists but as it's dynamic, the IDE cannot see it

            yield value, [self.oi_cv]

    @on(trigger_cv, edge="rising")
    def trigger_next_step(self, _, ctx):
        yield from self.next_step(_, ctx)

    @on(reset_cv, edge="rising")
    def reset_step(self, _, ctx):
        self.step = 0
        yield from self.next_step(_, ctx)  # value is ignored in next_step

    @on(steps_cv, edge="any")
    def reset_outputs(self, value, ctx):
        if self.mode == "OI->IOs":  # type: ignore "mode" exists but as it's dynamic, the IDE cannot see it
            return 0, self.ios


class RingCounter(VirtualDevice):
    MAX_STEPS = 8
    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    length_cv = VirtualParameter(name="length", range=(2, 8), conversion_policy="round")
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy="round")

    out7_cv = VirtualParameter(name="out7", range=(0, 1))
    out6_cv = VirtualParameter(name="out6", range=(0, 1))
    out5_cv = VirtualParameter(name="out5", range=(0, 1))
    out4_cv = VirtualParameter(name="out4", range=(0, 1))
    out3_cv = VirtualParameter(name="out3", range=(0, 1))
    out2_cv = VirtualParameter(name="out2", range=(0, 1))
    out1_cv = VirtualParameter(name="out1", range=(0, 1))
    out0_cv = VirtualParameter(name="out0", range=(0, 1))

    def __post_init__(self, **kwargs):
        self.index = 0
        self.outs = []
        for i in range(self.MAX_STEPS):
            output_name = f"out{i}"
            setattr(self, output_name, 0)
            self.outs.append(getattr(self, f"{output_name}_cv"))
        return {"disable_output": True}

    @on(reset_cv, edge="rising")
    def trigger_reset(self, value, ctx):
        self.index = 0

    @on(length_cv, edge="any")
    def change_length(self, value, ctx):
        # we reset in case the new length is after the index
        if value <= self.index:
            self.index = 0
        return 0, self.outs[value : self.MAX_STEPS]

    @on(trigger_cv, edge="rising")
    def trigger_output(self, value, ctx):
        yield 1, [self.outs[self.index]]
        yield 0, [self.outs[self.index]]
        self.index = (self.index + 1) % self.length  # type: ignore "length" exists but as it's dynamic, the IDE cannot see it


class BitCounter(VirtualDevice):
    MAX_BITS = 8
    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    length_cv = VirtualParameter(
        name="length", range=(1, 8), conversion_policy="round", default=8
    )
    reset_cv = VirtualParameter(name="reset", range=(0, 1), conversion_policy="round")
    mode_cv = VirtualParameter(name="mode", accepted_values=("ondemand", "continuous"))

    out7_cv = VirtualParameter(name="out7", range=(0, 1))
    out6_cv = VirtualParameter(name="out6", range=(0, 1))
    out5_cv = VirtualParameter(name="out5", range=(0, 1))
    out4_cv = VirtualParameter(name="out4", range=(0, 1))
    out3_cv = VirtualParameter(name="out3", range=(0, 1))
    out2_cv = VirtualParameter(name="out2", range=(0, 1))
    out1_cv = VirtualParameter(name="out1", range=(0, 1))
    out0_cv = VirtualParameter(name="out0", range=(0, 1))
    overflow_cv = VirtualParameter(name="overflow", range=(0, 1))

    def __post_init__(self, **kwargs):
        self.count = 0
        self.overflowed = 0
        self.outs = []
        self.prev_length = self.length  # type: ignore
        for i in range(self.MAX_BITS):
            output_name = f"out{i}"
            setattr(self, output_name, 0)
            self.outs.append(getattr(self, f"{output_name}_cv"))
        return {"disable_output": True}

    @on(reset_cv, edge="rising")
    def trigger_reset(self, value, ctx):
        self.count = 0
        self.overflowed = 0

    @on(length_cv, edge="any")
    def change_length(self, value, ctx):
        # we reset in case the new length is after the count
        if self.count >= value:
            self.count = value
        if value <= self.prev_length:
            yield 0, self.outs[self.prev_length : self.MAX_BITS]
            self.prev_length = value

    def activate_outputs(self):
        one_outs, zero_outs = [], []
        (one_outs if self.overflowed else zero_outs).append(self.overflow_cv)
        self.overflowed = False
        for i in range(self.length):  # type: ignore
            (one_outs if self.count & (1 << i) else zero_outs).append(self.outs[i])

        if one_outs:
            yield 1, one_outs
        if zero_outs:
            yield 0, zero_outs

    @on(trigger_cv, edge="rising")
    def trigger_output(self, value, ctx):
        self.count += 1
        if self.count >= (2**self.length):  # type: ignore
            self.count = 0
            self.overflowed = True
        if self.mode == "ondemand":  # type: ignore
            yield from self.activate_outputs()

    def main(self, ctx: ThreadContext) -> Any:
        if self.mode == "continuous":  # type: ignore
            yield from self.activate_outputs()


class ThresholdGate(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    threshold_cv = VirtualParameter(name="threshold", range=(0, 127))

    mode_cv = VirtualParameter(name="mode", accepted_values=("gate", "diff"))
    type_cv = VirtualParameter(name="type", accepted_values=("ondemand", "continuous"))

    def process(self, input, threshold):
        mode = self.mode  # type: ignore
        if mode == "gate":
            return 0 if input < threshold else input
        else:
            return max(0, input - threshold)

    @on(input_cv, edge="any")
    def change_input(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process(value, self.threshold)  # type: ignore

    @on(threshold_cv, edge="any")
    def change_threshold(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process(self.input, value)  # type: ignore

    @on(mode_cv, edge="any")
    def change_mode(self, value, ctx):
        if self.type == "ondemand":  # type: ignore
            return self.process(self.input, self.threshold)  # type: ignore

    def main(self, ctx: ThreadContext) -> Any:
        if self.type == "continuous":  # type: ignore
            return self.process(self.input, self.threshold)  # type: ignore


class Multiplexer(VirtualDevice):
    """
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
    """

    selector_cv = VirtualParameter(
        name="selector", range=(0.0, 7.0), conversion_policy="round", default=0.0
    )
    out_cv = VirtualParameter(name="out", range=(0.0, 127.0))
    in2_cv = VirtualParameter(name="in2", range=(0.0, 127.0))
    in3_cv = VirtualParameter(name="in3", range=(0.0, 127.0))
    in4_cv = VirtualParameter(name="in4", range=(0.0, 127.0))
    in5_cv = VirtualParameter(name="in5", range=(0.0, 127.0))
    in6_cv = VirtualParameter(name="in6", range=(0.0, 127.0))
    in7_cv = VirtualParameter(name="in7", range=(0.0, 127.0))
    in8_cv = VirtualParameter(name="in8", range=(0.0, 127.0))
    in0_cv = VirtualParameter(name="in0", range=(0.0, 127.0))
    in1_cv = VirtualParameter(name="in1", range=(0.0, 127.0))

    def __post_init__(self, **kwargs):
        self.ins = [getattr(self, f"in{i}_cv") for i in range(8)]
        return {"disable_output": True}

    def triggerif(self, id_):
        if self.selector == id_:
            return getattr(self, self.ins[id_].name)

    @on(in1_cv, edge="any")
    def on_in1_any(self, value, ctx):
        if self.selector == 1:
            return (value, [self.out_cv])

    @on(in0_cv, edge="any")
    def on_in0_any(self, value, ctx):
        if self.selector == 0:
            return (value, [self.out_cv])

    @on(in8_cv, edge="any")
    def on_in8_any(self, value, ctx):
        if self.selector == 8:
            return (value, [self.out_cv])

    @on(in7_cv, edge="any")
    def on_in7_any(self, value, ctx):
        if self.selector == 7:
            return (value, [self.out_cv])

    @on(in6_cv, edge="any")
    def on_in6_any(self, value, ctx):
        if self.selector == 6:
            return (value, [self.out_cv])

    @on(in5_cv, edge="any")
    def on_in5_any(self, value, ctx):
        if self.selector == 5:
            return (value, [self.out_cv])

    @on(in4_cv, edge="any")
    def on_in4_any(self, value, ctx):
        if self.selector == 4:
            return (value, [self.out_cv])

    @on(in3_cv, edge="any")
    def on_in3_any(self, value, ctx):
        if self.selector == 3:
            return (value, [self.out_cv])

    @on(in2_cv, edge="any")
    def on_in2_any(self, value, ctx):
        if self.selector == 2:
            return (value, [self.out_cv])

    @on(selector_cv, edge="both")
    def on_selector_both(self, value, ctx):
        return self.triggerif(value)


class Demultiplexer(VirtualDevice):
    """
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
    """

    input_cv = VirtualParameter(name="input", range=(0.0, 127.0))
    selector_cv = VirtualParameter(
        name="selector", range=(0.0, 7.0), conversion_policy="round"
    )
    out7_cv = VirtualParameter(name="out7", range=(0.0, 127.0))
    out6_cv = VirtualParameter(name="out6", range=(0.0, 127.0))
    out5_cv = VirtualParameter(name="out5", range=(0.0, 127.0))
    out4_cv = VirtualParameter(name="out4", range=(0.0, 127.0))
    out3_cv = VirtualParameter(name="out3", range=(0.0, 127.0))
    out2_cv = VirtualParameter(name="out2", range=(0.0, 127.0))
    out1_cv = VirtualParameter(name="out1", range=(0.0, 127.0))
    out0_cv = VirtualParameter(name="out0", range=(0.0, 127.0))

    def __post_init__(self, **kwargs):
        self.outs = [getattr(self, f"out{i}_cv") for i in range(8)]
        return {"disable_output": True}

    @on(selector_cv, edge="both")
    def on_selector_both(self, value, ctx):
        idx = int(self.selector)
        yield (0, self.outs[:idx] + self.outs[idx + 1 :])
        yield (value, [self.outs[idx]])

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        idx = int(self.selector)
        yield (0, self.outs[:idx] + self.outs[idx + 1 :])
        yield (value, [self.outs[idx]])


class DownScaler(VirtualDevice):
    """
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
    """

    input_cv = VirtualParameter(name="input", range=(0.0, 127.0), default=0.0)
    in_cv = VirtualParameter(name="in", range=(0.0, 256.0), default=0.0)
    out1_cv = VirtualParameter(name="out1", range=(0.0, 127.0))
    out0_cv = VirtualParameter(name="out0", range=(0.0, 127.0))

    def __post_init__(self, **kwargs):
        self.idx = 1
        self.outs = [self.out0_cv, self.out1_cv]
        return {"disable_output": True}

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        self.idx = (self.idx + 1) % 2
        return (value, [self.outs[self.idx]])


class DualRouter(VirtualDevice):
    """DualRouter

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
    """

    in0_cv = VirtualParameter(name="in0", range=(0.0, 127.0))
    in1_cv = VirtualParameter(name="in1", range=(0.0, 127.0))
    type_cv = VirtualParameter(name="type", accepted_values=["toggle", "absolute"])
    selector_cv = VirtualParameter(
        name="selector", range=(0.0, 1.0), conversion_policy=">0"
    )

    def __post_init__(self, **kwargs):
        self.idx = 0

    def trigger_if(self, idx):
        if self.idx == idx:
            return getattr(self, f"in{idx}")

    @on(selector_cv, edge="any")
    def on_selector_any(self, value, ctx):
        if self.type == "absolute":
            self.idx = int(value)
            return self.trigger_if(self.idx)

    @on(selector_cv, edge="rising")
    def on_selector_rising(self, value, ctx):
        if self.type == "toggle":
            self.idx = (self.idx + 1) % 2
            return self.trigger_if(self.idx)

    @on(in1_cv, edge="any")
    def on_in1_any(self, value, ctx):
        return self.trigger_if(1)

    @on(in0_cv, edge="any")
    def on_in0_any(self, value, ctx):
        return self.trigger_if(0)
