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
