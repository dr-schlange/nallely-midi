from collections import deque
from typing import Any

from nallely import VirtualDevice, VirtualParameter
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
    output_number_cv = VirtualParameter(name="outport_number", range=(1, 5))

    def __init__(self, outport_number=5, **kwargs):
        self._outport_number = outport_number
        self.output = None
        self.input = 0
        self.last_value = None
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
                out = VirtualParameter(name=name, cv_name=cv_name)
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

    def main(self, ctx: ThreadContext) -> Any:
        mode = ctx.get("mode", ctx.get("type", None))
        value = self.input

        # If there is no "mode", we are receiving from a virtual device
        if mode is None and value > 0:
            output = self._next()
            ctx.type = "note_on"
            ctx.mode = "note"
            # we send the value on this output, i.e: we trigger the right callbacks (the one associated to this output)
            self.process_output(value, ctx, selected_outputs=[output])
            return

        # If there is a mode and it's a "note" mode, we route
        if mode in ["note_on", "note", "note_off"]:
            type = ctx.type

            # We skip to avoid double allocation
            if type == self.last_type and self.last_value == value:
                return

            # when a note is released
            if type == "note_off":
                try:
                    idx = self.allocator.index(value)
                    self.allocator[idx] = None
                    # we get the name of the corresponding output
                    out = self.outputs[idx]
                    # we send the value on this output, i.e: we trigger the right callbacks (the one associated to this output)
                    self.process_output(value, ctx, selected_outputs=[out])
                except ValueError:
                    self.process_output(value, ctx, selected_outputs=self.outputs)
                self.last_value = value
                self.last_type = type
                return
            # When we allocate a note
            try:
                idx = self.allocator.index(None)  # first free spot
            except ValueError:
                current = self._current()
                old = self.allocator[0]
                self.process_output(
                    old,
                    ThreadContext({**ctx, "type": "note_off"}),
                    selected_outputs=[current],
                )
                output = self._next()
            else:
                self.allocator[idx] = value  # we mark the spot as taken
                output = self.outputs[
                    idx
                ]  # we get the name of the corresponding output
            self.last_value = value
            self.last_type = type
            self.process_output(
                value, ctx, selected_outputs=[output]
            )  # we send the value on this output

        return (
            None  # we deactivate the normal output, we trigger the right one manually
        )
