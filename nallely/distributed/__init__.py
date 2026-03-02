from functools import lru_cache

from ..core import VirtualDevice
from ..utils import generate_acronym, get_my_ip
from .remote_ws_connector import NallelyService, NallelyWebsocketBus

NAME_LIMIT = 5
NAMES = [
    generate_acronym(name, length=NAME_LIMIT)
    for name in (
        "ergotamine",
        "elymoclavine",
        "clavine",
        "Mescaline",
        "agroclavine",
        "aeruginascin",
        "psilocin",
        "ergine",
        "harmine",
        "pinoline",
        "harmaline",
        "baeocystin",
    )
]


@lru_cache()
def name_me(ip: str | None = None):
    ip = get_my_ip() if ip is None else ip
    last = int(ip.split(".")[-1])  # type: ignore we know ip cannot be None here
    mixed = (last * 7) % 256  # Add multiplier to help spread
    return NAMES[mixed % len(NAMES)]


class NeuronExposer:
    def __init__(
        self, neuron: VirtualDevice, bus: NallelyWebsocketBus, autoconnect=True
    ):
        self.bus = bus
        self.neuron = neuron
        self.service: NallelyService | None = None
        self.params = {}
        if autoconnect:
            self.start()

    def start(self):
        self._setup()

    def _setup(self):
        self.neuron.register_observer(self)
        config = {}
        for port in self.neuron.all_parameters():
            lower, upper = port.range
            config[port.name] = {"min": lower, "max": upper}
        service = self.bus.register("remote", self.uid(), config, self.params)
        service.onmessage = self.receiving  # type: ignore
        self.service = service

    def receiving(self, data):
        on = data.get("on")
        if not on:
            return
        value = data.get("value")
        self.neuron.set_parameter(on, value)

    @staticmethod
    def compute_uid(neuron):
        return f"{name_me()}:{neuron.uid()}"

    def uid(self):
        return self.compute_uid(self.neuron)

    def triggered(self, value, ctx, outputs, from_):
        service = self.service
        if not service:
            print(
                f"[EXPOSER] service for {self.uid()} is not started, dropping value {value}"
            )
            return
        for output in outputs:
            service.send(output.name, value)

    def dispose(self):
        self.neuron.unregister_observer(self)
        if self.service:
            self.service.dispose()


__all__ = ["NallelyWebsocketBus", "NallelyService", "NeuronExposer"]
