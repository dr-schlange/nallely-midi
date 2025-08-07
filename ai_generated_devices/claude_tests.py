"""
Custom Virtual Devices for Nallely
"""

import random
from typing import Any

from nallely.core import ThreadContext, VirtualDevice, VirtualParameter, on


class ClaudeArpegiator(VirtualDevice):
    """
    An arpegiator that takes note inputs and plays them in sequence according to various patterns.
    Unlike a traditional arpegiator, this one maintains a note buffer and cycles through it.
    """

    note_cv = VirtualParameter("note", range=(0, 127))
    gate_cv = VirtualParameter("gate", range=(0, 1))
    tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM
    pattern_cv = VirtualParameter("pattern", accepted_values=[
        "up", "down", "up_down", "down_up", "random", "played_order"
    ])
    octave_range_cv = VirtualParameter("octave_range", range=(1, 4))
    hold_cv = VirtualParameter("hold", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))

    def __init__(self, **kwargs):
        self.note = 0
        self.gate = 0
        self.tempo = 360  # BPM
        self.pattern = "up"
        self.octave_range = 1
        self.hold = 0
        self.reset = 0

        # Internal state
        self._note_buffer = []  # Notes currently being held
        self._arp_notes = []    # Notes with octaves applied
        self._current_index = 0
        self._direction = 1     # For up_down/down_up patterns
        self._last_tick = 0
        self._is_playing = False

        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        return super().setup()

    def store_input(self, param: str, value):
        if param == "pattern" and isinstance(value, (int, float)):
            accepted_values = self.pattern_cv.parameter.accepted_values
            value = accepted_values[int(value) % len(accepted_values)]
        elif param == "hold":
            value = 1 if value != 0 else 0
        elif param == "gate":
            value = 1 if value != 0 else 0
        elif param == "reset":
            value = 1 if value != 0 else 0
        return super().store_input(param, value)

    @on(gate_cv, edge="rising")
    def on_gate_on(self, value, ctx):
        """Start arpeggiator when gate goes high"""
        if not self._is_playing:
            self._is_playing = True
            if self._note_buffer:
                self._generate_arp_sequence()
                self._current_index = 0

    @on(gate_cv, edge="falling")
    def on_gate_off(self, value, ctx):
        """Stop arpeggiator when gate goes low"""
        if not self.hold:
            self._is_playing = False
            self._note_buffer.clear()
            self._arp_notes.clear()

    @on(note_cv, edge="rising")
    def on_note_on(self, value, ctx):
        """Add note to buffer when note comes in"""
        if value > 0 and value not in self._note_buffer:
            self._note_buffer.append(value)
            if self._is_playing:
                self._generate_arp_sequence()
                self._current_index = 0  # Reset to start of new sequence

    @on(note_cv, edge="falling")
    def on_note_off(self, value, ctx):
        """Remove note from buffer when note goes off"""
        if not self.hold and value in self._note_buffer:
            self._note_buffer.remove(value)
            if self._is_playing:
                self._generate_arp_sequence()
                # Adjust index if needed
                if self._current_index >= len(self._arp_notes):
                    self._current_index = 0

        if not self._note_buffer and not self.hold:
            self._is_playing = False

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        """Reset arpeggiator state"""
        self._current_index = 0
        self._direction = 1

    @on(pattern_cv, edge="both")
    def on_pattern_change(self, value, ctx):
        """Regenerate sequence when pattern changes"""
        if self._is_playing:
            self._generate_arp_sequence()
            self._current_index = 0

    @on(octave_range_cv, edge="both")
    def on_octave_change(self, value, ctx):
        """Regenerate sequence when octave range changes"""
        if self._is_playing:
            self._generate_arp_sequence()
            self._current_index = 0

    def _generate_arp_sequence(self):
        """Generate the arpeggiated note sequence based on current pattern"""
        if not self._note_buffer:
            self._arp_notes = []
            return

        # Create base sequence with octaves
        base_notes = []
        for octave in range(int(self.octave_range)):
            for note in sorted(self._note_buffer):
                transposed = note + (octave * 12)
                if transposed <= 127:  # MIDI range limit
                    base_notes.append(transposed)

        # Apply pattern
        if self.pattern == "up":
            self._arp_notes = base_notes
        elif self.pattern == "down":
            self._arp_notes = list(reversed(base_notes))
        elif self.pattern == "up_down":
            self._arp_notes = base_notes + list(reversed(base_notes[:-1]))
        elif self.pattern == "down_up":
            self._arp_notes = list(reversed(base_notes)) + base_notes[1:]
        elif self.pattern == "random":
            self._arp_notes = base_notes.copy()
            random.shuffle(self._arp_notes)
        elif self.pattern == "played_order":
            # Maintain the order notes were added
            played_order = []
            for octave in range(int(self.octave_range)):
                for note in self._note_buffer:  # Use original order
                    transposed = note + (octave * 12)
                    if transposed <= 127:
                        played_order.append(transposed)
            self._arp_notes = played_order

    def _get_current_note(self):
        """Get the current note in the sequence"""
        if not self._arp_notes:
            return 0
        return self._arp_notes[self._current_index]

    def main(self, ctx: ThreadContext):
        """Main loop - advance through sequence based on tempo"""
        if not self._is_playing or not self._arp_notes:
            return

        # Calculate timing based on BPM
        ms_per_note = 60000 / self.tempo  # milliseconds per note

        # Yield current note
        current_note = self._get_current_note()
        yield current_note

        # Sleep for the calculated duration
        yield from self.sleep(ms_per_note)

        # Advance to next note
        self._advance_sequence()

    def _advance_sequence(self):
        """Move to the next note in the sequence"""
        if not self._arp_notes:
            return

        if self.pattern in ("up", "down", "random", "played_order"):
            self._current_index = (self._current_index + 1) % len(self._arp_notes)
        elif self.pattern in ("up_down", "down_up"):
            # Ping-pong through the sequence
            self._current_index += self._direction
            if self._current_index >= len(self._arp_notes):
                self._current_index = len(self._arp_notes) - 2
                self._direction = -1
            elif self._current_index < 0:
                self._current_index = 1
                self._direction = 1

    @property
    def range(self):
        return (0, 127)


class ClaudeDualRouter(VirtualDevice):
    """
    A routing device that takes two inputs and routes one of them to the output
    based on a selector. Similar to Switch but with explicit dual inputs.
    """

    input_a_cv = VirtualParameter("input_a", range=(0, 127))
    input_b_cv = VirtualParameter("input_b", range=(0, 127))
    selector_cv = VirtualParameter("selector", range=(0, 1))
    crossfade_cv = VirtualParameter("crossfade", range=(0.0, 1.0))
    mode_cv = VirtualParameter("mode", accepted_values=["switch", "crossfade", "mix"])

    def __init__(self, **kwargs):
        self.input_a = 0
        self.input_b = 0
        self.selector = 0  # 0 = A, 1 = B
        self.crossfade = 0.0  # 0.0 = full A, 1.0 = full B
        self.mode = "switch"

        # Internal state
        self._last_output = 0

        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        # Both inputs start closed for efficiency
        return super().setup()

    def store_input(self, param: str, value):
        if param == "mode" and isinstance(value, (int, float)):
            accepted_values = self.mode_cv.parameter.accepted_values
            value = accepted_values[int(value) % len(accepted_values)]
        elif param == "selector":
            value = 1 if value != 0 else 0
        return super().store_input(param, value)

    @on(selector_cv, edge="both")
    def on_selector_change(self, value, ctx):
        """Handle selector changes and manage port opening/closing"""
        if self.mode == "switch":
            if value == 0:
                # Switch to input A
                return self.input_a
            else:
                # Switch to input B
                return self.input_b
        elif self.mode in ("crossfade", "mix"):
            # Both inputs need to be open for crossfading/mixing
            return self._calculate_output()

    @on(mode_cv, edge="both")
    def on_mode_change(self, value, ctx):
        """Handle mode changes and adjust port management"""
        if value == "switch":
            # Switch mode - only one input open
            if self.selector == 0:
                return self.input_a
            else:
                return self.input_b
        else:
            # Crossfade or mix mode - both inputs open
            return self._calculate_output()

    @on(input_a_cv, edge="both")
    def on_input_a(self, value, ctx):
        """Handle input A changes"""
        if self.mode == "switch":
            if self.selector == 0:
                return value
        else:
            # Crossfade or mix mode
            return self._calculate_output()

    @on(input_b_cv, edge="both")
    def on_input_b(self, value, ctx):
        """Handle input B changes"""
        if self.mode == "switch":
            if self.selector == 1:
                return value
        else:
            # Crossfade or mix mode
            return self._calculate_output()

    @on(crossfade_cv, edge="both")
    def on_crossfade_change(self, value, ctx):
        """Handle crossfade parameter changes"""
        if self.mode in ("crossfade", "mix"):
            return self._calculate_output()

    def _calculate_output(self):
        """Calculate output based on current mode and parameters"""
        if self.mode == "switch":
            return self.input_a if self.selector == 0 else self.input_b
        elif self.mode == "crossfade":
            # Linear crossfade between inputs
            a_gain = 1.0 - self.crossfade
            b_gain = self.crossfade
            return (self.input_a * a_gain) + (self.input_b * b_gain)
        elif self.mode == "mix":
            # Mix both inputs, crossfade controls the balance
            # At crossfade=0.5, both inputs are at full volume
            a_gain = 1.0 - (self.crossfade * 0.5)
            b_gain = 0.5 + (self.crossfade * 0.5)
            return (self.input_a * a_gain) + (self.input_b * b_gain)

        return 0

    @property
    def range(self):
        return (0, 127)


class ClaudeStepSequencer8(VirtualDevice):
    """
    An 8-step sequencer with individual control over each step's note, velocity, gate, and active state.
    Includes transport controls (play/pause, reset) and tempo control.
    """

    # Transport controls
    play_cv = VirtualParameter("play", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM

    # Pattern controls
    step_length_cv = VirtualParameter("step_length", range=(1, 8))
    swing_cv = VirtualParameter("swing", range=(0.0, 1.0))  # 0 = no swing, 1 = max swing

    # Step 1 controls
    step1_note_cv = VirtualParameter("step1_note", range=(0, 127))
    step1_velocity_cv = VirtualParameter("step1_velocity", range=(0, 127))
    step1_gate_cv = VirtualParameter("step1_gate", range=(0.0, 1.0))  # Gate length as fraction
    step1_active_cv = VirtualParameter("step1_active", range=(0, 1))

    # Step 2 controls
    step2_note_cv = VirtualParameter("step2_note", range=(0, 127))
    step2_velocity_cv = VirtualParameter("step2_velocity", range=(0, 127))
    step2_gate_cv = VirtualParameter("step2_gate", range=(0.0, 1.0))
    step2_active_cv = VirtualParameter("step2_active", range=(0, 1))

    # Step 3 controls
    step3_note_cv = VirtualParameter("step3_note", range=(0, 127))
    step3_velocity_cv = VirtualParameter("step3_velocity", range=(0, 127))
    step3_gate_cv = VirtualParameter("step3_gate", range=(0.0, 1.0))
    step3_active_cv = VirtualParameter("step3_active", range=(0, 1))

    # Step 4 controls
    step4_note_cv = VirtualParameter("step4_note", range=(0, 127))
    step4_velocity_cv = VirtualParameter("step4_velocity", range=(0, 127))
    step4_gate_cv = VirtualParameter("step4_gate", range=(0.0, 1.0))
    step4_active_cv = VirtualParameter("step4_active", range=(0, 1))

    # Step 5 controls
    step5_note_cv = VirtualParameter("step5_note", range=(0, 127))
    step5_velocity_cv = VirtualParameter("step5_velocity", range=(0, 127))
    step5_gate_cv = VirtualParameter("step5_gate", range=(0.0, 1.0))
    step5_active_cv = VirtualParameter("step5_active", range=(0, 1))

    # Step 6 controls
    step6_note_cv = VirtualParameter("step6_note", range=(0, 127))
    step6_velocity_cv = VirtualParameter("step6_velocity", range=(0, 127))
    step6_gate_cv = VirtualParameter("step6_gate", range=(0.0, 1.0))
    step6_active_cv = VirtualParameter("step6_active", range=(0, 1))

    # Step 7 controls
    step7_note_cv = VirtualParameter("step7_note", range=(0, 127))
    step7_velocity_cv = VirtualParameter("step7_velocity", range=(0, 127))
    step7_gate_cv = VirtualParameter("step7_gate", range=(0.0, 1.0))
    step7_active_cv = VirtualParameter("step7_active", range=(0, 1))

    # Step 8 controls
    step8_note_cv = VirtualParameter("step8_note", range=(0, 127))
    step8_velocity_cv = VirtualParameter("step8_velocity", range=(0, 127))
    step8_gate_cv = VirtualParameter("step8_gate", range=(0.0, 1.0))
    step8_active_cv = VirtualParameter("step8_active", range=(0, 1))

    def __init__(self, **kwargs):
        # Transport state
        self.play = 0
        self.reset = 0
        self.tempo = 120  # BPM

        # Pattern state
        self.step_length = 8
        self.swing = 0.0

        # Initialize all steps with default values
        self.step1_note = 60  # Middle C
        self.step1_velocity = 100
        self.step1_gate = 0.8
        self.step1_active = 1

        self.step2_note = 62
        self.step2_velocity = 100
        self.step2_gate = 0.8
        self.step2_active = 1

        self.step3_note = 64
        self.step3_velocity = 100
        self.step3_gate = 0.8
        self.step3_active = 1

        self.step4_note = 65
        self.step4_velocity = 100
        self.step4_gate = 0.8
        self.step4_active = 1

        self.step5_note = 67
        self.step5_velocity = 100
        self.step5_gate = 0.8
        self.step5_active = 1

        self.step6_note = 69
        self.step6_velocity = 100
        self.step6_gate = 0.8
        self.step6_active = 1

        self.step7_note = 71
        self.step7_velocity = 100
        self.step7_gate = 0.8
        self.step7_active = 1

        self.step8_note = 72
        self.step8_velocity = 100
        self.step8_gate = 0.8
        self.step8_active = 1

        # Internal sequencer state
        self._current_step = 0
        self._is_playing = False
        self._step_start_time = 0
        self._in_gate_phase = False

        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        return super().setup()

    def store_input(self, param: str, value):
        # Convert binary parameters
        if param in ("play", "reset") or param.endswith("_active"):
            value = 1 if value != 0 else 0
        # Clamp step_length to valid range
        elif param == "step_length":
            value = max(1, min(8, int(value)))
        return super().store_input(param, value)

    @on(play_cv, edge="rising")
    def on_play_start(self, value, ctx):
        """Start the sequencer"""
        if not self._is_playing:
            self._is_playing = True
            self._step_start_time = 0
            self._in_gate_phase = False

    @on(play_cv, edge="falling")
    def on_play_stop(self, value, ctx):
        """Stop the sequencer"""
        self._is_playing = False
        self._in_gate_phase = False

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        """Reset sequencer to step 1"""
        self._current_step = 0
        self._step_start_time = 0
        self._in_gate_phase = False

    def _get_step_data(self, step_index):
        """Get note, velocity, gate length, and active state for a given step (0-7)"""
        step_num = step_index + 1
        note = getattr(self, f"step{step_num}_note", 60)
        velocity = getattr(self, f"step{step_num}_velocity", 100)
        gate = getattr(self, f"step{step_num}_gate", 0.8)
        active = getattr(self, f"step{step_num}_active", 1)
        return note, velocity, gate, active

    def _calculate_step_timing(self, step_index):
        """Calculate timing for a step, including swing"""
        base_duration = 60000 / self.tempo  # milliseconds per step at current BPM

        # Apply swing to even steps (1, 3, 5, 7 in 0-indexed)
        if step_index % 2 == 1 and self.swing > 0:
            # Swing delays even steps
            swing_delay = base_duration * 0.3 * self.swing
            return base_duration + swing_delay
        elif step_index % 2 == 0 and self.swing > 0:
            # Odd steps are shortened to compensate
            swing_reduction = base_duration * 0.3 * self.swing
            return base_duration - swing_reduction

        return base_duration

    def main(self, ctx: ThreadContext):
        """Main sequencer loop"""
        if not self._is_playing:
            yield 0  # Output silence when not playing
            return

        # Get current step data
        note, velocity, gate_length, active = self._get_step_data(self._current_step)

        # Calculate step duration with swing
        step_duration = self._calculate_step_timing(self._current_step)
        gate_duration = step_duration * gate_length

        if not self._in_gate_phase:
            # Start of step - begin gate phase if step is active
            self._in_gate_phase = True
            self._step_start_time = 0

            if active and note > 0:
                # Output note with velocity information (could be used for MIDI velocity)
                # For now, just output the note
                yield note
            else:
                # Step is inactive or note is 0, output silence
                yield 0
        else:
            # Continue current step
            if active and note > 0 and self._step_start_time < gate_duration:
                # Still in gate phase
                yield note
            else:
                # Gate phase ended or step inactive
                yield 0

        # Sleep for a small time slice (e.g., 10ms for smooth operation)
        time_slice = 10
        yield from self.sleep(time_slice)
        self._step_start_time += time_slice

        # Check if step is complete
        if self._step_start_time >= step_duration:
            # Move to next step
            self._current_step = (self._current_step + 1) % int(self.step_length)
            self._in_gate_phase = False
            self._step_start_time = 0

    @property
    def range(self):
        return (0, 127)
