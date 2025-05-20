from nallely import ThreadContext, VirtualDevice, VirtualParameter


class PitchShifter(VirtualDevice):
    output_cv = VirtualParameter("output", range=(0, 127))
    input_cv = VirtualParameter("input", range=(0, 127))
    shift_cv = VirtualParameter("shift", range=(-48, +48))

    def __init__(self, *args, **kwargs):
        self.input = None
        self.shift = 0
        super().__init__(*args, **kwargs)

    def main(self, ctx: ThreadContext):
        return self.input + self.shift if self.input else None


class Harmonizer(VirtualDevice):
    output_cv = VirtualParameter("output", range=(0, 127))
    input_cv = VirtualParameter("input", range=(0, 127))

    def __init__(self, *args, **kwargs):
        self.input = None
        super().__init__(*args, **kwargs)

    def main(self, ctx: ThreadContext):
        # TODO
        return None
