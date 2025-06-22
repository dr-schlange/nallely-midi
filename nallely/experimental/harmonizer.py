from decimal import Decimal

from nallely import ThreadContext, VirtualDevice, VirtualParameter, on


class PitchShifter(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 128))
    shift_cv = VirtualParameter("shift", range=(-24, +24))

    @property
    def range(self):
        return (0, 127)

    def __init__(self, *args, **kwargs):
        self.input = None
        self.shift = 0
        super().__init__(*args, **kwargs)

    @on(input_cv, edge="both")
    def shift_input(self, value, ctx):
        return value + self.shift

    @on(input_cv, edge="falling")
    def reset_input(self, value, ctx):
        return 0


class Harmonizer(VirtualDevice):
    output_cv = VirtualParameter("output", range=(0, 127))
    input_cv = VirtualParameter("input", range=(0, 127))
    interval_cv = VirtualParameter("interval", range=(-7, 7))
    key_cv = VirtualParameter(
        "key",
        accepted_values=[
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
        ],
    )
    scale_cv = VirtualParameter("scale_", accepted_values=["major", "minor natural"])

    def __init__(self, *args, **kwargs):
        self.scales = {
            "major": [0, 2, 4, 5, 7, 9, 11],
            "minor natural": [0, 2, 3, 5, 7, 8, 10],
        }
        self.input = None
        self.interval = 0
        self.key = "C"
        self.scale_ = "major"

        super().__init__(*args, **kwargs)

    def process_input(self, param: str, value):
        if param == "key" and isinstance(value, (int, float, Decimal)):
            accepted_values = getattr(self.__class__, "key_cv").accepted_values
            value = accepted_values[int(value % len(accepted_values))]
        elif param == "scale_" and isinstance(value, (int, float, Decimal)):
            accepted_values = getattr(self.__class__, "scale_cv").accepted_values
            value = accepted_values[int(value % len(accepted_values))]
        return super().process_input(param, value)

    def get_scale_for_key(self, key, scale_type):
        scale = self.scales[scale_type]
        key_idx = getattr(self.__class__, "key_cv").accepted_values.index(key)
        return [(degree + key_idx) % 12 for degree in scale]

    def midi_to_scale_degree(self, note, scale):
        pitch_class = note % 12
        octave = note // 12
        if pitch_class in scale:
            scale_degree = scale.index(pitch_class)
            return octave * 7 + scale_degree
        lower_degrees = [i for i, pc in enumerate(scale) if pc <= pitch_class]
        if not lower_degrees:
            return (octave - 1) * 7 + len(scale) - 1
        return octave * 7 + max(lower_degrees)

    def scale_degree_to_midi(self, degree, scale):
        octave = degree // 7
        index = degree % 7
        return octave * 12 + scale[index]

    def main(self, ctx: ThreadContext):
        if self.input is None:
            return None

        note = self.input
        interval = self.interval
        key = self.key
        scale_type = self.scale_

        scale = self.get_scale_for_key(key, scale_type)
        input_degree = self.midi_to_scale_degree(note, scale)
        harmonized_degree = input_degree + interval
        harmonized_note = self.scale_degree_to_midi(harmonized_degree, scale)

        return harmonized_note
