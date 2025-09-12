import collections
import importlib
import importlib.util
import json
import sys
import threading
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path


def longest_common_substring(s1: str, s2: str) -> str:
    if not s1 or not s2:
        return ""

    if len(s1) > len(s2):
        s1, s2 = s2, s1
    len_s1, len_s2 = len(s1), len(s2)

    curr_row = [0] * (len_s1 + 1)
    prev_row = [0] * (len_s1 + 1)

    max_length = 0
    end_index = 0

    for j in range(1, len_s2 + 1):
        for i in range(1, len_s1 + 1):
            if s1[i - 1] == s2[j - 1]:
                curr_row[i] = prev_row[i - 1] + 1
                if curr_row[i] > max_length:
                    max_length = curr_row[i]
                    end_index = i
            else:
                curr_row[i] = 0
        curr_row, prev_row = prev_row, curr_row

    return s1[end_index - max_length : end_index]


def find_class(name):
    for module in list(sys.modules.values()):
        if module:
            cls = getattr(module, name, None)
            if isinstance(cls, type):
                return cls
    raise ValueError(f"Class {name} couldn't be found")


def load_modules(loaded_paths):
    def import_module_from_file(name: str, path: Path):
        spec = importlib.util.spec_from_file_location(name, path)
        if not spec:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module

    for p in loaded_paths:
        if p.is_file() and p.suffix == ".py":
            import_module_from_file(p.stem, p)


class StateEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(str(o))
        from .core import ParameterInstance

        if isinstance(o, ParameterInstance):
            return asdict(o.parameter)
        return super().default(o)


NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]


def get_note_name(midi_note):
    note = NOTE_NAMES[midi_note % 12]
    octave = midi_note // 12
    return f"{note}{octave}"


class ThreadSafeDefaultDict(collections.defaultdict):
    def __init__(self, default_factory=None, *args, **kwargs):
        super().__init__(default_factory, *args, **kwargs)
        self._lock = threading.RLock()

    def __getitem__(self, key):
        with self._lock:
            if key not in self:
                if self.default_factory is None:
                    raise KeyError(key)
                self[key] = self.default_factory()
            return super().__getitem__(key)

    def __setitem__(self, key, value):
        with self._lock:
            super().__setitem__(key, value)

    def __delitem__(self, key):
        with self._lock:
            super().__delitem__(key)

    def get(self, key, default=None):
        with self._lock:
            return super().get(key, default)

    def items(self):  # type: ignore
        with self._lock:
            return list(super().items())

    def keys(self):  # type: ignore
        with self._lock:
            return list(super().keys())

    def values(self):  # type: ignore
        with self._lock:
            return list(super().values())

    def __contains__(self, key):
        with self._lock:
            return super().__contains__(key)


def force_off_everywhere(times=2, verbose=False):
    import mido

    for port in mido.get_output_names():
        outport = mido.open_output(port, autoreset=True)
        if verbose:
            print(f" - port {port}, forcing note off on all channels...", end="")
        for channel in range(16):
            for _ in range(times + 1):
                for note in range(0, 128):
                    outport.send(
                        mido.Message("note_off", channel=channel, note=note, velocity=0)
                    )
        if verbose:
            print("[OK]")


# See if the micro-optimization trick actually is usefull or if it's useless
def map2values_cv_property(dev, param, getattr=getattr, setattr=setattr):
    attr_name = f"_{param.name}"
    setattr(dev, attr_name, getattr(dev, param.name, None))

    def getter(self):
        return getattr(self, attr_name)

    def setter(self, value):
        if isinstance(value, (int, float, Decimal)):
            value = param.map2accepted_values(value)
        setattr(self, attr_name, value)

    setattr(dev.__class__, param.name, property(getter, setter))


def round_cv_property(dev, param, getattr=getattr, setattr=setattr):
    attr_name = f"_{param.name}"
    setattr(dev, attr_name, getattr(dev, param.name, None))

    def getter(self):
        return getattr(self, attr_name)

    def setter(self, value):
        value = round(value)
        setattr(self, attr_name, value)

    setattr(dev.__class__, param.name, property(getter, setter))


def sup0_cv_property(dev, param, getattr=getattr, setattr=setattr):
    attr_name = f"_{param.name}"
    lower, upper = param.range
    if lower is None:
        lower = 0
    if upper is None:
        upper = 1

    def getter(self):
        return getattr(self, attr_name)

    def setter(self, value):
        value = upper if value > lower else lower
        setattr(self, attr_name, value)

    setattr(dev.__class__, param.name, property(getter, setter))


def diff0_cv_property(dev, param, getattr=getattr, setattr=setattr):
    attr_name = f"_{param.name}"
    lower, upper = param.range
    if lower is None:
        lower = 0
    if upper is None:
        upper = 1

    def getter(self):
        return getattr(self, attr_name)

    def setter(self, value):
        value = upper if value != lower else lower
        setattr(self, attr_name, value)

    setattr(dev.__class__, param.name, property(getter, setter))
