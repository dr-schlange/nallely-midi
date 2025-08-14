import time
from dataclasses import dataclass

import mido

import nallely


class DeviceSimulator:
    def __init__(self, name):
        self.port = mido.open_output(name, virtual=True)  # type: ignore
        self.input = mido.open_input(name, virtual=True)  # type: ignore

    def close(self):
        self.port.close()
        self.input.close()

    def cc(self, cc, value, channel=0):
        self.port.send(
            mido.Message("control_change", control=cc, value=value, channel=channel)
        )

    def note_on(self, note, velocity=64, channel=0):
        self.port.send(
            mido.Message("note_on", note=note, velocity=velocity, channel=channel)
        )

    def note_off(self, note, velocity=64, channel=0):
        self.port.send(
            mido.Message("note_off", note=note, velocity=velocity, channel=channel)
        )


class CTX:
    def __init__(self):
        self.values = [0] * 10
        self.queue = []

    def add(self, pos, value):
        self.values[pos] = value

    def get(self, pos):
        return self.values[pos]

    def append(self, value):
        self.queue.append(value)


def let_time_to_react(t=0.01):
    time.sleep(t)


@dataclass
class SenderModule(nallely.Module):
    button1 = nallely.ModuleParameter(45)
    button2 = nallely.ModuleParameter(20)
    keys = nallely.ModulePadsOrKeys()


class MidiSender(nallely.MidiDevice):
    def __init__(self):
        super().__init__(
            device_name="sender",
            read_input_only=True,
            autoconnect=False,
            modules_descr={"main": SenderModule},
        )

    def __getattr__(self, key):
        return int(str(getattr(self.modules.main, key)))


@dataclass
class ReceiverModule(nallely.Module):
    sink1 = nallely.ModuleParameter(99, channel=0)
    sink2 = nallely.ModuleParameter(110, channel=0)
    keys_sink = nallely.ModulePadsOrKeys(channel=0)


class MidiReceiver(nallely.MidiDevice):
    def __init__(self):
        super().__init__(
            device_name="receiver",
            autoconnect=False,
            modules_descr={"main": ReceiverModule},
            debug=True,
        )

    def __getattr__(self, key):
        return int(str(getattr(self.modules.main, key)))


def new_receiver():
    inst = MidiReceiver()
    inst.connect()
    inst.listen()
    return inst


def new_sender():
    inst = MidiSender()
    inst.listen()
    return inst
