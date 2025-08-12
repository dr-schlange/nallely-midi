from nallely.core.world import ThreadContext

from .core import VirtualDevice, VirtualParameter, on


class ADSREnvelope(VirtualDevice):
    gate_cv = VirtualParameter(name="gate", range=(0, 1))
    attack_cv = VirtualParameter(name="attack", range=(0.0, 1.0))
    decay_cv = VirtualParameter(name="decay", range=(0.0, 1.0))
    sustain_cv = VirtualParameter(name="sustain", range=(0.0, 1.0))
    release_cv = VirtualParameter(name="release", range=(0.0, 1.0))

    def __init__(self, attack=0.1, decay=0.2, sustain=0.7, release=0.3, **kwargs):
        self.attack = attack
        self.decay = decay
        self.sustain = sustain
        self.release = release
        self.gate = 0  # False
        super().__init__(**kwargs)

    def store_input(self, param, value):
        if param == "gate":
            return super().store_input(param, 1 if value != 0 else 0)
        super().store_input(param, value)

    def setup(self):
        ctx = super().setup()
        self._phase = "idle"  # 'attack', 'decay', 'sustain', 'release', 'idle'
        self._time_in_phase = 0.0
        self._level = 0.0
        self._release_start_level = 0.0
        return ctx

    def debug_print(self, ctx):
        super().debug_print(ctx)
        print(f" * {self._phase=}")
        print(f" * {self._time_in_phase=}")
        print(f" * {self._level=}")

    @on(gate_cv, edge="rising")
    def on_gate_1(self, _, ctx):
        if self._phase in ["idle", "release"]:
            self._phase = "attack"
            self._time_in_phase = 0.0

    @on(gate_cv, edge="falling")
    def on_gate_0(self, _, ctx):
        if self._phase not in ["release", "idle"]:
            self._phase = "release"
            self._time_in_phase = 0.0
            self._release_start_level = self._level

    def main(self, ctx):

        dt = self.target_cycle_time
        self._time_in_phase += dt

        if self._phase == "attack":
            if self.attack == 0:
                self._level = 1.0
                self._phase = "decay"
                self._time_in_phase = 0.0
            else:
                self._level = min(1.0, self._time_in_phase / self.attack)
                if self._level >= 1.0:
                    self._phase = "decay"
                    self._time_in_phase = 0.0

        elif self._phase == "decay":
            if self.decay == 0:
                self._level = self.sustain
                self._phase = "sustain"
            else:
                decay_progress = self._time_in_phase / self.decay
                self._level = 1.0 - (1.0 - self.sustain) * min(1.0, decay_progress)
                if decay_progress >= 1.0:
                    self._phase = "sustain"

        elif self._phase == "sustain":
            self._level = self.sustain

        elif self._phase == "release":
            if self.release == 0:
                self._level = 0.0
                self._phase = "idle"
            else:
                release_progress = min(1.0, self._time_in_phase / self.release)
                self._level = self._release_start_level * (1.0 - release_progress)
                if release_progress >= 1.0:
                    self._level = 0.0
                    self._phase = "idle"

        elif self._phase == "idle":
            self._level = 0.0

        return self._level

    @property
    def range(self):
        return (0.0, 1.0)


class VCA(VirtualDevice):
    input_cv = VirtualParameter("input", range=(0, 127))
    amplitude_cv = VirtualParameter("amplitude", range=(0.0, 1.0))
    gain_cv = VirtualParameter("gain", range=(1.0, 2.0))

    @property
    def range(self):
        return (0.0, 127.0)

    def __init__(self, **kwargs):
        self.input = 0.0
        self.amplitude = 0.0
        self.gain = 1.0
        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        self._close_port("input")
        return super().setup()

    @on(input_cv, edge="both")
    def sending_modulated_input(self, value, ctx):
        return value * self.amplitude * self.gain

    @on(amplitude_cv, edge="rising")
    def opening(self, value, ctx):
        self._open_port("input")

    @on(amplitude_cv, edge="falling")
    def closing(self, value, ctx):
        self._close_port("input")
        return 0


class Gate(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    gate_cv = VirtualParameter(name="gate", range=(0, 1))

    def __init__(self, **kwargs):
        self.input = 0
        self.gate = 0
        super().__init__(**kwargs)

    def setup(self) -> ThreadContext:
        self._close_port("input")
        return super().setup()

    @on(input_cv, edge="both")
    def on_input(self, value, ctx):
        if self.gate > 0:
            return value

    @on(gate_cv, edge="rising")
    def opening(self, value, ctx):
        self._open_port("input")
        return self.input

    @on(gate_cv, edge="falling")
    def closing(self, value, ctx):
        self._close_port("input")
        return 0


class SampleHold(VirtualDevice):
    input_cv = VirtualParameter(name="input", range=(0, 127))
    trigger_cv = VirtualParameter(name="trigger", range=(0, 1))
    reset_cv = VirtualParameter(name="reset", range=(0, 1))

    def __init__(self, **kwargs):
        self.input = 0
        self.trigger = 0
        self.reset = 0
        self.hold = None
        super().__init__(target_cycle_time=0.005, **kwargs)

    @on(trigger_cv, edge="rising")
    def hold_value(self, value, ctx):
        if self.hold is not None:
            yield 0
        self.hold = self.input
        return self.hold

    @on(reset_cv, edge="rising")
    def reset_input(self, value, ctx):
        self.hold = None
        return 0


class Switch(VirtualDevice):
    output2_cv = VirtualParameter(name="output2", range=(0, 127))
    input_cv = VirtualParameter(name="input", range=(0, 127))
    selector_cv = VirtualParameter(name="selector", range=(0, 1))
    type_cv = VirtualParameter(name="type", accepted_values=("toggle", "absolute"))
    hold_last_cv = VirtualParameter(name="hold_last")

    def __init__(self, **kwargs):
        self.input = 0
        self.output2 = 0
        self.selector = 0
        self.out_num = 0
        self.type = "toggle"
        self.hold_last = True
        self.outputs = [self.output_cv, self.output2_cv]
        super().__init__(target_cycle_time=1 / 100, **kwargs)

    def store_input(self, param: str, value):
        if param == "type" and isinstance(value, (int, float)):
            value = self.type_cv.parameter.accepted_values[
                int(value) % len(self.outputs)
            ]
        elif param == "hold_last":
            value = bool(value)
        return super().store_input(param, value)

    @on(input_cv, edge="any")
    def on_input(self, value, ctx):
        return value, [self.outputs[self.out_num]]

    @on(selector_cv, edge="rising")
    def rising_selector(self, value, ctx):
        old_out = self.out_num
        if self.type == "toggle":
            self.out_num = int(self.out_num + 1) % len(self.outputs)
        else:
            self.out_num = int(value)
        if not self.hold_last:
            yield 0, [self.outputs[old_out]]
        return self.input, [self.outputs[self.out_num]]

    @on(selector_cv, edge="falling")
    def falling_selector(self, value, ctx):
        if self.type == "absolute":
            old_out = self.out_num
            self.out_num = int(value)
            if not self.hold_last:
                yield 0, [self.outputs[old_out]]
            return self.input, [self.outputs[self.out_num]]
