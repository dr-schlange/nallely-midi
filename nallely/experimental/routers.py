from nallely import VirtualDevice, VirtualParameter, on


class BroadcastRAM8(VirtualDevice):
    """8-slots Broadcast RAM

    Simple 8-slots piece of RAM that broadcast values of this slot when it's written.

    inputs:
    * io0_cv [0, 127] <any>: Input/trigger/output 0
    * io1_cv [0, 127] <any>: Input/trigger/Output 1
    * io2_cv [0, 127] <any>: Input/trigger/Output 2
    * io3_cv [0, 127] <any>: Input/trigger/Output 3
    * io4_cv [0, 127] <any>: Input/trigger/Output 4
    * io5_cv [0, 127] <any>: Input/trigger/Output 5
    * io6_cv [0, 127] <any>: Input/trigger/Output 6
    * io7_cv [0, 127] <any>: Input/trigger/Output 7
    * mode_cv [previous, new, both]: Which value will be broacasted on a trigger
    * trigger_cv [0, 1] >0 <rising>: Forces a global broadcast when triggered
    * reset_cv [0, 1] >0 <rising>: Reset all RAM to 0

    type: ondemand
    category: delay
    meta: disable default output
    """

    mode_cv = VirtualParameter(
        name="mode", accepted_values=["previous", " new", " both"]
    )
    io0_cv = VirtualParameter(name="io0", range=(0.0, 127.0))
    io1_cv = VirtualParameter(name="io1", range=(0.0, 127.0))
    io2_cv = VirtualParameter(name="io2", range=(0.0, 127.0))
    io3_cv = VirtualParameter(name="io3", range=(0.0, 127.0))
    io4_cv = VirtualParameter(name="io4", range=(0.0, 127.0))
    io5_cv = VirtualParameter(name="io5", range=(0.0, 127.0))
    io6_cv = VirtualParameter(name="io6", range=(0.0, 127.0))
    io7_cv = VirtualParameter(name="io7", range=(0.0, 127.0))
    trigger_cv = VirtualParameter(
        name="trigger", range=(0.0, 1.0), conversion_policy=">0"
    )
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0), conversion_policy=">0")

    def __post_init__(self, **kwargs):
        self.length = 8
        self.mem = [0] * self.length
        self.outputs = [getattr(self, f"io{i}_cv") for i in range(0, self.length)]
        return {"disable_output": True}

    @on(reset_cv, edge="rising")
    def on_reset_rising(self, value, ctx):
        self.mem = [0] * self.length

    @on(trigger_cv, edge="rising")
    def on_trigger_rising(self, value, ctx):
        for i in range(self.length):
            yield from self.handle_output(i)

    def handle_output(self, idx, value=None):
        mode = self.mode
        if mode == "previous":
            yield (self.mem[idx], [self.outputs[idx]])
        elif mode == "new":
            yield (value, [self.outputs[idx]])
        else:
            yield (self.mem[idx], [self.outputs[idx]])
            yield (value, [self.outputs[idx]])
        if value is not None:
            self.mem[idx] = value

    @on(io7_cv, edge="any")
    def on_io7_any(self, value, ctx):
        yield from self.handle_output(7, value)

    @on(io6_cv, edge="any")
    def on_io6_any(self, value, ctx):
        yield from self.handle_output(6, value)

    @on(io5_cv, edge="any")
    def on_io5_any(self, value, ctx):
        yield from self.handle_output(5, value)

    @on(io4_cv, edge="any")
    def on_io4_any(self, value, ctx):
        yield from self.handle_output(4, value)

    @on(io3_cv, edge="any")
    def on_io3_any(self, value, ctx):
        yield from self.handle_output(3, value)

    @on(io2_cv, edge="any")
    def on_io2_any(self, value, ctx):
        yield from self.handle_output(2, value)

    @on(io1_cv, edge="any")
    def on_io1_any(self, value, ctx):
        yield from self.handle_output(1, value)

    @on(io0_cv, edge="any")
    def on_io0_any(self, value, ctx):
        yield from self.handle_output(0, value)
