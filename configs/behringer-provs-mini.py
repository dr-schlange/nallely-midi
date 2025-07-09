"""
Generated configuration for the Behringer - PROVS-MINI
"""
import nallely

class OscillatorSection(nallely.Module):
    voice_A_wave = nallely.ModuleParameter(24)
    voice_A_coarse_tuning = nallely.ModuleParameter(115, range=(0, 99))
    voice_A_fine_tuning = nallely.ModuleParameter(111, range=(0, 99))
    voice_B_wave = nallely.ModuleParameter(25)
    voice_B_coarse_tuning = nallely.ModuleParameter(116, range=(0, 99))
    voice_B_fine_tuning = nallely.ModuleParameter(112, range=(0, 99))
    voice_C_wave = nallely.ModuleParameter(26)
    voice_C_coarse_tuning = nallely.ModuleParameter(117, range=(0, 99))
    voice_C_fine_tuning = nallely.ModuleParameter(113, range=(0, 99))
    voice_D_wave = nallely.ModuleParameter(27)
    voice_D_coarse_tuning = nallely.ModuleParameter(118, range=(0, 99))
    voice_D_fine_tuning = nallely.ModuleParameter(114, range=(0, 99))


class LfoSection(nallely.Module):
    lfo1_shape = nallely.ModuleParameter(54, range=(0, 99))
    lfo1_rate = nallely.ModuleParameter(72, range=(0, 99))
    lfo1_amount = nallely.ModuleParameter(70, range=(0, 99))
    lfo2_shape = nallely.ModuleParameter(55, range=(0, 99))
    lfo2_rate = nallely.ModuleParameter(73, range=(0, 99))
    lfo2_amount = nallely.ModuleParameter(28, range=(0, 99))


class FilSection(nallely.Module):
    amount = nallely.ModuleParameter(47, range=(0, 99))
    attack = nallely.ModuleParameter(85, range=(0, 99))
    decay = nallely.ModuleParameter(86, range=(0, 99))
    sustain = nallely.ModuleParameter(87, range=(0, 99))
    release = nallely.ModuleParameter(88, range=(0, 99))


class VcaSection(nallely.Module):
    attack = nallely.ModuleParameter(81, range=(0, 99))
    decay = nallely.ModuleParameter(82, range=(0, 99))
    sustain = nallely.ModuleParameter(83, range=(0, 99))
    release = nallely.ModuleParameter(84, range=(0, 99))


class VcfSection(nallely.Module):
    cutoff = nallely.ModuleParameter(74, range=(0, 99))
    resonance = nallely.ModuleParameter(71, range=(0, 99))


class EffectSection(nallely.Module):
    type = nallely.ModuleParameter(9)
    rate = nallely.ModuleParameter(92, range=(0, 99))
    depth = nallely.ModuleParameter(91, range=(0, 99))


class KeysSection(nallely.Module):
    notes = nallely.ModulePadsOrKeys()
    pitchwheel = nallely.ModulePitchwheel()
    modulation = nallely.ModuleParameter(1)
    portamento = nallely.ModuleParameter(5)


class Provsmini(nallely.MidiDevice):
    oscillator: OscillatorSection  # type: ignore
    lfo: LfoSection  # type: ignore
    fil: FilSection  # type: ignore
    vca: VcaSection  # type: ignore
    vcf: VcfSection  # type: ignore
    effect: EffectSection  # type: ignore
    keys: KeysSection  # type: ignore

    def __init__(self, device_name=None, *args, **kwargs):
        super().__init__(
            *args
,            device_name=device_name or 'PROVS-MINI',
            **kwargs,
        )

    @property
    def oscillator(self) -> OscillatorSection:
        return self.modules.oscillator

    @property
    def lfo(self) -> LfoSection:
        return self.modules.lfo

    @property
    def fil(self) -> FilSection:
        return self.modules.fil

    @property
    def vca(self) -> VcaSection:
        return self.modules.vca

    @property
    def vcf(self) -> VcfSection:
        return self.modules.vcf

    @property
    def effect(self) -> EffectSection:
        return self.modules.effect

    @property
    def keys(self) -> KeysSection:
        return self.modules.keys

