"""
Experiment of modeling a neuron
code 99% LLM generated for this PoC, will change in the future
"""

import math
import random
import time

from nallely import VirtualDevice, VirtualParameter, on
from nallely.codegen import gencode


# @gencode(keep_decorator=True)
class CyberneticNeuron(VirtualDevice):
    """Cybernetic Non-Linear Integrator with Patchable Avalanche and Fatigue

    A generalized cybernetic actor neuron. It integrates inputs continuously.
    Avalanche (positive feedback) and Fatigue (negative feedback) can be wired
    internally (self-patch) or externally (from other neurons/sensors).

    inputs:
    * preset_cv [RS, IB, CH, FS, LTS, RZ] <any>: Neuron common profiles
    * input_cv [0.0, 1.0] init=0.0: Raw incoming signal (sensors, webcam, or other nodes)
    * input_gain_cv [0.0, 30.0] init=15.0: Input gain
    * feedback_gain_cv [0.0, 50.0] init=25.0: Feedback gain
    * fatigue_gain_cv [-50.0, 0.0] init=-25.0: Fatigue gain
    * feedback_in_cv [-1.0, 1.0] init=0: Avalanche loop input (positive feedback)
    * fatigue_in_cv [-1.0, 1.0] init=0: Fatigue/Inhibition input (negative feedback)
    * a_cv [0.01, 0.1] init=0.02: Recovery variable time scale
    * b_cv [0.05, 0.3] init=0.2: Recovery variable sensitivity to v
    * c_cv [-75.0, -50.0] init=-65.0: After-spike reset voltage
    * d_cv [0.05, 10.0] init=8.0: After-spike reset recovery value
    * noise_cv [0.0, 1.0] init=0.0: Tiny continuous background drift
    * freq_cv [512, 10000] init=1024 <any>: Refresh frequency

    outputs:
    * output_cv [-1.0, 1.0]: Continuous integrated voltage potential
    * spike_out_cv [0.0, 1.0]: Sends a value when a spike occured

    type: hybrid
    category: cybernetic
    """

    preset_cv = VirtualParameter(
        name="preset", accepted_values=["RS", "IB", "CH", "FS", "LTS", "RZ"]
    )
    input_cv = VirtualParameter(name="input", range=(0.0, 1.0), default=0.0)
    input_gain_cv = VirtualParameter(name="input_gain", range=(0.0, 30.0), default=15.0)
    feedback_gain_cv = VirtualParameter(
        name="feedback_gain", range=(0.0, 50.0), default=25.0
    )
    fatigue_gain_cv = VirtualParameter(
        name="fatigue_gain", range=(-50.0, 0.0), default=-25.0
    )
    feedback_in_cv = VirtualParameter(
        name="feedback_in", range=(-1.0, 1.0), default=0.0
    )
    fatigue_in_cv = VirtualParameter(name="fatigue_in", range=(-1.0, 1.0), default=0.0)
    a_cv = VirtualParameter(name="a", range=(0.01, 0.1), default=0.02)
    b_cv = VirtualParameter(name="b", range=(0.05, 0.3), default=0.2)
    c_cv = VirtualParameter(name="c", range=(-75.0, -50.0), default=-65.0)
    d_cv = VirtualParameter(name="d", range=(0.05, 10.0), default=8.0)
    noise_cv = VirtualParameter(name="noise", range=(0.0, 1.0), default=0.0)
    freq_cv = VirtualParameter(name="freq", range=(512.0, 10000.0), default=1024.0)
    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))
    spike_out_cv = VirtualParameter(name="spike_out", range=(0.0, 1.0))

    PRESET = {
        "RS": (0.02, 0.2, -65, 8, 5.68),
        "IB": (0.02, 0.20, -55, 4, 5.68),
        "CH": (0.02, 0.20, -50, 2, 5.21),
        "FS": (0.10, 0.20, -65, 2, 5.86),
        "LTS": (0.02, 0.25, -65, 2, 1),
        "RZ": (0.10, 0.26, -65, 2, 0.29),
    }

    def __post_init__(self, **kwargs):
        self.V_MIN, self.V_MAX = (-70.0, 30.0)
        self.v = self.c
        self.u = self.b * self.v
        self.last_time = time.time()
        self.target_cycle_time = (
            1 / self.freq if self.freq else self.freq_cv.parameter.default
        )
        self.has_spiked = False
        self.I_feedback_decay = 0.0
        self.tau_feedback = 25.0
        self._time_acc = 0.0

    def main(self, ctx):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now
        dt_ms = min(dt * 1000.0, 30.0)
        I_base = self.input * self.input_gain
        I_fatigue = self.fatigue_in * self.fatigue_gain
        drift = (random.random() - 0.5) * self.noise * 5.0
        self._time_acc += dt_ms
        MS_STEP = 1.0
        while self._time_acc >= MS_STEP:
            self.I_feedback_decay *= math.exp(-MS_STEP / self.tau_feedback)
            I_total = (
                I_base + I_fatigue + self.I_feedback_decay * self.feedback_in + drift
            )
            self.v += 0.5 * (0.04 * self.v**2 + 5.0 * self.v + 140.0 - self.u + I_total)
            self.v = max(-90.0, min(35.0, self.v))
            self.v += 0.5 * (0.04 * self.v**2 + 5.0 * self.v + 140.0 - self.u + I_total)
            self.v = max(-90.0, min(35.0, self.v))
            self.u += self.a * (self.b * self.v - self.u)
            if self.v >= self.V_MAX:
                self.has_spiked = True
                self.v = self.c
                self.u += self.d
                self.I_feedback_decay += self.feedback_gain
            self._time_acc -= MS_STEP
        self.v = max(-90.0, min(35.0, self.v))
        normalized_output = -1.0 + 2.0 * (self.v - self.V_MIN) / (
            self.V_MAX - self.V_MIN
        )
        if self.has_spiked:
            yield (1, [self.spike_out_cv])
            self.has_spiked = False
        else:
            yield (0, [self.spike_out_cv])
        yield max(-1.0, min(1.0, normalized_output))

    @on(freq_cv, edge="any")
    def on_freq_any(self, value, ctx):
        self.target_cycle_time = 1 / value if value != 0 else 0.5

    @on(preset_cv, edge="any")
    def on_preset_any(self, value, ctx):
        self.a, self.b, self.c, self.d, self.input_gain = self.PRESET[value]
