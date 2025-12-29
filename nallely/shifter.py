import bisect
import math
import random
from decimal import Decimal

from .core.virtual_device import VirtualDevice, VirtualParameter, on


class PitchShifter(VirtualDevice):
    """Pitch shifter
    Shifts a note from -48.0 to +48.0 semitones.
    Semi-tones can be decimal values, input can be also a decimal values, they are quantized later if needed.

    inputs:
    * input_cv [0, 127] <any>: the input note to shift (0-127)
    * shift_cv [-48, 48] init=0 <both>: the amount of shift to apply (-48 to +48)

    outputs:
    * output_cv [0, 127]: the shifted note (0-127)

    type: ondemand
    category: pitch
    """

    input_cv = VirtualParameter("input", range=(0, 127))
    shift_cv = VirtualParameter("shift", range=(-48, +48), default=0)

    @on(input_cv, edge="any")
    def shift_input(self, value, ctx):
        if value == 0:
            return 0
        return value + self.shift

    @on(shift_cv, edge="both")
    def apply_shift(self, value, ctx):
        if self.input > 0:
            return self.input + value
        return 0


class Modulo(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
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
SCALE_INTERVALS = {
    "maj": (0, 2, 2, 1, 2, 2, 2, 1),
    "min-harmo": (0, 2, 1, 2, 2, 1, 3, 1),
    "min-melo": (0, 2, 1, 2, 2, 2, 2, 1),
}

SCALES = {
    "maj": (ROOT, SECOND, THIRD, FOURTH, FIFTH, SIXTH, MAJ_SEVENTH),
    "min-harmo": (ROOT, SECOND, MINOR_THIRD, FOURTH, FIFTH, AUG_FIFTH, MAJ_SEVENTH),
    "min-melo": (ROOT, SECOND, MINOR_THIRD, FOURTH, FIFTH, SIXTH, MAJ_SEVENTH),
    "min-penta": (ROOT, MINOR_THIRD, FOURTH, FIFTH, SEVENTH),
    "min6-penta": (ROOT, MINOR_THIRD, FOURTH, FIFTH, SIXTH, SEVENTH),
    "maj-penta": (ROOT, SECOND, THIRD, FIFTH, SEVENTH),
}


class Quantizer(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
    trigger_cv = VirtualParameter("trigger", range=(0, 1), conversion_policy=">0")
    reset_cv = VirtualParameter("reset", range=(0, 1))
    root_cv = VirtualParameter("root", accepted_values=NOTE_NAMES, disable_policy=True)
    scale__cv = VirtualParameter(
        "scale_", accepted_values=tuple(SCALE_INTERVALS.keys()), disable_policy=True
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
        name="octave", range=(-4, +4), conversion_policy="round", default=0
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
        chord = tuple((self.input + interval) + self.octave * OCTAVE for interval in intervals)  # type: ignore
        for note, out in zip(chord, self.outs[: len(chord)]):
            yield note, [out]

    @on(input_cv, edge="any")
    def transform_input(self, value, ctx):
        if value == 0:
            return 0, self.outs

        yield from self.process()


class HarmonicGenerator(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    nums_cv = VirtualParameter(
        name="nums", range=(2, 4), conversion_policy="round", default=4
    )
    mode_cv = VirtualParameter(name="mode", accepted_values=("cv", "pitch"))

    level1_cv = VirtualParameter(name="level1", range=(0, 100), default=50)
    level2_cv = VirtualParameter(name="level2", range=(0, 100), default=50)
    level3_cv = VirtualParameter(name="level3", range=(0, 100), default=50)
    level4_cv = VirtualParameter(name="level4", range=(0, 100), default=50)

    out1_cv = VirtualParameter(name="out1", range=(0, 127))
    out2_cv = VirtualParameter(name="out2", range=(0, 127))
    out3_cv = VirtualParameter(name="out3", range=(0, 127))
    out4_cv = VirtualParameter(name="out4", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.phase = 0.0
        return {"disable_output": True}

    def process(self):
        nums = self.nums  # type: ignore
        input = self.input  # type: ignore
        levels = [getattr(self, f"level{i}") / 100.0 for i in range(1, nums + 1)]
        mode = self.mode  # type: ignore

        if mode == "cv":
            base_freq = input / 127.0 * 10.0
            max_total = sum(levels)
            self.phase += base_freq * self.target_cycle_time
            self.phase %= 1.0
            total = sum(
                level * math.sin(2 * math.pi * n * self.phase)
                for n, level in enumerate(levels, start=1)
            )
            scaled = (total + max_total) / (2 * max_total) * 127
            yield scaled, [self.out1_cv]
        else:
            for harmo, level in enumerate(levels, start=1):
                value = harmo * level * input
                scaled = value / (max(input, 0.0001) * nums) * 127
                yield scaled, [getattr(self, f"out{harmo}_cv")]

    @on(nums_cv, edge="any")
    def nums_change(self, value, ctx):
        yield from self.process()

    @on(mode_cv, edge="any")
    def mode_change(self, value, ctx):
        yield from self.process()

    @on(input_cv, edge="any")
    def input_change(self, value, ctx):
        yield from self.process()

    @on(level1_cv, edge="any")
    def level1_change(self, value, ctx):
        yield from self.process()

    @on(level2_cv, edge="any")
    def level2_change(self, value, ctx):
        yield from self.process()

    @on(level3_cv, edge="any")
    def level3_change(self, value, ctx):
        yield from self.process()

    @on(level4_cv, edge="any")
    def level4_change(self, value, ctx):
        yield from self.process()


class VoiceAllocator(VirtualDevice):
    """Takes a flow of values and "split" it in multiple voices (allocate a voice)
    following multiple allocation algorithms.

    inputs:
    * input_cv [0, 127] round <any>: Input flow of values
    # * mode_cv [round-robin, unison, last note]: Choose voice allocation mode
    # * steal_mode_cv [oldest, quietest, r-robin cont., last note]: Mode for the way the voice is stolen

    outputs:
    * out0_cv [0, 127]: 1st voice
    * out1_cv [0, 127]: 2nd voice
    * out2_cv [0, 127]: 3rd voice
    * out3_cv [0, 127]: 4th voice

    type: ondemand
    category: Voices
    meta: disable default output
    """

    input_cv = VirtualParameter(
        name="input", range=(0.0, 127.0), conversion_policy="round"
    )
    # mode_cv = VirtualParameter(
    #     name="mode", accepted_values=["round-robin", "unison", "last note"]
    # )
    # steal_mode_cv = VirtualParameter(
    #     name="steal_mode",
    #     accepted_values=["oldest", "quietest", "r-robin cont.", "last note"],
    # )
    out3_cv = VirtualParameter(name="out3", range=(0.0, 127.0))
    out2_cv = VirtualParameter(name="out2", range=(0.0, 127.0))
    out1_cv = VirtualParameter(name="out1", range=(0.0, 127.0))
    out0_cv = VirtualParameter(name="out0", range=(0.0, 127.0))

    def __post_init__(self, **kwargs):
        self.allocated = [None] * 4
        self.voices = [self.out0_cv, self.out1_cv, self.out2_cv, self.out3_cv]
        self.idx = 0
        return {"disable_output": True}

    # @on(steal_mode_cv, edge="any")
    # def on_steal_mode_any(self, value, ctx): ...

    # @on(mode_cv, edge="any")
    # def on_mode_any(self, value, ctx): ...

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        raw_value = ctx.raw_value
        if raw_value in self.allocated:
            # if one of the voice already has the value (note off)
            idx = self.allocated.index(raw_value)
            self.allocated[idx] = None
            yield 0, [self.voices[idx]]
            self.idx = idx  # we consider this slot for next value
            return
        if self.idx == len(self.allocated):
            # if all the voices have been allocated
            self.idx = 0
        if self.allocated[self.idx] is not None:
            # if the voice is already allocated
            self.allocated[self.idx] = None
            yield 0, [self.voices[self.idx]]
        self.allocated[self.idx] = value
        yield value, [self.voices[self.idx]]
        self.idx += 1


INTERVAL_TO_SEMITONES = {
    "-octave": -OCTAVE,
    "-7/b7": -SEVENTH,
    "-6/m6": -SIXTH,
    "-5/b5": -FIFTH,
    "-4/b4": -FOURTH,
    "-3/m3": -THIRD,
    "-2/b2": -SECOND,
    "root": ROOT,
    "+2/b2": SECOND,
    "+3/m3": THIRD,
    "+4/b4": FOURTH,
    "+5/b5": FIFTH,
    "+6/m6": SIXTH,
    "+7/b7": SEVENTH,
    "+octave": OCTAVE,
}


class Harmonizer(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127), conversion_policy="round")
    interval0_cv = VirtualParameter(
        "interval0", accepted_values=list(INTERVAL_TO_SEMITONES.keys()), default="root"
    )
    interval1_cv = VirtualParameter(
        "interval1", accepted_values=list(INTERVAL_TO_SEMITONES.keys()), default="root"
    )
    interval2_cv = VirtualParameter(
        "interval2", accepted_values=list(INTERVAL_TO_SEMITONES.keys()), default="root"
    )
    interval3_cv = VirtualParameter(
        "interval3", accepted_values=list(INTERVAL_TO_SEMITONES.keys()), default="root"
    )
    key_cv = VirtualParameter(
        "key",
        accepted_values=NOTE_NAMES,
    )
    scale_cv = VirtualParameter("scale_", accepted_values=list(SCALES.keys()))

    out0_cv = VirtualParameter("out0", range=(0, 127))
    out1_cv = VirtualParameter("out1", range=(0, 127))
    out2_cv = VirtualParameter("out2", range=(0, 127))
    out3_cv = VirtualParameter("out3", range=(0, 127))

    def __post_init__(self, **kwargs):
        self.scales = SCALES
        self.intervals = [
            self.interval0_cv,
            self.interval1_cv,
            self.interval2_cv,
            self.interval3_cv,
        ]
        self.outputs = [
            self.out0_cv,
            self.out1_cv,
            self.out2_cv,
            self.out3_cv,
        ]
        return {"disable_output": True}

    def get_scale_for_key(self, key, scale_type):
        scale = self.scales[scale_type]
        key_idx = self.key_cv.parameter.accepted_values.index(key)
        return [(degree + key_idx) % 12 for degree in scale]

    def midi_to_scale_degree(self, note, scale):
        scale_length = len(scale)
        pitch_class = note % 12
        octave = note // 12
        if pitch_class in scale:
            scale_degree = scale.index(pitch_class)
            return octave * scale_length + scale_degree
        lower_degrees = [i for i, pc in enumerate(scale) if pc <= pitch_class]
        if not lower_degrees:
            return (octave - 1) * scale_length + len(scale) - 1
        return octave * scale_length + max(lower_degrees)

    def scale_degree_to_midi(self, degree, scale):
        octave = degree // len(scale)
        index = degree % len(scale)
        return octave * 12 + scale[index]

    @on(input_cv, edge="any")
    def change_input(self, value, ctx):
        yield from self.process()

    @on(scale_cv, edge="any")
    def change_scale(self, value, ctx):
        yield from self.process()

    @on(interval0_cv, edge="any")
    def change_interval0(self, value, ctx):
        yield from self.process()

    @on(interval1_cv, edge="any")
    def change_interval1(self, value, ctx):
        yield from self.process()

    @on(interval2_cv, edge="any")
    def change_interval2(self, value, ctx):
        yield from self.process()

    @on(interval3_cv, edge="any")
    def change_interval3(self, value, ctx):
        yield from self.process()

    @on(key_cv, edge="any")
    def change_key(self, value, ctx):
        yield from self.process()

    def process(self):
        for note, output in zip(self.harmonize_notes(), self.outputs):
            yield note, [output]

    def harmonize_notes(self):
        if not self.input:  # type: ignore
            return [0] * len(self.outputs)

        note = self.input  # type: ignore
        key = self.key  # type: ignore
        scale_type = self.scale_  # type: ignore

        notes = []
        for i in range(len(self.outputs)):
            interval = getattr(self, f"interval{i}")
            semitone_shift = INTERVAL_TO_SEMITONES[interval]
            target_note = note + semitone_shift
            scale = self.get_scale_for_key(key, scale_type)
            key_root = self.key_cv.parameter.accepted_values.index(key)
            all_scale_notes = [
                key_root + s + 12 * o for o in range(0, 11) for s in scale
            ]
            closest_note = min(all_scale_notes, key=lambda n: abs(n - target_note))
            notes.append(closest_note)

        return notes


class FineTuneNote(VirtualDevice):
    """
    FineTuneNote

    inputs:
    # * %inname [%range] %options: %doc
    * input_cv [0, 127] <any>: main input
    * slide_cv [0, 1] init=1 >0: if activated each pitch variation will not produce a new note on
    * finetune_cv [0, 8191] init=2048 round: fine tune how the conversion for fraction should be handled (depends on your synth/preset)

    outputs:
    # * %outname [%range]: %doc
    * note_out_cv [0, 127]: main note output (connect to the key of the synth)
    * pitchwheel_out_cv [-8192, 8191]: main fine-tuned note (connect to the pitchwheel of the synth)

    type: <ondemand | continuous>
    category: <category>
    meta: disable default output
    """

    finetune_cv = VirtualParameter(
        name="finetune", range=(0.0, 8191.0), conversion_policy="round", default=2048.0
    )
    slide_cv = VirtualParameter(
        name="slide", range=(0.0, 1.0), conversion_policy=">0", default=1.0
    )
    input_cv = VirtualParameter(name="input", range=(0.0, 127.0))
    pitchwheel_out_cv = VirtualParameter(name="pitchwheel_out", range=(-8192.0, 8191.0))
    note_out_cv = VirtualParameter(name="note_out", range=(0.0, 127.0))

    def __post_init__(self, **kwargs):
        return {"disable_output": True}

    @on(input_cv, edge="any")
    def on_input_any(self, value, ctx):
        closest_note, fine_tune = divmod(value, 1.0)
        pitchwheel = round(fine_tune * self.finetune)
        if not self.slide:
            yield (0, [self.note_out_cv])
        yield (closest_note, [self.note_out_cv])
        yield (pitchwheel, [self.pitchwheel_out_cv])
