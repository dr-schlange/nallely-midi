import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import playsound3

from nallely import MidiDevice, Module, ModulePadsOrKeys, ModuleParameter, ThreadContext


#
# Utils functions
#
def execute_command_with_stdin(command_args: list[str], stdin_data: str):
    try:
        process = subprocess.Popen(
            command_args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=5,
        )

        stdout, stderr = process.communicate(input=stdin_data)

        if process.returncode != 0:
            print(
                f"Command failed with return code {process.returncode}", file=sys.stderr
            )
            print(f"Stderr: {stderr}", file=sys.stderr)

        return stdout, stderr

    except FileNotFoundError:
        print(
            f"Error: Command not found or executable not in PATH: {command_args[0]}",
            file=sys.stderr,
        )
        return None, None
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        return None, None


def raw_to_wav(
    raw_path,
    wav_path,
    sample_rate=44100,
    num_channels=1,
    bits_per_sample=16,
    bytes_per_sample=(16 // 2),
    debug=False,
):
    raw_data = open(raw_path, "rb").read()
    num_samples = len(raw_data) // bytes_per_sample
    data_size = num_samples * bytes_per_sample

    byte_rate = sample_rate * num_channels * bytes_per_sample
    block_align = num_channels * bytes_per_sample

    with open(wav_path, "wb") as f:
        # header
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        # format chunk
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))  # chunk size
        f.write(struct.pack("<H", 1))  # PCM format
        f.write(struct.pack("<H", num_channels))
        f.write(struct.pack("<I", sample_rate))
        f.write(struct.pack("<I", byte_rate))
        f.write(struct.pack("<H", block_align))
        f.write(struct.pack("<H", bits_per_sample))
        # data chunk
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(raw_data[:data_size])

    duration = num_samples / sample_rate
    if debug:
        print(f"Converted {raw_path} -> {wav_path}")
        print(
            f"  {num_samples} samples, {duration:.2f}s, {sample_rate} Hz, "
            f"{bits_per_sample}-bit {'mono' if num_channels == 1 else 'stereo'}"
        )


#
# Section/Parameter declaration
#


class GeneralSection(Module):
    generate = ModuleParameter("generate", accepted_values=("OFF", "ON"))
    note_off_stop = ModuleParameter("note_off_stop", accepted_values=("ON", "OFF"))
    progress = ModuleParameter("progress", range=(0, 100))
    preset = ModuleParameter("preset", range=(0, 10))
    notes = ModulePadsOrKeys()
    lower_octave = ModuleParameter("lower_octave", range=(0, 6), init_value=3)
    upper_octave = ModuleParameter("lower_octave", range=(0, 6), init_value=6)


class FilterSection(Module):
    mode = ModuleParameter(
        "mode", accepted_values=("Digital", "Analog"), init_value=127
    )
    type = ModuleParameter("type", accepted_values=("LPF", "HPF", "BPF"), init_value=0)
    cutoff = ModuleParameter("cutoff", range=(0, 100), init_value=50)
    resonance = ModuleParameter("resonance", range=(0, 100))
    analog_bias = ModuleParameter("analog_bias", range=(0, 100), init_value=5)
    analog_drive = ModuleParameter("analog_drive", range=(1, 10), init_value=5)
    analog_drift = ModuleParameter("analog_drift", range=(0, 100), init_value=0)
    analog_crush = ModuleParameter("analog_crush", range=(1, 2000), init_value=1000)


class AmpEnvelopeSection(Module):
    t1 = ModuleParameter("t1", range=(0.05, 10), init_value=0.1)  # type: ignore
    l1 = ModuleParameter("l1", range=(0, 100), init_value=50)
    t2 = ModuleParameter("t2", range=(0.05, 10), init_value=0.2)  # type: ignore
    l2 = ModuleParameter("l2", range=(0, 100), init_value=30)
    t3 = ModuleParameter("t3", range=(0.05, 10), init_value=0.2)  # type: ignore
    l3 = ModuleParameter("l3", range=(0, 100), init_value=80)
    sustain = ModuleParameter("sustain", range=(0.05, 10), init_value=1)  # type: ignore
    t4 = ModuleParameter("t4", range=(0.05, 10), init_value=0.5)  # type: ignore


class FilterEnvelopeSection(Module):
    t1 = ModuleParameter("t1", range=(0.05, 10), init_value=0.1)  # type: ignore
    l1 = ModuleParameter("l1", range=(-50, 50), init_value=-20)
    t2 = ModuleParameter("t2", range=(0.05, 10), init_value=0.2)  # type: ignore
    l2 = ModuleParameter("l2", range=(-50, 50), init_value=20)
    t3 = ModuleParameter("t3", range=(0.05, 10), init_value=0.1)  # type: ignore
    l3 = ModuleParameter("l3", range=(-50, 50), init_value=25)
    sustain = ModuleParameter("sustain", range=(0.05, 10), init_value=1)  # type: ignore
    t4 = ModuleParameter("t4", range=(0.05, 10), init_value=1)  # type: ignore
    depth = ModuleParameter("depth", range=(-100, 100), init_value=80)


class COMOL(MidiDevice):
    general: GeneralSection  # type: ignore
    filter: FilterSection  # type: ignore
    amp_env: AmpEnvelopeSection  # type: ignore
    filter_env: FilterEnvelopeSection  # type: ignore

    def __init__(self, comol_exec: str | Path | None = None, *args, **kwargs):
        kwargs["autoconnect"] = False
        kwargs["device_name"] = "COMOL1-"
        super().__init__(*args, **kwargs)
        self.comol_exec = (
            Path(comol_exec) if comol_exec else Path(".") / "comol" / "comol1-gnu"
        )
        if not self.comol_exec.exists():
            print(
                f"[{self.__class__.__name__}] Cannot find executable at {self.comol_exec.resolve().absolute()}"
            )
        self._generating = False
        self.presets_folder = self.comol_exec.parent
        self._tmp_output_raw = Path(tempfile.gettempdir())
        self._allocated = {}

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def filter(self) -> FilterSection:
        return self.modules.filter

    @property
    def amp_env(self) -> AmpEnvelopeSection:
        return self.modules.amp_env

    @property
    def filter_env(self) -> FilterEnvelopeSection:
        return self.modules.filter_env

    #
    # Dedicated methods for dedicated behavior from here
    #
    def _build_sequence(self, user_octave, user_note):
        # analog flow:
        # source -> octave -> note -> pattern -> mode -> bias -> drive -> drift -> crush -> filter type -> cutoff -> resonance -> Amp t1 -> l1 -> t2 -> l2 -> t3 -> l3 -> sustain -> t4 -> VCF t1 -> l1 -> t2 -> l2 -> t3 -> l3 -> sustain -> t4 -> depth
        #
        # digital flow:
        # source -> octave -> note -> pattern -> mode -> filter type -> cutoff -> resonance -> Amp t1 -> l1 -> t2 -> l2 -> t3 -> l3 -> sustain -> t4 -> VCF t1 -> l1 -> t2 -> l2 -> t3 -> l3 -> sustain -> t4 -> depth

        sequence = [
            1,  # wave source
            user_octave,
            user_note,
            1,  # interpolation 1=None, 2=Linear, 3=Sinc (e.g: 3331, 1212)
            int(self.filter.mode) + 1,  # type: ignore
        ]
        if self.filter.mode == "analog":
            sequence.extend(
                [
                    self.filter.analog_bias,
                    self.filter.analog_drive,
                    self.filter.analog_drift,
                    self.filter.analog_crush,
                ]
            )
        sequence.extend(
            [
                self.filter.type,
                self.filter.cutoff,
                self.filter.resonance,
                self.amp_env.t1,
                self.amp_env.l1,
                self.amp_env.t2,
                self.amp_env.l2,
                self.amp_env.t3,
                self.amp_env.l3,
                self.amp_env.sustain,
                self.amp_env.t4,
                self.filter_env.t1,
                self.filter_env.l1,
                self.filter_env.t2,
                self.filter_env.l2,
                self.filter_env.t3,
                self.filter_env.l3,
                self.filter_env.sustain,
                self.filter_env.t4,
                self.filter_env.depth,
            ]
        )
        return sequence

    def note_on(self, note, velocity=127 // 2, channel=None):
        note = int(note)
        sound_file = self.pick_notefile(note)
        if not sound_file.exists():
            print(f"[COMOL] WAV file for {note} doesn't exist in {sound_file}")
            return
        if note in self._allocated:
            sound = self._allocated[note]
            if sound.is_alive():
                return
            del self._allocated[note]
        self._allocated[note] = playsound3.playsound(
            sound=sound_file, block=False, backend="alsa"
        )

    def note_off(self, note, velocity=127 // 2, channel=None):
        if str(self.general.note_off_stop) == "OFF":
            return
        note = int(note)
        if note not in self._allocated:
            return
        sound = self._allocated[note]
        sound.stop()
        del self._allocated[note]

    def control_change(self, control, value=0, channel=None):
        preset_folder = self.current_preset_folder

        if control == "generate" and value > 0:
            if self._generating:
                print(f"[COMOL] Already generating wavetable in {preset_folder}")
                return
            self._generate(preset_folder)

        elif self._generating:
            print(f"[COMOL] Processing, discarding progress={self.general.progress}%")
            return

    @property
    def current_preset_folder(self):
        return self.presets_folder / f"preset{self.general.preset}"

    def pick_notefile(self, midi_note_number):
        return self.current_preset_folder / f"{midi_note_number}.wav"

    def _generate(self, preset_folder):
        self._generating = True
        notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        lower_octave, upper_octave = (
            (
                self.general.lower_octave,
                self.general.upper_octave + 1,  # type: ignore
            )
            if self.general.lower_octave < self.general.upper_octave  # type: ignore
            else (
                self.general.upper_octave,
                self.general.lower_octave + 1,  # type: ignore
            )
        )
        nb_octaves = upper_octave - lower_octave  # type: ignore
        print(
            f"[COMOL] {'Generating' if preset_folder.exists() else 'Creating'} in {preset_folder} for {nb_octaves} octaves [{lower_octave}..{upper_octave}]"
        )
        preset_folder.mkdir(exist_ok=True, parents=True)
        total_notes = nb_octaves * len(notes)
        current_note = 0
        self.send_cc("progress", 0)
        for octave in range(lower_octave, upper_octave):  # type: ignore
            for note, note_name in enumerate(notes):
                print(
                    f"[COMOL] Generating {note_name}{octave} ({current_note}/{total_notes}) [{(current_note / total_notes) * 100:.2f}%]"
                )
                sequence = "\n".join(str(s) for s in self._build_sequence(octave, note))
                execute_command_with_stdin(
                    [f"{self.comol_exec.resolve().absolute()}", "/tmp/"], sequence
                )
                midi_note_number = octave * len(notes) + note
                raw_file_path = self._tmp_output_raw / f"{midi_note_number}.raw"
                wav_path = preset_folder / f"{midi_note_number}.wav"
                print(f"[COMOL] Converting raw to wav as {wav_path}")
                raw_to_wav(
                    raw_path=raw_file_path,
                    wav_path=wav_path,
                    debug=False,
                )
                current_note += 1
                self.send_cc("progress", (current_note / total_notes) * 100)

        self._generating = False
        print(f"[COMOL] Generation finished in {preset_folder}")

    def send_cc(self, cc, value, channel=None):
        for link in self.links.get(("control_change", cc, channel), []):
            ctx = ThreadContext(
                {
                    "debug": self.debug,
                    "type": "control_change",
                    "velocity": 127,
                }
            )
            link.trigger(value if value is not None else 0, ctx)
