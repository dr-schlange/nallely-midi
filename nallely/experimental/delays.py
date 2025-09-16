from collections import deque
from math import floor
from time import perf_counter, perf_counter_ns
from typing import Any

from nallely import VirtualDevice, VirtualParameter, on
from nallely.core.world import ThreadContext


# 1000000
class Delay(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    buffer_size_cv = VirtualParameter(
        name="buffer_size", range=(2, 500), conversion_policy="round", default=500
    )
    time_cv = VirtualParameter(
        name="time", range=(10, 2000), default=20, conversion_policy="round"
    )
    feedback_cv = VirtualParameter(name="feedback", range=(0, 1), default=0.5)
    reset_cv = VirtualParameter(
        name="reset", range=(0, 1), conversion_policy=">0", default=0
    )

    dry_output_cv = VirtualParameter(name="dry_output", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.cycling = False
        self.buffer = deque(maxlen=self.buffer_size + 1)  # type: ignore
        self.wait_started = 0
        self.started = 0
        return {"target_cycle_time": 0.0001}

    @on(input_cv, edge="any")
    def bufferize(self, value, ctx):
        if self.wait_started == 0:
            self.wait_started = 1
            self.started = perf_counter_ns()

        self.buffer.appendleft(
            (value, ctx.get("velocity", 100), perf_counter_ns() - self.started)
        )
        yield value, [self.dry_output_cv]

    @on(time_cv, edge="any")
    def change_time(self, value, ctx):
        self.wait_started = 1
        self.started = perf_counter_ns()

    @on(reset_cv, edge="rising")
    def reset_buffer(self, value, ctx):
        self.buffer.clear()
        self.wait_started = 0
        return 0

    def main(self, ctx: ThreadContext) -> Any:
        if self.wait_started == 0:
            return

        if self.wait_started == 1:
            yield from self.sleep(self.time)  # type: ignore
            self.wait_started = 2
            self.new_start = perf_counter_ns()

        if not self.buffer:
            return

        value, velocity, last_delta = self.buffer[-1]
        delta = perf_counter_ns() - self.new_start
        if delta >= last_delta:
            self.buffer.pop()
            yield value
            new_velocity = floor(velocity * self.feedback)  # type: ignore
            if new_velocity > 5:
                ctx.velocity = new_velocity
                new_delta = last_delta + self.time * 1_000_000  # type: ignore
                self.buffer.appendleft((value, new_velocity, new_delta))
            else:
                yield 0
