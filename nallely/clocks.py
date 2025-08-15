from decimal import Decimal, DecimalTuple

from .core import ThreadContext, VirtualDevice, VirtualParameter, on

# class FlexibleClock(VirtualDevice):
#     tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM
#     play_cv = VirtualParameter("play", range=(0, 1))
#     reset_cv = VirtualParameter("reset", range=(0, 1))

#     # clock outputs
#     lead_cv = VirtualParameter("lead", range=(0, 1))  # /1 (quater note)
#     div3_cv = VirtualParameter("div3", range=(0, 1))  # /3
#     div5_cv = VirtualParameter("div5", range=(0, 1))  # /5
#     mul3_cv = VirtualParameter("mul3", range=(0, 1))  # x3
#     mul7_cv = VirtualParameter("mul7", range=(0, 1))  # x7

#     def __init__(self, **kwargs):
#         self.tempo = 120
#         self._play = 0
#         self.reset = 0

#         self.phases = {
#             "lead": 0.0,
#             "div2": 0.0,
#             "div4": 0.0,
#             "mul2": 0.0,
#             "mul4": 0.0,
#             "div3": 0.0,
#             "div5": 0.0,
#             "mul3": 0.0,
#             "mul7": 0.0,
#         }

#         self.ratios = {
#             "lead": 1.0,  # 1 pulse / quater note
#             "div2": 0.5,
#             "div4": 0.25,
#             "mul2": 2.0,
#             "mul4": 4.0,
#             "div3": 1.0 / 3.0,  # 1 every 3 quater note
#             "div5": 1.0 / 5.0,  # 1 every 5 quater note
#             "mul3": 3.0,  # 3 pulses / quater note
#             "mul7": 7.0,  # 7 pulses / quater note
#         }

#         # We disable the target_cycle_time, we will handle it ourselves
#         super().__init__(target_cycle_time=0.002, **kwargs)

#     @property
#     def play(self):
#         return self._play

#     @play.setter
#     def play(self, value):
#         self._play = 1 if value > 0 else 0

#     @on(reset_cv, edge="rising")
#     def reset_all(self, value, ctx):
#         for k in self.phases:
#             self.phases[k] = 0.0

#     def main(self, ctx: ThreadContext):
#         # minimal tick we choose 1/64
#         quater_note_ms = 60000 / self.tempo
#         tick_ms = quater_note_ms / 16  # 16 ticks by quater notes

#         if self.play:
#             to_pulse = []

#             for name in self.phases:
#                 self.phases[name] += self.ratios[name] / 16.0  # 16 ticks by quater note
#                 if self.phases[name] >= 1.0:
#                     self.phases[name] -= 1.0
#                     to_pulse.append(name)

#             if to_pulse:
#                 outputs = [getattr(self, f"{name}_cv") for name in to_pulse]
#                 yield 1, outputs
#                 yield 0, outputs

#         yield from self.sleep(tick_ms)


# class HybridClock(VirtualDevice):
#     tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM
#     play_cv = VirtualParameter("play", range=(0, 1))
#     reset_cv = VirtualParameter("reset", range=(0, 1))

#     # clock outputs we consider the main output_cv as not used
#     lead_cv = VirtualParameter("lead", range=(0, 1))  # /1 (quater note)
#     div2_cv = VirtualParameter("div2", range=(0, 1))  # /2
#     div4_cv = VirtualParameter("div4", range=(0, 1))  # /4
#     mul2_cv = VirtualParameter("mul2", range=(0, 1))  # x2
#     mul4_cv = VirtualParameter("mul4", range=(0, 1))  # x4
#     div3_cv = VirtualParameter("div3", range=(0, 1))  # /3
#     div5_cv = VirtualParameter("div5", range=(0, 1))  # /5
#     mul3_cv = VirtualParameter("mul3", range=(0, 1))  # x3
#     mul7_cv = VirtualParameter("mul7", range=(0, 1))  # x7

#     def __init__(self, tick_min_ms=5, **kwargs):
#         self.tempo = 120
#         self._play = 0
#         self.reset = 0
#         self.tick_min_ms = tick_min_ms

#         self.phases = {
#             "lead": 0.0,
#             "div2": 0.0,
#             "div4": 0.0,
#             "mul2": 0.0,
#             "mul4": 0.0,
#             "div3": 0.0,
#             "div5": 0.0,
#             "mul3": 0.0,
#             "mul7": 0.0,
#         }

#         self.ratios = {
#             "lead": 1.0,
#             "div2": 0.5,
#             "div4": 0.25,
#             "mul2": 2.0,
#             "mul4": 4.0,
#             "div3": 1.0 / 3.0,
#             "div5": 1.0 / 5.0,
#             "mul3": 3.0,
#             "mul7": 7.0,
#         }

#         # We disable the target_cycle_time, we will handle it ourselves
#         super().__init__(target_cycle_time=0.002, **kwargs)

#     @property
#     def play(self):
#         return self._play

#     @play.setter
#     def play(self, value):
#         self._play = 1 if value > 0 else 0

#     @on(reset_cv, edge="rising")
#     def reset_all(self, value, ctx):
#         for k in self.phases:
#             self.phases[k] = 0.0

#     def main(self, ctx: ThreadContext):
#         quater_note_ms = 60000 / self.tempo
#         # number of minimum ticks to get the pulse
#         tick_ms = min(self.tick_min_ms, quater_note_ms / 64)

#         if self.play:
#             to_pulse = []

#             for name in self.phases:
#                 self.phases[name] += self.ratios[name] * (tick_ms / quater_note_ms)
#                 if self.phases[name] >= 1.0:
#                     self.phases[name] -= 1.0
#                     to_pulse.append(name)

#             if to_pulse:
#                 # short pulse (1 tick)
#                 outputs = [getattr(self, f"{name}_cv") for name in to_pulse]
#                 yield 1, outputs
#                 yield 0, outputs

#         yield from self.sleep(tick_ms)


class FlexibleClock(VirtualDevice):
    smallest_subdivision = Decimal(32)
    tempo_cv = VirtualParameter("tempo", range=(20, 600))  # BPM
    play_cv = VirtualParameter("play", range=(0, 1))
    reset_cv = VirtualParameter("reset", range=(0, 1))

    # clock outputs we consider the main output_cv as not used
    lead_cv = VirtualParameter("lead", range=(0, 1))  # /1 (quater note)
    div2_cv = VirtualParameter("div2", range=(0, 1))  # /2
    div4_cv = VirtualParameter("div4", range=(0, 1))  # /4
    mul2_cv = VirtualParameter("mul2", range=(0, 1))  # x2
    mul4_cv = VirtualParameter("mul4", range=(0, 1))  # x4
    div3_cv = VirtualParameter("div3", range=(0, 1))  # /3
    div5_cv = VirtualParameter("div5", range=(0, 1))  # /5
    mul3_cv = VirtualParameter("mul3", range=(0, 1))  # x3
    mul7_cv = VirtualParameter("mul7", range=(0, 1))  # x7

    def __init__(self, tick_min_ms=5, **kwargs):
        self.tempo = Decimal(120)
        self._play = 0
        self.reset = 0
        self.tick_min_ms = Decimal(tick_min_ms)

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
            target_cycle_time=self._compute_target_cycle(self.tempo), **kwargs
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

    def main(self, ctx: ThreadContext):
        quater_note_ms = Decimal(60000) / self.tempo
        tick_ms = min(self.tick_min_ms, quater_note_ms / self.smallest_subdivision)

        if self.play:
            to_pulse = []

            for name in self.phases:
                self.phases[name] += self.ratios[name] * (tick_ms / quater_note_ms)
                while self.phases[name] >= Decimal(1.0):
                    self.phases[name] -= Decimal(1.0)
                    to_pulse.append(name)

            if to_pulse:
                pulse_width_ms = min(5, max(1, float(quater_note_ms / 128)))
                outputs = [getattr(self, f"{name}_cv") for name in to_pulse]
                yield 1, outputs
                yield from self.sleep(pulse_width_ms)
                yield 0, outputs

        yield from self.sleep(float(tick_ms))
