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
    trigger_cv = VirtualParameter("trigger", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))

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
        self.registers: deque[int | None] = deque([None] * 8, maxlen=8)
        self.outputs = [None] * 8
        for i in range(8):
            setattr(self, f"output{i}", 0)
            self.outputs[i] = getattr(self, f"output{i}_cv")
        super().__init__(disable_output=True, **kwargs)

    @on(trigger_cv, edge="rising")
    def trigger_next_step(self, value, ctx):
        self.registers.appendleft(self.input)
        for i, (register, output) in enumerate(zip(self.registers, self.outputs)):
            if register is not None:
                outputs = [self.output_cv, output] if i == 0 else [output]
                yield register, outputs

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
