from dataclasses import dataclass
import time
import mido
import nallely


class DeviceSimulator:
    def __init__(self, name):
        self.port = mido.open_output(name, virtual=True)
        self.input = mido.open_input(name, virtual=True)

    def close(self):
        self.port.close()
        self.input.close()

    def cc(self, cc, value, channel=0):
        self.port.send(
            mido.Message("control_change", control=cc, value=value, channel=channel)
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
    button1 = nallely.ModuleParameter(45, channel=0)
    button2 = nallely.ModuleParameter(20, channel=0)


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
