import time
from decimal import Decimal

from .core import VirtualDevice, VirtualParameter, on


class Clock(VirtualDevice):
    smallest_subdivision = Decimal(32)
    tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM
    play_cv = VirtualParameter("play", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))

    # clock outputs we consider the main output_cv as not used
    mul7_cv = VirtualParameter("mul7", range=(0, 1))  # x7
    mul3_cv = VirtualParameter("mul3", range=(0, 1))  # x3
    div5_cv = VirtualParameter("div5", range=(0, 1))  # /5
    div3_cv = VirtualParameter("div3", range=(0, 1))  # /3
    mul4_cv = VirtualParameter("mul4", range=(0, 1))  # x4
    mul2_cv = VirtualParameter("mul2", range=(0, 1))  # x2
    div2_cv = VirtualParameter("div2", range=(0, 1))  # /2
    div4_cv = VirtualParameter("div4", range=(0, 1))  # /4
    lead_cv = VirtualParameter("lead", range=(0, 1))  # /1 (quater note)

    def __init__(self, tick_min_ms=5, **kwargs):
        self.tempo = Decimal(120)
        self._play = 0
        self.reset = 0
        self.tick_min_ms = Decimal(tick_min_ms)
        self.next_tick_time = time.perf_counter()

        self.phases = {
            "lead": Decimal(0),
            "div2": Decimal(0),
            "div4": Decimal(0),
            "mul2": Decimal(0),
            "mul4": Decimal(0),
            "div3": Decimal(0),
            "div5": Decimal(0),
            "mul3": Decimal(0),
            "mul7": Decimal(0),
        }

        self.ratios = {
            "lead": Decimal(1),
            "div2": Decimal("0.5"),
            "div4": Decimal("0.25"),
            "mul2": Decimal(2),
            "mul4": Decimal(4),
            "div3": Decimal(1) / Decimal(3),
            "div5": Decimal("0.2"),
            "mul3": Decimal(3),
            "mul7": Decimal(7),
        }
        super().__init__(
            target_cycle_time=self._compute_target_cycle(self.tempo),
            disable_output=True,
            **kwargs,
        )

    @property
    def play(self):
        return self._play

    @play.setter
    def play(self, value):
        self._play = 1 if value > 0 else 0

    @property
    def tempo(self):
        return Decimal(self._tempo)

    def _compute_target_cycle(self, tempo):
        quater_note_ms = Decimal(60000) / Decimal(tempo)
        tick_ms = quater_note_ms / self.smallest_subdivision / Decimal(1000)

        return max(0.001, float(tick_ms))

    @tempo.setter
    def tempo(self, value):
        self._tempo = value
        self.target_cycle_time = self._compute_target_cycle(value)

    @on(reset_cv, edge="rising")
    def reset_all(self, value, ctx):
        for k in self.phases:
            self.phases[k] = Decimal(0)

    def main(self, ctx):
        quarter_note_s = 60 / float(self.tempo)
        tick_s = max(
            float(self.tick_min_ms) / 1000,
            quarter_note_s / float(self.smallest_subdivision),
        )

        if self.play:
            to_pulse = []
            for name in self.phases:
                self.phases[name] += Decimal(self.ratios[name]) * Decimal(
                    tick_s / quarter_note_s
                )
                while self.phases[name] >= 1:
                    self.phases[name] -= 1
                    to_pulse.append(name)

            if to_pulse:
                pulse_width_ms = min(5, max(1, float(quarter_note_s * 1000 / 128)))
                outputs = [getattr(self, f"{name}_cv") for name in to_pulse]
                yield 1, outputs
                yield from self.sleep(pulse_width_ms, consider_target_time=False)
                yield 0, outputs

        # Plan next tick
        self.next_tick_time += tick_s
        delay = self.next_tick_time - time.perf_counter()

        if delay > 0:
            yield from self.sleep(delay * 1000, consider_target_time=False)
        else:
            # We are late, we hurry to compensate
            self.next_tick_time = time.perf_counter()
