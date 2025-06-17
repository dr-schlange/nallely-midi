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
        super().__init__(target_cycle_time=1 / 50, **kwargs)

    def process_input(self, param, value):
        if param == "gate":
            return super().process_input(param, 1 if value != 0 else 0)
        super().process_input(param, value)

    def setup(self):
        ctx = super().setup()
        ctx.phase = "idle"  # 'attack', 'decay', 'sustain', 'release', 'idle'
        ctx.time_in_phase = 0.0
        ctx.level = 0.0
        return ctx

    @on(gate_cv, edge="rising")
    def on_gate_1(self, _, ctx):
        if ctx.phase in ["idle", "release"]:
            ctx.phase = "attack"
            ctx.time_in_phase = 0.0

    @on(gate_cv, edge="falling")
    def on_gate_0(self, _, ctx):
        if ctx.phase not in ["release", "idle"]:
            ctx.phase = "release"
            ctx.time_in_phase = 0.0
            ctx.release_start_level = ctx.level

    def main(self, ctx):
        dt = self.target_cycle_time
        ctx.time_in_phase += dt

        # if self.gate:
        #     if ctx.phase in ["idle", "release"]:
        #         ctx.phase = "attack"
        #         ctx.time_in_phase = 0.0
        # else:
        #     if ctx.phase not in ["release", "idle"]:
        #         ctx.phase = "release"
        #         ctx.time_in_phase = 0.0
        #         ctx.release_start_level = ctx.level

        if ctx.phase == "attack":
            if self.attack == 0:
                ctx.level = 1.0
                ctx.phase = "decay"
                ctx.time_in_phase = 0.0
            else:
                ctx.level = min(1.0, ctx.time_in_phase / self.attack)
                if ctx.level >= 1.0:
                    ctx.phase = "decay"
                    ctx.time_in_phase = 0.0

        elif ctx.phase == "decay":
            if self.decay == 0:
                ctx.level = self.sustain
                ctx.phase = "sustain"
            else:
                decay_progress = ctx.time_in_phase / self.decay
                ctx.level = 1.0 - (1.0 - self.sustain) * min(1.0, decay_progress)
                if decay_progress >= 1.0:
                    ctx.phase = "sustain"

        elif ctx.phase == "sustain":
            ctx.level = self.sustain

        elif ctx.phase == "release":
            if self.release == 0:
                ctx.level = 0.0
                ctx.phase = "idle"
            else:
                release_progress = ctx.time_in_phase / self.release
                ctx.level = ctx.release_start_level * (1.0 - min(1.0, release_progress))
                if release_progress >= 1.0:
                    ctx.level = 0.0
                    ctx.phase = "idle"

        elif ctx.phase == "idle":
            ctx.level = 0.0

        return ctx.level

    @property
    def range(self):
        return (0.0, 1.0)
