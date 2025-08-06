"""
AI-generated Virtual Devices: Simple Arpeggiator and DualInputSwitch
"""

import random
from nallely.core import ThreadContext, VirtualDevice, VirtualParameter, on

class SimpleArpeggiator(VirtualDevice):
    """
    A basic arpeggiator that cycles through held notes in a fixed pattern (up).
    No port management, just note buffer and main loop.
    """
    note_cv = VirtualParameter("note", range=(0, 127))
    gate_cv = VirtualParameter("gate", range=(0, 1))
    tempo_cv = VirtualParameter("tempo", range=(30, 400))
    hold_cv = VirtualParameter("hold", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))

    def __init__(self, **kwargs):
        self.note = 0
        self.gate = 0
        self.tempo = 120
        self.hold = 0
        self.reset = 0
        self._note_buffer = []
        self._current_index = 0
        self._is_playing = False
        super().__init__(**kwargs)

    @on(gate_cv, edge="rising")
    def on_gate_on(self, value, ctx):
        self._is_playing = True
        self._current_index = 0

    @on(gate_cv, edge="falling")
    def on_gate_off(self, value, ctx):
        if not self.hold:
            self._is_playing = False
            self._note_buffer.clear()

    @on(note_cv, edge="rising")
    def on_note_on(self, value, ctx):
        if value > 0 and value not in self._note_buffer:
            self._note_buffer.append(value)
            self._note_buffer.sort()
            self._current_index = 0

    @on(note_cv, edge="falling")
    def on_note_off(self, value, ctx):
        if value in self._note_buffer:
            self._note_buffer.remove(value)
            if self._current_index >= len(self._note_buffer):
                self._current_index = 0
        if not self._note_buffer and not self.hold:
            self._is_playing = False

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        self._current_index = 0

    def main(self, ctx: ThreadContext):
        if not self._is_playing or not self._note_buffer:
            yield 0
            return
        ms_per_note = 60000 / self.tempo
        note = self._note_buffer[self._current_index]
        yield note
        yield from self.sleep(ms_per_note)
        self._current_index = (self._current_index + 1) % len(self._note_buffer)

    @property
    def range(self):
        return (0, 127)


class DualInputSwitch(VirtualDevice):
    """
    A device that takes two inputs and routes one to the output based on a selector, similar to a Switch.
    """
    input_a_cv = VirtualParameter("input_a", range=(0, 127))
    input_b_cv = VirtualParameter("input_b", range=(0, 127))
    selector_cv = VirtualParameter("selector", range=(0, 1))  # 0 = A, 1 = B

    def __init__(self, **kwargs):
        self.input_a = 0
        self.input_b = 0
        self.selector = 0
        super().__init__(**kwargs)

    @on(selector_cv, edge="both")
    def on_selector_change(self, value, ctx):
        pass  # Output is handled in main

    @on(input_a_cv, edge="both")
    def on_input_a(self, value, ctx):
        pass

    @on(input_b_cv, edge="both")
    def on_input_b(self, value, ctx):
        pass

    def main(self, ctx: ThreadContext):
        if self.selector == 0:
            yield self.input_a
        else:
            yield self.input_b

    @property
    def range(self):
        return (0, 127)


class StepSequencer8(VirtualDevice):
    """
    An 8-step sequencer with per-step note, velocity, gate, and active controls.
    Includes play, reset, tempo, step length, and swing parameters.
    """
    play_cv = VirtualParameter("play", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))
    tempo_cv = VirtualParameter("tempo", range=(20, 600))
    step_length_cv = VirtualParameter("step_length", range=(1, 8))
    swing_cv = VirtualParameter("swing", range=(0.0, 1.0))

    # Step controls
    step1_note_cv = VirtualParameter("step1_note", range=(0, 127))
    step1_velocity_cv = VirtualParameter("step1_velocity", range=(0, 127))
    step1_gate_cv = VirtualParameter("step1_gate", range=(0.0, 1.0))
    step1_active_cv = VirtualParameter("step1_active", range=(0, 1))
    step2_note_cv = VirtualParameter("step2_note", range=(0, 127))
    step2_velocity_cv = VirtualParameter("step2_velocity", range=(0, 127))
    step2_gate_cv = VirtualParameter("step2_gate", range=(0.0, 1.0))
    step2_active_cv = VirtualParameter("step2_active", range=(0, 1))
    step3_note_cv = VirtualParameter("step3_note", range=(0, 127))
    step3_velocity_cv = VirtualParameter("step3_velocity", range=(0, 127))
    step3_gate_cv = VirtualParameter("step3_gate", range=(0.0, 1.0))
    step3_active_cv = VirtualParameter("step3_active", range=(0, 1))
    step4_note_cv = VirtualParameter("step4_note", range=(0, 127))
    step4_velocity_cv = VirtualParameter("step4_velocity", range=(0, 127))
    step4_gate_cv = VirtualParameter("step4_gate", range=(0.0, 1.0))
    step4_active_cv = VirtualParameter("step4_active", range=(0, 1))
    step5_note_cv = VirtualParameter("step5_note", range=(0, 127))
    step5_velocity_cv = VirtualParameter("step5_velocity", range=(0, 127))
    step5_gate_cv = VirtualParameter("step5_gate", range=(0.0, 1.0))
    step5_active_cv = VirtualParameter("step5_active", range=(0, 1))
    step6_note_cv = VirtualParameter("step6_note", range=(0, 127))
    step6_velocity_cv = VirtualParameter("step6_velocity", range=(0, 127))
    step6_gate_cv = VirtualParameter("step6_gate", range=(0.0, 1.0))
    step6_active_cv = VirtualParameter("step6_active", range=(0, 1))
    step7_note_cv = VirtualParameter("step7_note", range=(0, 127))
    step7_velocity_cv = VirtualParameter("step7_velocity", range=(0, 127))
    step7_gate_cv = VirtualParameter("step7_gate", range=(0.0, 1.0))
    step7_active_cv = VirtualParameter("step7_active", range=(0, 1))
    step8_note_cv = VirtualParameter("step8_note", range=(0, 127))
    step8_velocity_cv = VirtualParameter("step8_velocity", range=(0, 127))
    step8_gate_cv = VirtualParameter("step8_gate", range=(0.0, 1.0))
    step8_active_cv = VirtualParameter("step8_active", range=(0, 1))

    def __init__(self, **kwargs):
        self.play = 0
        self.reset = 0
        self.tempo = 120
        self.step_length = 8
        self.swing = 0.0
        # Default step values
        for i, (note, vel) in enumerate(zip([60,62,64,65,67,69,71,72],[100]*8), 1):
            setattr(self, f"step{i}_note", note)
            setattr(self, f"step{i}_velocity", vel)
            setattr(self, f"step{i}_gate", 0.8)
            setattr(self, f"step{i}_active", 1)
        self._current_step = 0
        self._is_playing = False
        self._step_start_time = 0
        self._in_gate_phase = False
        super().__init__(**kwargs)

    def store_input(self, param: str, value):
        if param in ("play", "reset") or param.endswith("_active"):
            value = 1 if value != 0 else 0
        elif param == "step_length":
            value = max(1, min(8, int(value)))
        return super().store_input(param, value)

    @on(play_cv, edge="rising")
    def on_play_start(self, value, ctx):
        self._is_playing = True
        self._step_start_time = 0
        self._in_gate_phase = False

    @on(play_cv, edge="falling")
    def on_play_stop(self, value, ctx):
        self._is_playing = False
        self._in_gate_phase = False

    @on(reset_cv, edge="rising")
    def on_reset(self, value, ctx):
        self._current_step = 0
        self._step_start_time = 0
        self._in_gate_phase = False

    def _get_step_data(self, step_index):
        step_num = step_index + 1
        note = getattr(self, f"step{step_num}_note", 60)
        velocity = getattr(self, f"step{step_num}_velocity", 100)
        gate = getattr(self, f"step{step_num}_gate", 0.8)
        active = getattr(self, f"step{step_num}_active", 1)
        return note, velocity, gate, active

    def _calculate_step_timing(self, step_index):
        base_duration = 60000 / self.tempo
        if step_index % 2 == 1 and self.swing > 0:
            swing_delay = base_duration * 0.3 * self.swing
            return base_duration + swing_delay
        elif step_index % 2 == 0 and self.swing > 0:
            swing_reduction = base_duration * 0.3 * self.swing
            return base_duration - swing_reduction
        return base_duration

    def main(self, ctx: ThreadContext):
        if not self._is_playing:
            yield 0
            return
        note, velocity, gate_length, active = self._get_step_data(self._current_step)
        step_duration = self._calculate_step_timing(self._current_step)
        gate_duration = step_duration * gate_length
        if not self._in_gate_phase:
            self._in_gate_phase = True
            self._step_start_time = 0
            if active and note > 0:
                yield note
            else:
                yield 0
        else:
            if active and note > 0 and self._step_start_time < gate_duration:
                yield note
            else:
                yield 0
        time_slice = 10
        yield from self.sleep(time_slice)
        self._step_start_time += time_slice
        if self._step_start_time >= step_duration:
            self._current_step = (self._current_step + 1) % int(self.step_length)
            self._in_gate_phase = False
            self._step_start_time = 0

    @property
    def range(self):
        return (0, 127)
