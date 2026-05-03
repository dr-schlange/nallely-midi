"""
Generated configuration for the drschlange - lisa
"""

import nallely


class GeneralSection(nallely.Module):
    gain = nallely.ModuleParameter(3, init_value=32, description="General Gain")
    master_volume = nallely.ModuleParameter(7, description="General Volume")
    engine_select = nallely.ModuleParameter(8, description="Engine Selection")
    voice_mode = nallely.ModuleParameter(
        2, description="Mode for the voices", accepted_values=["poly", "unison"]
    )
    sustain = nallely.ModuleParameter(64, description="Sustain (Hold notes)")
    midi_dev = nallely.ModuleParameter(127, description="Dev functions")


class ButtonsSection(nallely.Module):
    b1 = nallely.ModuleParameter(100, description="B1")
    b2 = nallely.ModuleParameter(101, description="B2")
    b3 = nallely.ModuleParameter(102, description="B3")
    b4 = nallely.ModuleParameter(103, description="B4")
    b5 = nallely.ModuleParameter(104, description="B5")


class EnvelopeSection(nallely.Module):
    attack = nallely.ModuleParameter(11, description="Envelope Attack")
    release = nallely.ModuleParameter(12, description="Envelope Release")


class FilterSection(nallely.Module):
    type = nallely.ModuleParameter(
        75,
        description="Filter Type",
        accepted_values=["lowpass", "highpass", "bandpass"],
    )
    cutoff = nallely.ModuleParameter(74, description="Filter Cutoff")
    resonance = nallely.ModuleParameter(71, description="Filter Resonance")


class ModulationSection(nallely.Module):
    timbre = nallely.ModuleParameter(9, description="Timbre")
    timbre_mod = nallely.ModuleParameter(16, description="Timbre Modulation")
    color = nallely.ModuleParameter(10, description="Color")
    color_mod = nallely.ModuleParameter(17, description="Color Modulation")
    FM_mod = nallely.ModuleParameter(15, description="FM Modulation")
    FM_slew = nallely.ModuleParameter(
        18, description="Slew applied to the FM modulation"
    )


class WavetableSection(nallely.Module):
    stream_table1 = nallely.ModulePitchwheel(stream=True, channel=0)
    stream_table2 = nallely.ModulePitchwheel(stream=True, channel=1)
    stream_table3 = nallely.ModulePitchwheel(stream=True, channel=2)
    stream_table4 = nallely.ModulePitchwheel(stream=True, channel=3)
    phase_reset = nallely.ModuleParameter(126, description="Reset the phase")
    phase_offset = nallely.ModuleParameter(
        125, description="Add an offset to the phase"
    )
    retrigger = nallely.ModuleParameter(
        124, description="Reset the phase on note strike", accepted_values=["OFF", "ON"]
    )
    freeze_all = nallely.ModuleParameter(
        123,
        description="Freeze all the current wavetables",
        accepted_values=["OFF", "ON"],
    )
    freeze_wt4 = nallely.ModuleParameter(
        122, description="Freezes wavetable 4", accepted_values=["OFF", "ON"]
    )
    freeze_wt3 = nallely.ModuleParameter(
        121, description="Freezes wavetable 3", accepted_values=["OFF", "ON"]
    )
    freeze_wt2 = nallely.ModuleParameter(
        120, description="Freezes wavetable 2", accepted_values=["OFF", "ON"]
    )
    freeze_wt1 = nallely.ModuleParameter(
        119, description="Freezes wavetable 1", accepted_values=["OFF", "ON"]
    )
    reset_all_write_idx = nallely.ModuleParameter(
        118, description="Reset all write indices", accepted_values=["OFF", "ON"]
    )
    reset_all_wt = nallely.ModuleParameter(
        117, description="Reset all wavetables", accepted_values=["OFF", "ON"]
    )
    double_buffer = nallely.ModuleParameter(
        116, description="Activates double buffering", accepted_values=["OFF", "ON"]
    )


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()


class Lisa(nallely.MidiDevice):
    general: GeneralSection  # type: ignore
    buttons: ButtonsSection  # type: ignore
    envelope: EnvelopeSection  # type: ignore
    filter: FilterSection  # type: ignore
    modulation: ModulationSection  # type: ignore
    wavetable: WavetableSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
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
    def keys(self) -> KeysSection:
        return self.modules.keys
