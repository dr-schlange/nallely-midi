from collections import deque
from math import floor
from time import perf_counter_ns
from typing import Any

from nallely import VirtualDevice, VirtualParameter, on
from nallely.core.world import ThreadContext


class Delay(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    buffer_size_cv = VirtualParameter(
        name="buffer_size", range=(2, 500), conversion_policy="round", default=500
    )
    time_cv = VirtualParameter(
        name="time", range=(10, 2000), default=20, conversion_policy="round"
    )
    feedback_cv = VirtualParameter(name="feedback", range=(1, 99), default=50)
    reset_cv = VirtualParameter(
        name="reset", range=(0, 1), conversion_policy=">0", default=0
    )

    dry_output_cv = VirtualParameter(name="dry_output", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.cycling = False
        self.buffer = deque(maxlen=self.buffer_size + 1)  # type: ignore

    @on(buffer_size_cv, edge="any")
    def change_buffer_size(self, value, ctx):
        self.buffer = deque(self.buffer, maxlen=value)

    @on(input_cv, edge="any")
    def bufferize(self, value, ctx):
        due_time = perf_counter_ns() + self.time * 1_000_000  # type: ignore
        self.buffer.appendleft((value, ctx.get("velocity", 100), due_time))

        yield value, [self.dry_output_cv]

    @on(reset_cv, edge="rising")
    def reset_buffer(self, value, ctx):
        self.buffer.clear()
        return 0

    def attenuate_with_tail(self, velocity, feedback_factor):
        velocity_norm = velocity / 127.0
        factor = feedback_factor + (1 - feedback_factor) * (1 - velocity_norm)
        new_velocity = max(1, floor(velocity * factor))
        return new_velocity

    def main(self, ctx: ThreadContext) -> Any:
        if not self.buffer:
            return

        now = perf_counter_ns()
        value, velocity, due_time = self.buffer[-1]

        if now >= due_time:
            self.buffer.pop()
            ctx.velocity = velocity
            yield value

            # compute feedback echo
            new_velocity = self.attenuate_with_tail(velocity, self.feedback / 100)  # type: ignore
            if new_velocity > 1:
                new_due_time = due_time + self.time * 1_000_000  # type: ignore
                self.buffer.appendleft((value, new_velocity, new_due_time))


class ConveyorLine(VirtualDevice):
    """Conveyor line

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
    """

    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    input_cv = VirtualParameter(name="input", range=(0, 127))
    buf_size_cv = VirtualParameter(
        name="buf_size", range=(1, 1000), conversion_policy="round", default=20
    )
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0), conversion_policy=">0")
    length_cv = VirtualParameter(
        name="length", range=(1, 8), conversion_policy="round", default=8
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
        self.buffer = []
        self.current = 0
        self.idx = 0
        self.outputs = [getattr(self, f"out{i}_cv") for i in range(0, self.length)]
        return {"disable_output": True}

    @on(length_cv, edge="any")
    def on_lenght_any(self, value, ctx):
        if value <= self.idx:
            return
        self.idx = value

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.buffer.clear()

    @on(buf_size_cv, edge="any")
    def on_buf_size_any(self, value, ctx):
        if len(self.buffer) <= value:
            return
        self.buffer = self.buffer[: value + 1]

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        if value == 0 or len(self.buffer) >= self.buf_size:
            return
        self.buffer.append(value)

    @on(trigger_cv, edge="rising")
    def on_trigger_rising(self, value, ctx):
        if len(self.buffer) == 0:
            return
        idx = self.idx
        if idx == 0:
            self.current = self.buffer.pop()
        self.idx = (idx + 1) % self.length
        yield 0, self.outputs
        yield self.current, [self.outputs[idx]]
