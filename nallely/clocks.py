import time
from decimal import Decimal
from fractions import Fraction
from random import random

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


class BernoulliTrigger(VirtualDevice):
    trigger_cv = VirtualParameter(name="trigger", range=(0, 1), conversion_policy=">0")
    probability_cv = VirtualParameter(name="probability", range=(0.0, 1.0), default=0.5)
    bias_cv = VirtualParameter(name="bias", range=(0.0, 1.0))
    quantized_cv = VirtualParameter(
        name="quantized",
        accepted_values=("off", "1/8", "1/6", "1/5", "1/4", "1/3", "1/2", "2/3", "3/4"),
    )

    outA_cv = VirtualParameter(name="outA", range=(0, 1))
    outB_cv = VirtualParameter(name="outB", range=(0, 1))

    def __post_init__(self, **kwargs):
        self.quantize_scale = [
            0,
            *(
                float(Fraction(x))
                for x in self.quantized_cv.parameter.accepted_values[1:]
            ),
            1,
        ]
        return {"disable_output": True}

    @on(trigger_cv, edge="rising")
    def on_trigger(self, value, ctx):
        b = self.bias  #  type: ignore
        p = self.probability  # type: ignore
        pbias = p + b * (1 - p)
        if self.quantized != "off":  # type: ignore
            pquant = min(self.quantize_scale, key=lambda x: abs(x - pbias))
        else:
            pquant = pbias

        trigger = 1 if random() < pquant else 0
        if trigger:
            yield 1, [self.outA_cv]
            yield 0, [self.outA_cv]
        else:
            yield 1, [self.outB_cv]
            yield 0, [self.outB_cv]


class ClockDivider(VirtualDevice):
    """Clock Divider

    inputs:
        * trigger_cv [0, 1] >0 <rising>: Trigger the divider
        * reset_cv [0, 1] >0 <rising>: Reset the internal count to 0
        * mode_cv [gate, tick]: Choose between gate (square mode) or tick (short pulse)

    outputs:
        * div2_cv [0, 1]: /2 output
        * div3_cv [0, 1]: /3 output
        * div4_cv [0, 1]: /4 output
        * div5_cv [0, 1]: /5 output
        * div6_cv [0, 1]: /6 output
        * div7_cv [0, 1]: /7 output
        * div8_cv [0, 1]: /8 output
        * div16_cv [0, 1]: /16 output
        * div32_cv [0, 1]: /32 output

    type: ondemand
    category: clock
    meta: disable default output
    """

    trigger_cv = VirtualParameter(
        name="trigger", range=(0.0, 1.0), conversion_policy=">0"
    )
    reset_cv = VirtualParameter(name="reset", range=(0.0, 1.0), conversion_policy=">0")
    mode_cv = VirtualParameter(name="mode", accepted_values=("gate", "tick"))
    div32_cv = VirtualParameter(name="div32", range=(0.0, 1.0))
    div16_cv = VirtualParameter(name="div16", range=(0.0, 1.0))
    div8_cv = VirtualParameter(name="div8", range=(0.0, 1.0))
    div7_cv = VirtualParameter(name="div7", range=(0.0, 1.0))
    div6_cv = VirtualParameter(name="div6", range=(0.0, 1.0))
    div5_cv = VirtualParameter(name="div5", range=(0.0, 1.0))
    div4_cv = VirtualParameter(name="div4", range=(0.0, 1.0))
    div3_cv = VirtualParameter(name="div3", range=(0.0, 1.0))
    div2_cv = VirtualParameter(name="div2", range=(0.0, 1.0))

    def __post_init__(self, **kwargs):
        self.nb_ticks = 0
        self.outputs = {
            2: self.div2_cv,
            3: self.div3_cv,
            4: self.div4_cv,
            5: self.div5_cv,
            6: self.div6_cv,
            7: self.div7_cv,
            8: self.div8_cv,
            16: self.div16_cv,
            32: self.div32_cv,
        }
        return {"disable_output": True}

    @on(trigger_cv, edge="rising")
    def count_triggers(self, value, ctx):
        if self.nb_ticks == 32:
            self.nb_ticks = 0
        else:
            self.nb_ticks = (self.nb_ticks + 1) % 32
        for count, output in self.outputs.items():
            if self.nb_ticks % count == 0:
                if self.mode == "gate":  # type: ignore
                    yield 1 - getattr(self, output.name), [output]
                else:
                    yield 1, [output]
                    yield 0, [output]

    @on(reset_cv, edge="rising")
    def reset_count(self, value, ctx):
        self.nb_ticks = 0
