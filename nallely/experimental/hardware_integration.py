from nallely import (
    LFO,
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
    VRef,
    on,
)
from nallely.codegen import gencode
from nallely.core import get_virtual_devices
from nallely.experimental.lisa_pico import Lisa
from nallely.experimental.Minilab3 import Minilab3
from nallely.trevor import TrevorBus


# @gencode(keep_decorator=True)
class LISA(VirtualDevice):
    """
    Interface with LISA, expose only few entries, spawns 4 LFOs and connects hardware. Manage lifecycles of each modules.

    inputs:
    * wt1_amplitude_cv [0, 1] init=1 <any>: amplitude for waveform of wavetable 1
    * wt2_amplitude_cv [0, 1] init=1 <any>: amplitude for waveform of wavetable 2
    * wt3_amplitude_cv [0, 1] init=1 <any>: amplitude for waveform of wavetable 3
    * wt4_amplitude_cv [0, 1] init=1 <any>: amplitude for waveform of wavetable 4
    * reconnect_cv [0, 1] init=0 <rising>: force a reconnection to MIDI devices
    * shift_cv [0, 1] init=0 <rising, falling>: access to second layer of buttons/sliders
    * perf_impact_cv [LOW, MEDIUM, HIGH] init=HIGH <any>: low or high impact on CPU (low = slower buffers fill)

    type: ondemand
    category: hardware-integration
    meta: disable default output
    """

    perf_impact_cv = VirtualParameter(
        name="perf_impact", accepted_values=["LOW", "MEDIUM", "HIGH"], default="HIGH"
    )
    shift_cv = VirtualParameter(name="shift", range=(0.0, 1.0), default=0.0)
    wt1_amplitude_cv = VirtualParameter(
        name="wt1_amplitude", range=(0.0, 1.0), default=1.0
    )
    wt2_amplitude_cv = VirtualParameter(
        name="wt2_amplitude", range=(0.0, 1.0), default=1.0
    )
    wt3_amplitude_cv = VirtualParameter(
        name="wt3_amplitude", range=(0.0, 1.0), default=1.0
    )
    wt4_amplitude_cv = VirtualParameter(
        name="wt4_amplitude", range=(0.0, 1.0), default=1.0
    )
    reconnect_cv = VirtualParameter(name="reconnect", range=(0.0, 1.0), default=0.0)
    lfo1 = VRef(
        LFO,
        default={
            "waveform": "sine",
            "sampling_rate": 259,
            "speed": 1,
            "auto_srate": "OFF",
        },
    )
    lfo2 = VRef(LFO, default=lfo1.default)
    lfo3 = VRef(LFO, default=lfo1.default)
    lfo4 = VRef(LFO, default=lfo1.default)
    lisa = VRef(Lisa)
    minilab = VRef(Minilab3)

    def _setup_lfos(self, lisa: Lisa, minilab: Minilab3):
        # default layer
        self.map_on_layer(
            idx=0, src=minilab.keys.mod.scale(), dst=lisa.general.master_volume
        )
        self.map_on_layer(idx=0, src=minilab.buttons.b1.scale(), dst=lisa.general.gain)
        self.map_on_layer(
            idx=0, src=minilab.buttons.b3.scale(), dst=lisa.envelope.attack
        )
        self.map_on_layer(
            idx=0, src=minilab.buttons.b4.scale(), dst=lisa.envelope.release
        )
        self.map_on_layer(idx=0, src=minilab.buttons.b5.scale(), dst=lisa.filter.cutoff)
        self.map_on_layer(
            idx=0, src=minilab.buttons.b6.scale(), dst=lisa.filter.resonance
        )
        self.map_on_layer(idx=0, src=minilab.buttons.b7.scale(), dst=lisa.filter.type)
        self.map_on_layer(
            idx=0, src=minilab.buttons.b8.scale(), dst=lisa.modulation.FM_mod
        )

        # upper layer
        self.map_on_layer(
            idx=1, src=minilab.buttons.b1.scale(0.5, 7), dst=self.lfo1.speed_cv
        )
        self.map_on_layer(
            idx=1, src=minilab.buttons.b2.scale(0.5, 7), dst=self.lfo2.speed_cv
        )
        self.map_on_layer(
            idx=1, src=minilab.buttons.b3.scale(0.5, 7), dst=self.lfo3.speed_cv
        )
        self.map_on_layer(
            idx=1, src=minilab.buttons.b4.scale(0.5, 7), dst=self.lfo4.speed_cv
        )
        self.map_on_layer(
            idx=1,
            src=minilab.buttons.b5.scale(20, 1000),
            dst=self.lfo1.sampling_rate_cv,
        )
        self.map_on_layer(
            idx=1,
            src=minilab.buttons.b6.scale(20, 1000),
            dst=self.lfo2.sampling_rate_cv,
        )
        self.map_on_layer(
            idx=1,
            src=minilab.buttons.b7.scale(20, 1000),
            dst=self.lfo3.sampling_rate_cv,
        )
        self.map_on_layer(
            idx=1,
            src=minilab.buttons.b8.scale(20, 1000),
            dst=self.lfo4.sampling_rate_cv,
        )

        # wavetables
        lisa.wavetable.stream_table1 = self.lfo1.scale()
        lisa.wavetable.stream_table2 = self.lfo2.scale()
        lisa.wavetable.stream_table3 = self.lfo3.scale()
        lisa.wavetable.stream_table4 = self.lfo4.scale()

    def __post_init__(self, **kwargs):
        # for device in get_virtual_devices():
        #     if isinstance(device, TrevorBus):
        #         self.trevor_bus = device
        #         break
        # else:
        #     self.trevor_bus = None
        self.prepare_all()
        return {"disable_output": True}

    def map_on_layer(self, idx, dst, src):
        self.layers[idx].append(src.bind(dst))

    def prepare_all(self):
        self.layers = [[], []]
        lisa = self.lisa
        minilab = self.minilab
        lisa.keys.notes = minilab.keys.notes
        lisa.wavetable.freeze_wt1 = minilab.pads.p1
        lisa.wavetable.freeze_wt2 = minilab.pads.p2
        lisa.wavetable.freeze_wt3 = minilab.pads.p3
        lisa.wavetable.freeze_wt4 = minilab.pads.p4
        lisa.wavetable.reset_all_wt = minilab.pads.p8
        lisa.wavetable.reset_all_write_idx = minilab.pads.p7
        self._setup_lfos(lisa, minilab)

        # default layer
        self.map_on_layer(
            idx=0, src=minilab.sliders.s1.scale(), dst=self.wt1_amplitude_cv
        )
        self.map_on_layer(
            idx=0, src=minilab.sliders.s2.scale(), dst=self.wt2_amplitude_cv
        )
        self.map_on_layer(
            idx=0, src=minilab.sliders.s3.scale(), dst=self.wt3_amplitude_cv
        )
        self.map_on_layer(
            idx=0, src=minilab.sliders.s4.scale(), dst=self.wt4_amplitude_cv
        )

        # upper layer
        self.map_on_layer(
            idx=1, src=minilab.sliders.s1.scale(), dst=lisa.modulation.timbre
        )
        self.map_on_layer(
            idx=1, src=minilab.sliders.s2.scale(), dst=lisa.modulation.color
        )
        self.map_on_layer(
            idx=1, src=minilab.sliders.s3.scale(), dst=lisa.envelope.attack
        )
        self.map_on_layer(
            idx=1, src=minilab.sliders.s4.scale(), dst=lisa.envelope.release
        )

        # reset wavetables
        lisa.wavetable.reset_all_write_idx = "ON"
        lisa.wavetable.reset_all_write_idx = "OFF"
        self._activate_layer(0)

    def setup(self) -> ThreadContext:
        self.lfo1.start()
        self.lfo2.start()
        self.lfo3.start()
        self.lfo4.start()
        return super().setup()

    def adapt_range(self, lfo, coef):
        for link in lfo.outgoing_links:
            if link.chain:
                lower, upper = link.dest.parameter.range
                link.chain.to_min = lower * coef
                link.chain.to_max = upper * coef

    @on(wt4_amplitude_cv, edge="any")
    def on_wt4_amplitude_any(self, value, ctx):
        self.adapt_range(self.lfo4, coef=value)

    @on(wt3_amplitude_cv, edge="any")
    def on_wt3_amplitude_any(self, value, ctx):
        self.adapt_range(self.lfo3, coef=value)

    @on(wt2_amplitude_cv, edge="any")
    def on_wt2_amplitude_any(self, value, ctx):
        self.adapt_range(self.lfo2, coef=value)

    @on(wt1_amplitude_cv, edge="any")
    def on_wt1_amplitude_any(self, value, ctx):
        self.adapt_range(self.lfo1, coef=value)

    @on(reconnect_cv, edge="rising")
    def on_reconnect_rising(self, value, ctx):
        self.reconnect = 0
        self.lisa.reconnect_input(exact=False)
        self.lisa.reconnect_output(exact=False)
        self.minilab.reconnect_input(exact=False)

    def _activate_layer(self, idx):
        for i, layer in enumerate(self.layers):
            mute = i != idx
            for link in layer:
                link.muted = mute
        # if self.trevor_bus:
        #     self.trevor_bus.send_update()

    @on(shift_cv, edge="rising")
    def on_shift_rising(self, value, ctx):
        self._activate_layer(0)

    @on(shift_cv, edge="falling")
    def on_shift_falling(self, value, ctx):
        self._activate_layer(1)

    @on(perf_impact_cv, edge="any")
    def on_perf_impact_any(self, value, ctx):
        if self.perf_impact == "LOW":  # type: ignore
            sr, freq = 50, 0.2
        elif self.perf_impact == "MEDIUM":  # type: ignore
            sr, freq = 130, 0.5
        else:
            sr, freq = 259, 1
        for i in range(1, 5):
            lfo = getattr(self, f"lfo{i}")
            lfo.speed = freq
            lfo.sampling_rate = sr
