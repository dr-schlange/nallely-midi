from pathlib import Path

from pynput import keyboard
from pynput.keyboard import Controller, Key, KeyCode

from .midi_device import (
    MidiDevice,
    Module,
    ModulePadsOrKeys,
    ModuleParameter,
)
from .world import ThreadContext


class GeneralSection(Module):
    notes = ModulePadsOrKeys()
    # pitchwheel = ModulePitchwheel()
    enter = ModuleParameter(Key.enter.name)
    space = ModuleParameter(Key.space.name)
    backspace = ModuleParameter(Key.backspace.name)
    shifts = ModuleParameter(Key.shift.name)
    left_shift = ModuleParameter(Key.shift_l.name)
    right_shift = ModuleParameter(Key.shift_r.name)
    ctrls = ModuleParameter(Key.ctrl.name)
    left_ctrl = ModuleParameter(Key.ctrl_l.name)
    right_ctrl = ModuleParameter(Key.ctrl_r.name)
    alts = ModuleParameter(Key.alt.name)
    left_alt = ModuleParameter(Key.alt_l.name)
    right_alt = ModuleParameter(Key.alt_r.name)
    alt_gr = ModuleParameter(Key.alt_gr.name)
    metas = ModuleParameter(Key.cmd.name)
    meta_left = ModuleParameter(Key.cmd_l.name)
    meta_right = ModuleParameter(Key.cmd_r.name)
    tab = ModuleParameter(Key.tab.name)
    capslock = ModuleParameter(Key.caps_lock.name)
    left = ModuleParameter(Key.left.name)
    right = ModuleParameter(Key.right.name)
    up = ModuleParameter(Key.up.name)
    down = ModuleParameter(Key.down.name)


class LowCapSection(Module):
    notes = ModulePadsOrKeys()
    # pitchwheel = ModulePitchwheel()
    a = ModuleParameter("a")
    b = ModuleParameter("b")
    c = ModuleParameter("c")
    d = ModuleParameter("d")
    e = ModuleParameter("e")
    f = ModuleParameter("f")
    g = ModuleParameter("g")
    h = ModuleParameter("h")
    i = ModuleParameter("i")
    j = ModuleParameter("j")
    k = ModuleParameter("k")
    l = ModuleParameter("l")
    m = ModuleParameter("m")
    n = ModuleParameter("n")
    o = ModuleParameter("o")
    p = ModuleParameter("p")
    q = ModuleParameter("q")
    r = ModuleParameter("r")
    s = ModuleParameter("s")
    t = ModuleParameter("t")
    u = ModuleParameter("u")
    v = ModuleParameter("v")
    x = ModuleParameter("x")
    y = ModuleParameter("y")
    z = ModuleParameter("z")


class UpperCapSection(Module):
    notes = ModulePadsOrKeys()
    # pitchwheel = ModulePitchwheel()
    A = ModuleParameter("A")
    B = ModuleParameter("B")
    C = ModuleParameter("C")
    D = ModuleParameter("D")
    E = ModuleParameter("E")
    F = ModuleParameter("F")
    G = ModuleParameter("G")
    H = ModuleParameter("H")
    I = ModuleParameter("I")
    J = ModuleParameter("J")
    K = ModuleParameter("K")
    L = ModuleParameter("L")
    M = ModuleParameter("M")
    N = ModuleParameter("N")
    O = ModuleParameter("O")
    P = ModuleParameter("P")
    Q = ModuleParameter("Q")
    R = ModuleParameter("R")
    S = ModuleParameter("S")
    T = ModuleParameter("T")
    U = ModuleParameter("U")
    V = ModuleParameter("V")
    W = ModuleParameter("W")
    X = ModuleParameter("X")
    Y = ModuleParameter("Y")
    Z = ModuleParameter("Z")


class SymbolsSection(Module):
    notes = ModulePadsOrKeys()
    sym_and = ModuleParameter("&", name="&")
    sym_pipe = ModuleParameter("|", name="|")
    sym_qm = ModuleParameter("?", name="?")
    sym_excl = ModuleParameter("!", name="!")
    sym_lpar = ModuleParameter("(", name="(")
    sym_rpar = ModuleParameter(")", name=")")
    sym_lsb = ModuleParameter("[", name="[")
    sym_rsb = ModuleParameter("]", name="]")
    sym_lcb = ModuleParameter("{", name="{")
    sym_rcb = ModuleParameter("}", name="}")


class NumpadSection(Module):
    notes = ModulePadsOrKeys()
    # pitchwheel = ModulePitchwheel()
    num_0 = ModuleParameter("0")
    num_1 = ModuleParameter("1")
    num_2 = ModuleParameter("2")
    num_3 = ModuleParameter("3")
    num_4 = ModuleParameter("4")
    num_5 = ModuleParameter("5")
    num_6 = ModuleParameter("6")
    num_7 = ModuleParameter("7")
    num_8 = ModuleParameter("8")
    num_9 = ModuleParameter("9")
    num_eq = ModuleParameter("=", name="=")
    num_div = ModuleParameter("/", name="/")
    num_mul = ModuleParameter("*", name="*")
    num_plus = ModuleParameter("+", name="+")
    num_minus = ModuleParameter("-", name="-")


class Keyboard(MidiDevice):
    general: GeneralSection  # type: ignore
    lowercap: LowCapSection  # type: ignore
    uppercap: UpperCapSection  # type: ignore
    symbols: SymbolsSection  # type: ignore
    numpad: NumpadSection  # type: ignore

    def __init__(self, log_in_file: bool | Path | None = None, *args, **kwargs):
        kwargs["autoconnect"] = False
        super().__init__(
            *args,
            device_name="GenericKeyboard",
            **kwargs,
        )
        if isinstance(log_in_file, bool):
            self.log_file = Path("/tmp/nallely-key.log") if log_in_file else None
        elif isinstance(log_in_file, (Path, str)):
            self.log_file = Path(log_in_file)
        else:
            self.log_file = None
        self.listener = None
        self.connect()
        # self.listen(suppress=self.log_file is not None)
        self.listen()

    @property
    def general(self) -> GeneralSection:
        return self.modules.general

    @property
    def lowercap(self) -> LowCapSection:
        return self.modules.lowercap

    @property
    def uppercap(self) -> UpperCapSection:
        return self.modules.uppercap

    @property
    def symbols(self) -> SymbolsSection:
        return self.modules.symbols

    @property
    def numpad(self) -> NumpadSection:
        return self.modules.numpad

    def connect(self):
        self.keyboard = Controller()

    def listen(self, start=True, suppress=False):
        if not start:
            self.listening = False
            self.listener = None
            return
        if not self.listening:
            self.listener = keyboard.Listener(
                on_press=self.on_key_press,
                on_release=self.on_key_release,
                suppress=suppress,
            )
            self.listener.start()

    def close_in(self):
        if self.listening and self.listener:
            self.listener.stop()

    def _scan_links(self, value: int | None, keychar: str, keyval: int, channel):
        for link in self.links.get(("note", -1, channel), []):
            ctx = ThreadContext(
                {
                    "debug": self.debug,
                    "type": "note_on" if value else "note_off",
                    "velocity": 127,
                }
            )
            link.trigger(
                keyval, ctx
            )  # We send keyval all the time (for later multi keypress)
        for link in self.links.get(("note", keychar, channel), []):
            ctx = ThreadContext(
                {
                    "debug": self.debug,
                    "type": "note_on" if value else "note_off",
                    "velocity": 127,
                }
            )
            # link.trigger(keyval if value else 0, ctx)
            link.trigger(
                keyval, ctx
            )  # We send keyval all the time (for later multi keypress)
        for link in self.links.get(("control_change", keychar, channel), []):
            ctx = ThreadContext(
                {
                    "debug": self.debug,
                    "type": "control_change",
                    "velocity": 127,
                }
            )
            link.trigger(keyval if value else 0, ctx)

    def on_key_press(self, key: Key | KeyCode | None):
        # This method is called when a key is pressed by the user
        # This is the value that will be sent!
        if key is None:
            return
        channel = None
        if isinstance(key, Key):
            keychar = key.name
            keyval = key.value.vk
        else:
            keychar = key.char
            keyval = key.vk
        if keychar is None or keyval is None:
            return
        self._scan_links(127, keychar, keyval, channel)

    def on_key_release(self, key):
        # This method is called when a key is released by the user
        # This is the value that will be sent!
        if key is None:
            return
        channel = None
        if isinstance(key, Key):
            keychar = key.name
            keyval = key.value.vk
        else:
            keychar = key.char
            keyval = key.vk
        if keychar is None or keyval is None:
            return
        self._scan_links(None, keychar, keyval, channel)

    def note_on(self, note, velocity=127 // 2, channel=None):
        print(
            "NOTE ON (press) FOR KEYBOARD, THINK HOW TO CLEANLY MAP VALUE TO KEY",
            note,
            velocity,
            channel,
        )

    def note_off(self, note, velocity=127 // 2, channel=None):
        print(
            "NOTE OFF (release) FOR KEYBOARD, THINK HOW TO CLEANLY MAP VALUE TO KEY",
            note,
            velocity,
            channel,
        )

    def control_change(self, control, value=0, channel=None):
        if value > 0:
            self.keyboard.press(control)
        else:
            self.keyboard.release(control)
