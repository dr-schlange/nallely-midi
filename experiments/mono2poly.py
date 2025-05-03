from nallely import VirtualDevice, VirtualParameter
from collections import deque


class NoteAllocator(VirtualDevice):
    """
    Note allocator, virtual device that provides an input: gate, and multiple outputs.
    The allocator keeps track of the notes that have been allocated to an output.
    When a "note_on" is received, the allocator check which output is not yet occupied and routes the note there.
    If all the output are allocated, the new notes played are just ignored.
    When a "note_off" is received, the allocator frees the previously allocated output.
    """

    # we create the input and mark it as "consumer", meaning it receives values and does something with them in "receiving", having a context for the value received
    gate_cv = VirtualParameter(name="gate", consumer=True, range=(0, None))

    def __init__(self, outport_number=2, **kwargs):
        super().__init__(target_cycle_time=1 / 50, **kwargs)
        self.outport_number = outport_number
        self.output = 0
        self.gate = 0
        self.allocator = [None] * outport_number
        self.outputs = ["output"]
        for i in range(1, self.outport_number):
            name = f"output{i}"
            cv_name = f"{name}_cv"
            self.outputs.append(name)
            # We inject at run time a new VirtualParameter
            setattr(
                self.__class__, cv_name, VirtualParameter(name=name, cv_name=cv_name)
            )
            setattr(self, name, 0)
        self.queue = deque(self.outputs)

    def _next(self):
        item = self.queue[0]
        self.queue.rotate(-1)
        return item

    def receiving(self, value, on: str, ctx):
        mode = ctx.get("mode", None)
        if mode is None and value > 0:
            output = self._next()
            setattr(self, output, value)
            ctx.type = "note_on"
            ctx.mode = "note"
            # we send the value on this output, i.e: we trigger the right callbacks (the one associated to this output)
            self.process_output(value, ctx, selected_outputs=[output])

        elif mode == "note":
            type = ctx.type
            # When we release a note
            if type == "note_off":
                try:
                    idx = self.allocator.index(value)
                    self.allocator[idx] = None
                    # we get the name of the corresponding output
                    output = self.outputs[idx]
                    # we route the value to this output, i.e: we write a value to a variable that will be read later by the callback that will be triggered
                    setattr(self, output, value)
                    # we send the value on this output, i.e: we trigger the right callbacks (the one associated to this output)
                    self.process_output(value, ctx, selected_outputs=[output])
                except ValueError:
                    ...  # if there is no note allocated with this value, we do nothing
                return
            # When we allocate a note
            try:
                idx = self.allocator.index(None)  # first free spot
            except ValueError:
                return  # there is no more spot, we do nothing
            self.allocator[idx] = value  # we mark the spot as taken
            output = self.outputs[idx]  # we get the name of the corresponding output
            setattr(self, output, value)  # we route the value to this output
            self.process_output(
                value, ctx, selected_outputs=[output]
            )  # we send the value on this output
