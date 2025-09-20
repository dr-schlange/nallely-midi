import bisect
import random
from decimal import Decimal

from .core.virtual_device import VirtualDevice, VirtualParameter, on


class PitchShifter(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 128))
    shift_cv = VirtualParameter("shift", range=(-24, +24))

    @property
    def range(self):
        return (0, 127)

    def __init__(self, *args, **kwargs):
        self.input = 0
        self.shift = 0
        super().__init__(*args, **kwargs)

    @on(input_cv, edge="both")
    def shift_input(self, value, ctx):
        return value + self.shift

    @on(input_cv, edge="falling")
    def reset_input(self, value, ctx):
        return 0

    @on(shift_cv, edge="both")
    def apply_shift(self, value, ctx):
        if self.input > 0:
            return self.input + value
        return 0


class Modulo(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 128))
    modulo_cv = VirtualParameter("modulo", range=(0.001, None))

    @property
    def range(self):
        upper_bound = self.modulo_cv.parameter.range[1]
        if isinstance(upper_bound, (float, int, Decimal)):
            upper_bound -= 1
        return (0, upper_bound)

    def __init__(self, *args, **kwargs):
        self.input = 0
        self.modulo = 1
        super().__init__(*args, **kwargs)

    def store_input(self, param: str, value):
        if param == "modulo" and value == 0:
            value = 0.001
        elif param == "modulo":
            value = float(value)
        return super().store_input(param, value)

    @on(input_cv, edge="both")
    def modulo_input(self, value, ctx):
        return value % self.modulo

    @on(input_cv, edge="falling")
    def reset_input(self, value, ctx):
        return 0

    @on(modulo_cv, edge="both")
    def apply_modulo(self, value, ctx):
        if self.input > 0:
            return value % float(self.modulo)
        return 0


class Arpegiator(VirtualDevice):
    input_cv = VirtualParameter("input", range=(24, 108))
    bpm_cv = VirtualParameter("bpm", range=(20, 600))
    direction_cv = VirtualParameter(
        "direction", accepted_values=("free", "up", "down", "up-down", "random")
    )
    reset_cv = VirtualParameter("reset", range=(0, 1))

    @property
    def range(self):
        return 24, 108

    # def store_input(self, param: str, value):
    #     if param == "direction" and isinstance(value, (int, float, Decimal)):
    #         value = self.direction_cv.parameter.map2accepted_values(value)
    #     return super().store_input(param, value)

    def __init__(self, **kwargs):
        self.input = None
        self.reset = 0
        self.notes = []
        self.index = -1
        self.direction = "free"
        self._incr = +1
        self.bpm = 320
        super().__init__(**kwargs)

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        self.notes.clear()
        return 0

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        if value == 0:
            self.notes.clear()
            return 0
        if value in self.notes:
            self.notes.remove(value)
            if len(self.notes) == 0:
                return 0
        else:
            self.notes.append(value)
            return value

    def main(self, ctx):
        if len(self.notes) == 0:
            return

        if self.direction in ("up", "down", "up-down"):
            sorted_notes = sorted(self.notes)
        else:
            sorted_notes = self.notes

        len_notes = len(self.notes)
        if len_notes == 1:
            self.index = 0

        if self.index < 0 or self.index >= len_notes:
            self.index = 0
            self._incr = 1

        yield sorted_notes[self.index]
        yield from self.sleep(60_000 / self.bpm)

        if self.direction == "up":
            self.index += 1
            if self.index >= len_notes:
                self.index = 0
        elif self.direction == "down":
            self.index -= 1
            if self.index < 0:
                self.index = len_notes - 1
        elif self.direction == "up-down":
            if len_notes == 1:
                self.index = 0
            else:
                next_index = self.index + self._incr

                if next_index >= len_notes:
                    self._incr = -1
                    next_index = self.index + self._incr
                elif next_index < 0:
                    self._incr = 1
                    next_index = self.index + self._incr

                self.index = next_index
        elif self.direction == "random" and len_notes > 1:
            prev_index = self.index
            while True:
                self.index = random.randint(0, len_notes - 1)
                if self.index != prev_index:
                    break


class Looper(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))

    record_cv = VirtualParameter("record", range=(0, 1))
    clear_cv = VirtualParameter("clear", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    speed_cv = VirtualParameter("speed", range=(0, 127))
    reverse_cv = VirtualParameter("reverse", range=(0, 1))

    output3_cv = VirtualParameter("output3", range=(0, 127))
    output2_cv = VirtualParameter("output2", range=(0, 127))
    output1_cv = VirtualParameter("output1", range=(0, 127))

    @property
    def range(self):
        return 0, 127

    def __init__(self, **kwargs):
        self.recording = False
        self.loop = []
        self.loop_start = 0
        self.playing = False
        self.last_assigned_channel = -1
        self.outputs = [
            self.output_cv,
            self.output1_cv,
            self.output2_cv,
            self.output3_cv,
        ]
        self.input = 0
        self.record = 0
        self.clear = 0
        self.reset = 0
        self.reverse = 0
        self._stopping = False
        for i in range(1, 4):
            setattr(self, f"output{i}", 0)
        self.active_notes = {}
        self.current_index = 0
        self.speed = 1.0
        super().__init__(**kwargs)

    def normalize_loop(self):
        if self.loop:
            first_ts = self.loop[0][0]
            self.loop = [(ts - first_ts, group) for ts, group in self.loop]

    @on(record_cv, edge="rising")
    def start_recording(self, value, ctx):
        if self.debug:
            print("+ START RECORDING")
        self.recording = True
        self.playing = False
        self.loop.clear()
        self.loop_start = self.current_time_ms()
        self.current_index = 0

    @on(record_cv, edge="falling")
    def stop_recording(self, value, ctx):
        if self.debug:
            print("+ STOP RECORDING")
        self.recording = False
        now = self.current_time_ms()

        if self.loop:
            self.loop_duration = now - self.loop_start
            self.normalize_loop()
            self.playing = True

    @on(clear_cv, edge="rising")
    def on_clear(self, value, ctx):
        if self.debug:
            print("  CLEAR")
        self._stopping = True

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        if self.debug:
            print("  RESET")
        if self.reverse:
            self.current_index = len(self.loop)
        else:
            self.current_index = 0

    @on(speed_cv, edge="any")
    def on_speed_change(self, value, ctx):
        self.speed = max(0.01, value)
        if self.debug:
            print(f"  SPEED set to {self.speed}x")

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        if not self.recording:
            return
        if value == 0:
            return

        if len(self.loop) == 0:
            self.loop_start = self.current_time_ms()

        timestamp = self.current_time_ms() - self.loop_start

        if value in self.active_notes:
            channel = self.active_notes[value]
            if self.loop and abs(self.loop[-1][0] - timestamp) < 10:
                self.loop[-1][1].append((0, channel))
            else:
                self.last_assigned_channel = (self.last_assigned_channel + 1) % len(
                    self.outputs
                )
                self.loop.append((timestamp, [(0, channel)]))
            del self.active_notes[value]
            return

        if self.loop and abs(self.loop[-1][0] - timestamp) < 10:
            channel = self.loop[-1][1][0][1]
            self.loop[-1][1].append((value, channel))
        else:
            self.last_assigned_channel = (self.last_assigned_channel + 1) % len(
                self.outputs
            )
            channel = self.last_assigned_channel
            self.loop.append((timestamp, [(value, channel)]))

        self.active_notes[value] = channel
        if self.debug:
            print(f"  NOTE ON {value=} assigned to {channel=} at {timestamp}ms")

    def current_time_ms(self):
        import time

        return int(time.monotonic() * 1000)

    def main(self, ctx):
        if self._stopping:
            self._stopping = False
            self.loop.clear()
            self.playing = False
            self.recording = False
            return 0, self.outputs

        if not self.playing or not self.loop:
            if self.recording and not self.playing:
                # Allow other events to come in while idle in recording mode
                yield from self.sleep(10)
            return

        now = self.current_time_ms()

        if self.current_index == 0:
            self.play_start_time = now

        if self.reverse:
            rev_index = len(self.loop) - 1 - self.current_index
            if rev_index < 0:
                elapsed = now - self.play_start_time
                remaining = self.loop_duration - elapsed
                if remaining > 0:
                    yield from self.sleep(remaining)
                self.current_index = 0
                self.play_start_time = self.current_time_ms()
                return

            ts, group = self.loop[rev_index]
            target_time = self.loop_duration - ts
            elapsed = now - self.play_start_time
            wait_time = (target_time - elapsed) / self.speed

            if wait_time > 0:
                yield from self.sleep(wait_time)

            for value, channel in group:
                yield value, [self.outputs[channel]]

            self.current_index += 1
        else:
            if self.current_index >= len(self.loop):
                elapsed = now - self.play_start_time
                remaining = (self.loop_duration - elapsed) / self.speed
                if self.debug:
                    print(f"  REMAINING {remaining}ms")
                if remaining > 0:
                    yield from self.sleep(remaining)
                self.current_index = 0
                self.play_start_time = self.current_time_ms()
                return

            ts, group = self.loop[self.current_index]
            wait_time = (ts - (now - self.play_start_time)) / self.speed

            if wait_time > 0:
                yield from self.sleep(wait_time)

            for value, channel in group:
                yield value, [self.outputs[channel]]

            self.current_index += 1


NOTES = {
    "C": 0,
    "C#/Db": 1,
    "D": 2,
    "D#/Eb": 3,
    "E": 4,
    "F": 5,
    "F#/Gb": 6,
    "G": 7,
    "G#/Ab": 8,
    "A": 9,
    "A#/Bb": 10,
    "B": 11,
}
NOTE_NAMES = tuple(NOTES.keys())
INTERVALS = {
    "maj": (0, 2, 2, 1, 2, 2, 2, 1),
    "min-harmo": (0, 2, 1, 2, 2, 1, 3, 1),
    "min-melo": (0, 2, 1, 2, 2, 2, 2, 1),
}

SCALES = {
    "maj": (0, 2, 4, 5, 7, 9, 11),
    "min-harmo": (0, 2, 3, 5, 7, 8, 11),
    "min-melo": (0, 2, 3, 5, 7, 9, 11),
}


class Quantizer(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
    trigger_cv = VirtualParameter("trigger", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    root_cv = VirtualParameter("root", accepted_values=NOTE_NAMES, disable_policy=True)
    scale__cv = VirtualParameter(
        "scale_", accepted_values=tuple(INTERVALS.keys()), disable_policy=True
    )
    type_cv = VirtualParameter("type", accepted_values=("sample&hold", "free"))

    def __init__(self, **kwargs):
        self.input = 0
        self.root = self.root_cv.parameter.accepted_values[0]
        self.scale_ = self.scale__cv.parameter.accepted_values[0]
        self.type = self.type_cv.parameter.accepted_values[0]
        self.trigger = 0
        self.reset = 0
        self.hold = None
        self.update_nearest_table(NOTES[self.root], SCALES[self.scale_])
        super().__init__(**kwargs)

    def store_input(self, param: str, value):
        if param == "root":
            accepted_values = self.root_cv.parameter.accepted_values
            if isinstance(value, (int, float, Decimal)):
                value = accepted_values[int(value % 12)]
            self.update_nearest_table(NOTES[value], SCALES[self.scale_])
        elif param == "scale_":
            accepted_values = self.scale__cv.parameter.accepted_values
            if isinstance(value, (int, float, Decimal)):
                value = accepted_values[int(value % len(accepted_values))]
            self.update_nearest_table(NOTES[self.root], SCALES[value])
        # elif param == "type" and isinstance(value, (int, float, Decimal)):
        #     value = self.type_cv.parameter.map2accepted_values(value)
        elif param == "trigger" or param == "reset":
            value = 1 if value > 0 else 0
        return super().store_input(param, value)

    @staticmethod
    def nearest_note(relative_note, scale_instance):
        i = bisect.bisect_left(scale_instance, relative_note)
        if i == 0:
            return scale_instance[0]
        if i == len(scale_instance):
            return scale_instance[-1]
        before = scale_instance[i - 1]
        after = scale_instance[i]
        if abs(after - relative_note) < abs(relative_note - before):
            return after
        return before

    def update_nearest_table(self, root, scale_instance):
        shifted_scale = [(n + root) % 12 for n in scale_instance]
        self.table = [self.nearest_note(pc, shifted_scale) for pc in range(12)]

    def snap_to_scale(self, note):
        note = int(note)
        octave = note // 12
        return self.table[note % 12] + (12 * octave)

    @on(input_cv, edge="any")
    def convert_note(self, value, ctx):
        if self.type == "sample&hold":
            return
        return self.snap_to_scale(value)

    @on(trigger_cv, edge="rising")
    def trigger_sample(self, value, ctx):
        if self.type == "sample&hold":
            self.hold = self.snap_to_scale(self.input)
            return self.hold

    @on(reset_cv, edge="rising")
    def reset_input(self, value, ctx):
        yield self.hold  # we return the same held note to force a note-off
        self.hold = None


ROOT = 0
FLAT_SECOND = 1
SECOND = 2
MINOR_THIRD = 3
THIRD = 4
FOURTH = 5
AUG_FOURTH = 6
FLAT_FIFTH = AUG_FOURTH
FIFTH = 7
AUG_FIFTH = 8
DIM_SIXTH = AUG_FIFTH
SIXTH = 9
AUG_SIXTH = 10
SEVENTH = AUG_SIXTH
MAJ_SEVENTH = 11
OCTAVE = 12

CHORD_INTERVALS = {
    "maj": (ROOT, THIRD, FIFTH),
    "min": (ROOT, MINOR_THIRD, FIFTH),
    "maj7": (ROOT, THIRD, FIFTH, MAJ_SEVENTH),
    "min7": (ROOT, MINOR_THIRD, FIFTH, SEVENTH),
    "min7maj": (ROOT, MINOR_THIRD, FIFTH, MAJ_SEVENTH),
    "7th": (ROOT, THIRD, FIFTH, SEVENTH),
    "maj7#11": (ROOT, AUG_FOURTH, FIFTH, SEVENTH),
    "dim": (ROOT, MINOR_THIRD, FLAT_FIFTH, SIXTH),
    "m7b5": (ROOT, MINOR_THIRD, FLAT_FIFTH, SEVENTH),
}

NOTES_INTERVALS = {
    "--": -1,
    "root": ROOT,
    "b2": FLAT_SECOND,
    "2nd": SECOND,
    "m3": MINOR_THIRD,
    "3rd": THIRD,
    "4th": FOURTH,
    "4+/-5": AUG_FOURTH,
    "5th": FIFTH,
    "5+/m6": AUG_FIFTH,
    "6th": SIXTH,
    "6+/b7": SEVENTH,
    "7th": MAJ_SEVENTH,
    "octave": OCTAVE,
}


class ChordGenerator(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127), conversion_policy="round")
    chord_cv = VirtualParameter(
        name="chord",
        accepted_values=(
            "maj",
            "min",
            "maj7",
            "min7",
            "7th",
            "maj7#11",
            "dim",
            "m7b5",
            "min7maj",
            "custom",
        ),
    )
    octave_cv = VirtualParameter(
        name="octave", range=(-4, +4), conversion_policy="round"
    )
    inversion_cv = VirtualParameter(
        name="inversion", accepted_values=("--", "1st", "2nd", "3rd", "4th")
    )
    drop_cv = VirtualParameter(name="drop", accepted_values=("--", "drop2", "drop3"))
    omit_cv = VirtualParameter(name="omit", accepted_values=("--", "omit5", "omit3"))

    custom0_cv = VirtualParameter(
        name="custom0",
        accepted_values=tuple(NOTES_INTERVALS.keys()),
        conversion_policy="round",
    )
    custom1_cv = VirtualParameter(
        name="custom1",
        accepted_values=tuple(NOTES_INTERVALS.keys()),
        conversion_policy="round",
    )
    custom2_cv = VirtualParameter(
        name="custom2",
        accepted_values=tuple(NOTES_INTERVALS.keys()),
        conversion_policy="round",
    )
    custom3_cv = VirtualParameter(
        name="custom3",
        accepted_values=tuple(NOTES_INTERVALS.keys()),
        conversion_policy="round",
    )
    custom4_cv = VirtualParameter(
        name="custom4",
        accepted_values=tuple(NOTES_INTERVALS.keys()),
        conversion_policy="round",
    )

    note4_cv = VirtualParameter(name="note4", range=(0, 127))
    note3_cv = VirtualParameter(name="note3", range=(0, 127))
    note2_cv = VirtualParameter(name="note2", range=(0, 127))
    note1_cv = VirtualParameter(name="note1", range=(0, 127))
    note0_cv = VirtualParameter(name="note0", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.outs = [
            self.note0_cv,
            self.note1_cv,
            self.note2_cv,
            self.note3_cv,
            self.note4_cv,
        ]
        self.custom_interval_computation()
        return {"disable_output": True}

    def custom_interval_computation(self):
        self.custom = []
        for i in range(4):
            inter = NOTES_INTERVALS[getattr(self, f"custom{i}")]
            if inter != -1:
                self.custom.append(inter)

    @on(custom0_cv, edge="any")
    def recompute0(self, value, ctx):
        self.custom_interval_computation()
        yield from self.process()

    @on(custom1_cv, edge="any")
    def recompute1(self, value, ctx):
        self.custom_interval_computation()
        yield from self.process()

    @on(custom2_cv, edge="any")
    def recompute2(self, value, ctx):
        self.custom_interval_computation()
        yield from self.process()

    @on(custom3_cv, edge="any")
    def recompute3(self, value, ctx):
        self.custom_interval_computation()
        yield from self.process()

    @on(custom4_cv, edge="any")
    def recompute4(self, value, ctx):
        self.custom_interval_computation()
        yield from self.process()

    @on(octave_cv, edge="any")
    def retrigger_on_octave(self, value, ctx):
        yield from self.process()

    @on(inversion_cv, edge="any")
    def retrigger_on_inversion(self, value, ctx):
        yield from self.process()

    @on(chord_cv, edge="any")
    def retrigger_on_chord(self, value, ctx):
        yield from self.process()

    @on(drop_cv, edge="any")
    def retrigger_on_drop(self, value, ctx):
        yield from self.process()

    @on(omit_cv, edge="any")
    def retrigger_on_omit(self, value, ctx):
        yield from self.process()

    def apply_drop(self, intervals):
        if len(intervals) < 3:
            return intervals
        if self.drop == "drop2":  # type: ignore
            intervals.insert(0, intervals.pop(1) - OCTAVE)
        elif self.drop == "drop3":  # type: ignore
            intervals.insert(0, intervals.pop(2) - OCTAVE)
        return intervals

    def apply_omit(self, intervals):
        intervals = list(intervals)
        if self.chord == "custom":  # type: ignore
            return intervals
        if self.omit == "omit5":  # type: ignore
            del intervals[2]
        elif self.omit == "omit3":  # type: ignore
            del intervals[1]
        return intervals

    def apply_inversion(self, intervals):
        nb_inversions = self.inversion_cv.parameter.accepted_values.index(self.inversion)  # type: ignore
        for _ in range(nb_inversions):
            intervals.append(intervals.pop(0) + OCTAVE)
        return intervals

    def process(self):
        if self.input == 0:  # type: ignore
            return 0, self.outs
        if self.chord == "custom":  # type: ignore
            intervals = self.custom
        else:
            intervals = CHORD_INTERVALS[self.chord]  # type: ignore
        intervals = self.apply_drop(self.apply_inversion(self.apply_omit(intervals)))
        chord = tuple((value + interval) + self.octave * OCTAVE for interval in intervals)  # type: ignore
        for note, out in zip(chord, self.outs[: len(chord)]):
            yield note, [out]

    @on(input_cv, edge="any")
    def transform_input(self, value, ctx):
        yield from self.process()
        # if value == 0:
        #     return 0, self.outs
        # if self.chord == "custom":  # type: ignore
        #     intervals = self.custom
        # else:
        #     intervals = CHORD_INTERVALS[self.chord]  # type: ignore
        # intervals = self.apply_drop(self.apply_inversion(self.apply_omit(intervals)))
        # chord = tuple((value + interval) + self.octave * OCTAVE for interval in intervals)  # type: ignore
        # for note, out in zip(chord, self.outs[: len(chord)]):
        #     yield note, [out]
