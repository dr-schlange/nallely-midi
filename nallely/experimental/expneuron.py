"""
Experiment of modeling a neuron
code 100% LLM generated for this PoC, will change in the future
"""

import random
import time

from nallely import VirtualDevice, VirtualParameter, on


class CyberneticNeuron(VirtualDevice):
    """Cybernetic Non-Linear Integrator with Patchable Avalanche and Fatigue

    A generalized cybernetic actor neuron. It integrates inputs continuously.
    Avalanche (positive feedback) and Fatigue (negative feedback) can be wired
    internally (self-patch) or externally (from other neurons/sensors).

    inputs:
    * input_cv [-1.0, 1.0]: Raw incoming signal (sensors, webcam, or other nodes)
    * feedback_in_cv [-1.0, 1.0] init=0: Avalanche loop input (positive feedback)
    * fatigue_in_cv [-1.0, 1.0] init=0: Fatigue/Inhibition input (negative feedback)
    * a_cv [0.01, 0.1] init=0.02: Recovery variable time scale
    * b_cv [0.05, 0.3] init=0.2: Recovery variable sensitivity to v
    * c_cv [-75.0, -50.0] init=-65.0: After-spike reset voltage
    * d_cv [0.05, 10.0] init=8.0: After-spike reset recovery value
    * noise_cv [0.0, 1.0] init=0.05: Tiny continuous background drift
    * freq_cv [512, 10000] init=1024 <any>: Refresh frequency

    outputs:
    * output_cv [-1.0, 1.0]: Continuous integrated voltage potential

    type: hybrid
    category: cybernetic
    """

    input_cv = VirtualParameter(name="input", range=(-1.0, 1.0))
    feedback_in_cv = VirtualParameter(
        name="feedback_in", range=(-1.0, 1.0), default=0.0
    )
    fatigue_in_cv = VirtualParameter(name="fatigue_in", range=(-1.0, 1.0), default=0.0)
    a_cv = VirtualParameter(name="a", range=(0.01, 0.1), default=0.02)
    b_cv = VirtualParameter(name="b", range=(0.05, 0.3), default=0.2)
    c_cv = VirtualParameter(name="c", range=(-75.0, -50.0), default=-65.0)
    d_cv = VirtualParameter(name="d", range=(0.05, 10.0), default=8.0)
    noise_cv = VirtualParameter(name="noise", range=(0.0, 1.0), default=0.05)
    freq_cv = VirtualParameter(name="freq", range=(512, 10000.0), default=1024.0)
    output_cv = VirtualParameter(name="output", range=(-1.0, 1.0))

    def __post_init__(self, **kwargs):
        self.V_MIN, self.V_MAX = (-70.0, 30.0)
        self.v = self.c
        self.u = self.b * self.v
        self.last_time = time.time()
        self.target_cycle_time = (
            1 / self.freq if self.freq else self.freq_cv.parameter.default
        )

    def main(self, ctx):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        dt_ms = dt * 1000.0
        dt_ms = min(dt_ms, 50.0)

        I_base = self.input * 15.0
        I_feedback = self.feedback_in * 20.0
        I_fatigue = self.fatigue_in * -25.0
        I_injected = I_base + I_feedback + I_fatigue
        drift = (random.random() - 0.5) * self.noise * 5.0

        I_total = I_injected + drift

        v_next = self.v + dt_ms * (
            0.04 * (self.v**2) + 5.0 * self.v + 140.0 - self.u + I_total
        )

        self.u += dt_ms * self.a * (self.b * self.v - self.u)
        self.v = v_next

        if self.v >= self.V_MAX:
            self.v = self.c
            self.u += self.d

        self.v = max(self.V_MIN - 5.0, min(self.V_MAX + 5.0, self.v))

        normalized_output = -1.0 + 2.0 * (self.v - self.V_MIN) / (
            self.V_MAX - self.V_MIN
        )
        return max(-1.0, min(1.0, normalized_output))

    @on(freq_cv, edge="any")
    def on_freq_any(self, value, ctx):
        self.target_cycle_time = 1 / value if value != 0 else 0.5
