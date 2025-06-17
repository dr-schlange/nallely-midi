from collections import deque
from typing import Any

from nallely import VirtualDevice, VirtualParameter, on
from nallely.core import ParameterInstance, ThreadContext


class Mono2Poly(VirtualDevice):
    """
    Mono2Poly, virtual device that provides an input: gate, and multiple outputs.
    The allocator keeps track of the notes that have been allocated to an output.
    When a "note_on" is received, the allocator check which output is not yet occupied and routes the note there.
    If all the output are allocated, the new notes are allocated following a kind of round robin
    When a "note_off" is received, the allocator frees the previously allocated output.

    currently buggy, need to revisit properly the round robin (current version is a hacky version to have a quick PoC)
    """

    input_cv = VirtualParameter(name="input", range=(0, 127))
    gate_cv = VirtualParameter(name="gate", range=(0, 1))
    output_number_cv = VirtualParameter(name="outport_number", range=(1, 5))

    def __init__(self, outport_number=5, **kwargs):
        self._outport_number = outport_number
        self.output = None
        self.input = 0
        self.last_value = None
        self.gate = 0
        self.last_type = None
        self.allocator: deque[int | None] = deque([None] * outport_number)
        self._update_outputs()
        super().__init__(target_cycle_time=1 / 50, **kwargs)

    def _update_outputs(self, update=False):
        self.outputs: list[ParameterInstance]
        if update:
            diff = self._outport_number - len(self.outputs)
            if diff < 0:
                from_ = self._outport_number
                rem = True
            elif diff > 0:
                from_ = diff
                rem = False
            else:
                rem = False
                from_ = self._outport_number
        else:
            from_ = 1
            self.outputs = [self.output_cv]
            rem = False

        # We remove the old ones
        if rem:
            for output in self.outputs[
                len(self.outputs) : self._outport_number - 1 : -1
            ]:
                delattr(self.__class__, output.parameter.cv_name)  # type: ignore
                output.device.unbind_link(output, None)  # we unbind from this parameter
        else:
            # We add the new ones
            for i in range(from_, self._outport_number):
                name = f"output{i}"
                cv_name = f"{name}_cv"
                out = VirtualParameter(name=name, cv_name=cv_name, range=(0, 127))
                # We inject at run time new VirtualParameters
                setattr(self.__class__, cv_name, out)
                self.outputs.append(getattr(self, cv_name))
                setattr(self, name, 0)

        self.queue = deque(self.outputs)

    @property
    def outport_number(self):
        return self._outport_number

    @outport_number.setter
    def outport_number(self, value):
        self._outport_number = value
        self._update_outputs(update=True)

    def _next(self):
        item = self.queue[0]
        self.queue.rotate(-1)
        self.allocator.rotate(-1)
        return item

    def _current(self):
        return self.queue[0]

    @on(input_cv, edge="rising")
    def on_input(self, value, ctx):
        self.send_out(value, ctx, selected_outputs=[self.output_cv])

    @on(gate_cv, edge="any")
    def on_gate(self, value, ctx):
        self.send_out(self.input, ctx, selected_outputs=[self.output_cv])

    def main(
        self, ctx: ThreadContext
    ) -> Any: ...  # IDLE, poll at a specific frequency (target_cycle_time)


class Gate(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    gate_cv = VirtualParameter(name="gate", range=(0, 1))

    def __init__(self, **kwargs):
        self.input = 0
        self.gate = 0
        super().__init__(target_cycle_time=1 / 50, **kwargs)

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        if self.gate > 0:
            self.send_out(value, ctx, selected_outputs=[self.output_cv])

    @on(gate_cv, edge="falling")
    def on_gate_down(self, _, ctx):
        self.send_out(0, ctx, selected_outputs=[self.output_cv])

    @on(gate_cv, edge="rising")
    def on_gate_up(self, _, ctx):
        self.send_out(self.input, ctx, selected_outputs=[self.output_cv])

    def main(
        self, ctx: ThreadContext
    ) -> Any: ...  # IDLE, poll at a specific frequency (target_cycle_time)


class Arpegiator(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
    bpm_cv = VirtualParameter("bpm", range=(40, 600))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    hold_cv = VirtualParameter("hold", range=(0, 1))
    record_cv = VirtualParameter("record", range=(0, 1))

    def __init__(self, *args, **kwargs):
        self.input = None
        self._bpm = 500
        self.notes = []
        self.index = 0
        self.reset = 0
        self.hold = 0
        self.record = 0
        super().__init__(
            *args, target_cycle_time=(1 / 1000) * (60000 / self._bpm), **kwargs
        )

    @property
    def bpm(self):
        return self._bpm

    @bpm.setter
    def bpm(self, value):
        self._bpm = value
        self.target_cycle_time = (1 / 1000) * (60000 / value)

    def setup(self) -> ThreadContext:
        ctx = super().setup()
        ctx.prev_hold = 0
        return ctx

    def main(self, ctx: ThreadContext) -> Any:
        if self.reset > 0:
            self.reset = 0
            for note in self.notes:
                self.send_out(
                    note,
                    ThreadContext({**ctx, "type": "note_off"}),
                )
            self.index = 0
            self.notes = []
            return
        if ctx.prev_hold > 0 and self.hold == 0:
            ctx.prev_hold = 0
            self.reset = 1
        elif ctx.prev_hold != self.hold:
            ctx.prev_hold = self.hold

        type = ctx.get("type", None)
        value = self.input
        if value:
            if (
                type == "note_off"
                and not self.record
                and not self.hold
                and value in self.notes
            ):
                self.input = None
                self.index = self.index + (-1 if self.index > 0 else 0)
                self.notes.remove(value)
                self.send_out(
                    value,
                    ThreadContext({**ctx, "type": "note_off"}),
                )
            elif type == "note_on" and self.record > 0 and value not in self.notes:
                self.input = None
                self.notes.append(value)

        if len(self.notes) > 0:
            self.send_out(
                self.notes[self.index - 1],
                ThreadContext({**ctx, "type": "note_off"}),
            )
            self.send_out(
                self.notes[self.index],
                ThreadContext({**ctx, "type": "note_on"}),
            )
            self.index += 1
            if self.index >= len(self.notes):
                self.index = 0

        return None
