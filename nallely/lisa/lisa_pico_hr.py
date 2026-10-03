"""
Generated configuration for the dr-schlange - LISA
"""

import nallely


class GeneralSection(nallely.Module):
    gain = nallely.ModuleParameter(
        3, init_value=100, description="General Gain", high_res="unipolar"
    )
    master_volume = nallely.ModuleParameter(
        7, init_value=100, description="General Volume", high_res="unipolar"
    )
    panning = nallely.ModuleParameter(14, description="Panning", high_res="unipolar")
    engine_select = nallely.ModuleParameter(8, description="Engine Selection")
    voice_mode = nallely.ModuleParameter(
        2, description="Mode for the voices", accepted_values=["poly", "unison", "mono"]
    )
    detune = nallely.ModuleParameter(
        4,
        init_value=70,
        description="Detune applied to secondary voice in unison mode",
        high_res="unipolar",
    )
    sustain = nallely.ModuleParameter(
        64, description="Sustain (Hold notes)", accepted_values=["OFF", "ON"]
    )
    midi_dev = nallely.ModuleParameter(127, description="Dev functions")


class ButtonsSection(nallely.Module):
    b1 = nallely.ModuleParameter(100, description="B1")
    b2 = nallely.ModuleParameter(101, description="B2")
    b3 = nallely.ModuleParameter(102, description="B3")
    b4 = nallely.ModuleParameter(103, description="B4")
    b5 = nallely.ModuleParameter(104, description="B5")


class EnvelopeSection(nallely.Module):
    attack = nallely.ModuleParameter(
        11, description="Envelope Attack", high_res="unipolar"
    )
    release = nallely.ModuleParameter(
        12, description="Envelope Release", high_res="unipolar"
    )


class FilterSection(nallely.Module):
    type = nallely.ModuleParameter(
        75,
        description="Filter Type",
        accepted_values=["lowpass", "highpass", "bandpass"],
    )
    cutoff = nallely.ModuleParameter(
        74, description="Filter Cutoff", high_res="unipolar"
    )
    resonance = nallely.ModuleParameter(
        71, description="Filter Resonance", high_res="unipolar"
    )


class ModulationSection(nallely.Module):
    timbre = nallely.ModuleParameter(9, description="Timbre", high_res="unipolar")
    timbre_mod = nallely.ModuleParameter(
        16, description="Timbre Modulation", high_res="unipolar"
    )
    color = nallely.ModuleParameter(10, description="Color", high_res="unipolar")
    color_mod = nallely.ModuleParameter(
        17, description="Color Modulation", high_res="unipolar"
    )
    FM_mod = nallely.ModuleParameter(
        15, description="FM Modulation", high_res="unipolar"
    )
    FM_slew = nallely.ModuleParameter(
        18, description="Slew applied to the FM modulation", high_res="unipolar"
    )


class WavetableSection(nallely.Module):
    stream_table1 = nallely.ModulePitchwheel(channel=0, stream=True, high_res="bipolar")
    stream_table2 = nallely.ModulePitchwheel(channel=1, stream=True, high_res="bipolar")
    stream_table3 = nallely.ModulePitchwheel(channel=2, stream=True, high_res="bipolar")
    stream_table4 = nallely.ModulePitchwheel(channel=3, stream=True, high_res="bipolar")
    phase_ratio_table1 = nallely.ModulePitchwheel(
        channel=5, stream=True, high_res="bipolar"
    )
    phase_ratio_table2 = nallely.ModulePitchwheel(
        channel=6, stream=True, high_res="bipolar"
    )
    phase_ratio_table3 = nallely.ModulePitchwheel(
        channel=7, stream=True, high_res="bipolar"
    )
    phase_ratio_table4 = nallely.ModulePitchwheel(
        channel=8, stream=True, high_res="bipolar"
    )
    phase_offset_table1 = nallely.ModulePitchwheel(
        channel=9, stream=True, high_res="bipolar"
    )
    phase_offset_table2 = nallely.ModulePitchwheel(
        channel=10, stream=True, high_res="bipolar"
    )
    phase_offset_table3 = nallely.ModulePitchwheel(
        channel=11, stream=True, high_res="bipolar"
    )
    phase_offset_table4 = nallely.ModulePitchwheel(
        channel=12, stream=True, high_res="bipolar"
    )
    level_table1 = nallely.ModuleParameter(
        96, init_value=127, description="Wavetable 1 mix level", high_res="unipolar"
    )
    level_table2 = nallely.ModuleParameter(
        97, init_value=127, description="Wavetable 2 mix level", high_res="unipolar"
    )
    level_table3 = nallely.ModuleParameter(
        98, init_value=127, description="Wavetable 3 mix level", high_res="unipolar"
    )
    level_table4 = nallely.ModuleParameter(
        99, init_value=127, description="Wavetable 4 mix level", high_res="unipolar"
    )
    hard_sync = nallely.ModuleParameter(
        91, description="Hard sync all wavetable phases", accepted_values=["OFF", "ON"]
    )
    phase_reset = nallely.ModuleParameter(126, description="Reset the phase")
    phase_offset = nallely.ModuleParameter(
        125, description="Add an offset to the phase", high_res="bipolar"
    )
    retrigger = nallely.ModuleParameter(
        124, description="Reset the phase on note strike", accepted_values=["OFF", "ON"]
    )
    freeze_all = nallely.ModuleParameter(
        123,
        description="Freeze all the current wavetables",
        accepted_values=["OFF", "ON"],
    )
    freeze_wt1 = nallely.ModuleParameter(
        119, description="Freezes wavetable 1", accepted_values=["OFF", "ON"]
    )
    freeze_wt2 = nallely.ModuleParameter(
        120, description="Freezes wavetable 2", accepted_values=["OFF", "ON"]
    )
    freeze_wt3 = nallely.ModuleParameter(
        121, description="Freezes wavetable 3", accepted_values=["OFF", "ON"]
    )
    freeze_wt4 = nallely.ModuleParameter(
        122, description="Freezes wavetable 4", accepted_values=["OFF", "ON"]
    )
    reset_all_write_idx = nallely.ModuleParameter(
        118, description="Reset all write indices", accepted_values=["OFF", "ON"]
    )
    reset_all_wt = nallely.ModuleParameter(
        117, description="Reset all wavetables", accepted_values=["OFF", "ON"]
    )
    mode_wt1 = nallely.ModuleParameter(
        112,
        description="Filter Type",
        accepted_values=["circular", "scroll", "manual", "manual_interpolated"],
    )
    mode_wt2 = nallely.ModuleParameter(
        113,
        description="Filter Type",
        accepted_values=["circular", "scroll", "manual", "manual_interpolated"],
    )
    mode_wt3 = nallely.ModuleParameter(
        114,
        description="Filter Type",
        accepted_values=["circular", "scroll", "manual", "manual_interpolated"],
    )
    mode_wt4 = nallely.ModuleParameter(
        115,
        description="Filter Type",
        accepted_values=["circular", "scroll", "manual", "manual_interpolated"],
    )
    index_wt1 = nallely.ModuleParameter(108, description="Wavetable 1 write index")
    index_wt2 = nallely.ModuleParameter(109, description="Wavetable 2 write index")
    index_wt3 = nallely.ModuleParameter(110, description="Wavetable 3 write index")
    index_wt4 = nallely.ModuleParameter(111, description="Wavetable 4 write index")
    sluggish_mode = nallely.ModuleParameter(
        94,
        description="Activates the sluggish-memory mode",
        accepted_values=["ON", "OFF"],
    )
    slug_depth = nallely.ModuleParameter(
        93, init_value=64, description="Slug mode depth (buffer size)"
    )
    manual_slug_level = nallely.ModuleParameter(
        107,
        description="All wavetables slug blend level controled from external CC",
        high_res="unipolar",
    )
    auto_slug_factor = nallely.ModuleParameter(
        105,
        description="Activates the auto-slug factor for the sluggish mode",
        accepted_values=["ON", "OFF"],
    )
    sluggish_factor = nallely.ModuleParameter(
        106,
        init_value=20,
        description="How sluggish is speed between blends",
        high_res="unipolar",
    )
    auto_slug_direction = nallely.ModuleParameter(
        92,
        description="Do we blend with the near past or distant past (default near past)",
        accepted_values=["forward", "backward"],
    )


class FeaturesSection(nallely.Module):
    peak_envelope = nallely.ModuleParameter(
        95, description="Computed peak envelope (disabled atm)", high_res="unipolar"
    )


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel(channel=4, stream=True, high_res="bipolar")


class LisaHR(nallely.HRDevice):
    general: GeneralSection  # type: ignore
    buttons: ButtonsSection  # type: ignore
    envelope: EnvelopeSection  # type: ignore
    filter: FilterSection  # type: ignore
    modulation: ModulationSection  # type: ignore
    wavetable: WavetableSection  # type: ignore
    features: FeaturesSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        self.manufacturer = "dr-schlange"
        super().__init__(
            *args,
            device_name=device_name or "LISA",
            **kwargs,
        )

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def buttons(self) -> ButtonsSection:
        return self.modules.buttons

    @property
    def envelope(self) -> EnvelopeSection:
        return self.modules.envelope

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def modulation(self) -> ModulationSection:
        return self.modules.modulation

    @property
    def wavetable(self) -> WavetableSection:
        return self.modules.wavetable

    @property
    def features(self) -> FeaturesSection:
        return self.modules.features

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys
