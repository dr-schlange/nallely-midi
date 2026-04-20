from nallely import (
    LFO,
    DeviceNotFound,
    ThreadContext,
    VirtualDevice,
    VirtualParameter,
    on,
)
from nallely.codegen import gencode
from nallely.experimental.lisa_pico import Lisa
from nallely.experimental.Minilab3 import Minilab3


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

    def _setup_lfos(self, lisa: Lisa, minilab: Minilab3):
        self.lfo1 = LFO(speed=1, sampling_rate=259)
        self.lfo2 = LFO(speed=1, sampling_rate=259)
        self.lfo3 = LFO(speed=1, sampling_rate=259)
        self.lfo4 = LFO(speed=1, sampling_rate=259)
        for i in range(1, 4):
            lfo = getattr(self, f"lfo{i}")
            lfo.set_parameter("auto_srate", "OFF")

        # map non-shift needs to be declared first
        lisa.general.master_volume = minilab.buttons.b1.scale(0, 127)
        lisa.general.gain = minilab.buttons.b2.scale(0, 127)
        lisa.envelope.attack = minilab.buttons.b3.scale(0, 127)
        lisa.envelope.release = minilab.buttons.b4.scale(0, 127)
        lisa.filter.cutoff = minilab.buttons.b5.scale(0, 127)
        lisa.filter.resonance = minilab.buttons.b6.scale(0, 127)
        lisa.filter.type = minilab.buttons.b7.scale(0, 127)
        lisa.modulation.FM_mod = minilab.buttons.b8.scale(0, 127)

        # map shifts
        self.lfo1.sampling_rate_cv = minilab.buttons.b1.scale(20, 1000)
        self.lfo2.sampling_rate_cv = minilab.buttons.b2.scale(20, 1000)
        self.lfo3.sampling_rate_cv = minilab.buttons.b3.scale(20, 1000)
        self.lfo4.sampling_rate_cv = minilab.buttons.b4.scale(20, 1000)
        self.lfo1.speed_cv = minilab.buttons.b5.scale(0.5, 7)
        self.lfo2.speed_cv = minilab.buttons.b6.scale(0.5, 7)
        self.lfo3.speed_cv = minilab.buttons.b7.scale(0.5, 7)
        self.lfo4.speed_cv = minilab.buttons.b8.scale(0.5, 7)
        lisa.wavetable.stream_table1 = self.lfo1.scale(-8192, 8192)
        lisa.wavetable.stream_table2 = self.lfo2.scale(-8192, 8192)
        lisa.wavetable.stream_table3 = self.lfo3.scale(-8192, 8192)
        lisa.wavetable.stream_table4 = self.lfo4.scale(-8192, 8192)

    def collect_mappings(self, minilab: Minilab3):
        non_shift_map = []
        shift_map = []
        btns = minilab.buttons
        for i in range(1, 9):
            src = getattr(btns, f"b{i}")
            links = src.outgoing_links
            non_shift_map.append(links[0])
            shift_map.append(links[1])
            links[1].muted = True

        slds = minilab.sliders
        for i in range(1, 5):
            src = getattr(slds, f"s{i}")
            links = src.outgoing_links
            non_shift_map.append(links[0])
            shift_map.append(links[1])
            links[1].muted = True
        self.non_shift_map = non_shift_map
        self.shift_map = shift_map

    def __post_init__(self, **kwargs):
        lisa = Lisa(autoconnect=False)
        try:
            lisa.try_connection()
        except DeviceNotFound:
            print("[LISA] Couldn't find LISA synth, needs to be connected manually")
        self.lisa = lisa
        minilab = Minilab3(autoconnect=False)
        try:
            minilab.try_connection(read_input_only=True)
        except DeviceNotFound:
            print(
                "[LISA] Couldn't find the Minilab3 controller, needs to be connected manually"
            )
        self.minilab = minilab
        lisa.keys.notes = minilab.keys.notes
        lisa.wavetable.freeze_wt1 = minilab.pads.p1
        lisa.wavetable.freeze_wt2 = minilab.pads.p2
        lisa.wavetable.freeze_wt3 = minilab.pads.p3
        lisa.wavetable.freeze_wt4 = minilab.pads.p4
        lisa.wavetable.reset_all_wt = minilab.pads.p8
        lisa.wavetable.reset_all_write_idx = minilab.pads.p7
        self._setup_lfos(lisa, minilab)

        # map non-shifts
        self.wt1_amplitude_cv = minilab.sliders.s1.scale(0, 1)
        self.wt2_amplitude_cv = minilab.sliders.s2.scale(0, 1)
        self.wt3_amplitude_cv = minilab.sliders.s3.scale(0, 1)
        self.wt4_amplitude_cv = minilab.sliders.s4.scale(0, 1)

        # map shifts
        lisa.modulation.timbre = minilab.sliders.s1.scale(0, 127)
        lisa.modulation.color = minilab.sliders.s2.scale(0, 127)
        lisa.envelope.attack = minilab.sliders.s3.scale(0, 127)
        lisa.envelope.release = minilab.sliders.s4.scale(0, 127)
        lisa.wavetable.reset_all_write_idx = "ON"
        lisa.wavetable.reset_all_write_idx = "OFF"
        self.collect_mappings(minilab)
        return {"disable_output": True}

    def setup(self) -> ThreadContext:
        self.lfo1.start()
        self.lfo2.start()
        self.lfo3.start()
        self.lfo4.start()
        return super().setup()

    def stop(self, clear_queues=True):
        self.lfo1.stop()
        self.lfo2.stop()
        self.lfo3.stop()
        self.lfo4.stop()
        self.lisa.stop()
        self.minilab.stop()
        return super().stop(clear_queues)

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

    @on(shift_cv, edge="rising")
    def on_shift_rising(self, value, ctx):
        for link in self.non_shift_map:
            link.muted = True
        for link in self.shift_map:
            link.muted = False

    @on(shift_cv, edge="falling")
    def on_shift_falling(self, value, ctx):
        for link in self.non_shift_map:
            link.muted = False
        for link in self.shift_map:
            link.muted = True

    @on(perf_impact_cv, edge="any")
    def on_perf_impact_any(self, value, ctx):
        if self.perf_impact == "LOW":
            sr, freq = 50, 0.2
        elif self.perf_impact == "MEDIUM":
            sr, freq = 130, 0.5
        else:
            sr, freq = 259, 1
        for i in range(1, 5):
            lfo = getattr(self, f"lfo{i}")
            lfo.set_parameter("speed", freq)
            lfo.set_parameter("sampling_rate", sr)
