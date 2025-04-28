from typing import Any
import nallely
import numpy as np
import sounddevice as sd
from scipy.signal import find_peaks
from scipy.fftpack import fft
import math

from nallely.core import ThreadContext


class Audio2Midi(nallely.VirtualDevice):
    """
    Experimental virtual device that listens on an audio port and performs pitch tracking and amplitude tracking.
    """

    @property
    def min_range(self):
        return 0  # The lowest note you can reach, usefull to scale later

    @property
    def max_range(self):
        return 88  # The max note you can reach, usefull to scale later properly

    def __init__(
        self,
        samplerate: int = 48000,
        blocksize: int = 2048,
        smoothing: float = 0.2,
        note_stability_threshold: int = 3,
        amplitude_threshold: float = 0.020,
        device_number: int = 9,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.samplerate = samplerate
        self.blocksize = blocksize
        self.smoothing = smoothing
        self.note_stability_threshold = note_stability_threshold
        self.amplitude_threshold = amplitude_threshold
        self.device_number = device_number
        self.stream = sd.InputStream(
            callback=self.audio_callback,
            channels=1,
            samplerate=self.samplerate,
            blocksize=self.blocksize,
            device=self.device_number,
        )
        self.identified_note = None
        self.identified_amplitude = None
        self.last_midi = None
        self.same_note_counter = 0
        self.smoothed_midi = 0

    @staticmethod
    def get_fundamental_frequency(data, samplerate):
        windowed = data * np.hanning(len(data))
        fft_spectrum = np.abs(fft(windowed))[: len(data) // 2]
        freqs = np.fft.fftfreq(len(data), 1 / samplerate)[: len(data) // 2]
        peaks, _ = find_peaks(fft_spectrum, height=np.max(fft_spectrum) * 0.3)
        if len(peaks) == 0:
            return None
        return freqs[peaks[0]]

    @staticmethod
    def freq_to_midi(freq):
        if freq <= 0:
            return None
        return int(round(69 + 12 * math.log2(freq / 440.0)))

    @staticmethod
    def midi_to_note_name(midi):
        notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        return notes[midi % 12] + str(midi // 12 - 1)

    def audio_callback(self, indata, frames, time, status):
        mono_data = indata[:, 0]
        amplitude = np.sqrt(np.mean(mono_data**2))

        if amplitude < self.amplitude_threshold:
            # print("Too weak (amplitude):", round(amplitude, 4))
            self.same_note_counter = 0
            self.last_midi = None
            self.identified_note = 0
            self.identified_amplitude = 0
            return

        freq = self.get_fundamental_frequency(mono_data, self.samplerate)
        if freq:
            midi = self.freq_to_midi(freq)

            if midi is not None:
                if midi == self.last_midi:
                    self.same_note_counter += 1
                else:
                    self.same_note_counter = 1
                    self.last_midi = midi

                self.smoothed_midi = (
                    1 - self.smoothing
                ) * self.smoothed_midi + self.smoothing * midi

                cc_val = int(np.clip(self.smoothed_midi, 0, 127))
                # print(f"Amplitude: {round(amplitude, 4)}", end='  ')

                if self.same_note_counter >= self.note_stability_threshold:
                    print(
                        f"Amplitude: {round(amplitude, 4)} 🎵 Note stable: {self.midi_to_note_name(midi)} ({midi}), CC: {cc_val}"
                    )
                    self.identified_note = midi
                    self.identified_amplitude = amplitude
                else:
                    # print("Note stabilization")
                    ...
            else:
                print("Note note found")
                # self.last_midi = None
                # self.same_note_counter = 0
                # self.identified_note = None
        else:
            print("Fondamental frequency not found")

    def setup(self) -> ThreadContext:
        print("Open stream")
        self.stream.start()
        return super().setup()

    def main(self, ctx: ThreadContext) -> Any:
        sd.sleep(100)
        # return float(self.identified_amplitude) if self.identified_amplitude else None
        return self.identified_note

    def close(self):
        self.stream.close()
