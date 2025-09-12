import pytest

import nallely
from nallely.devices import NTS1


@pytest.fixture(scope="module")
def nts1():
    nts1 = NTS1(autoconnect=False)
    yield nts1
    nallely.stop_all_connected_devices()


def test__all_sections(nts1):
    sections = nts1.all_sections()

    assert len(sections) == 8

    assert nts1.ocs in sections
    assert nts1.delay in sections
    assert nts1.filter in sections
    assert nts1.arp in sections
    assert nts1.mod in sections
    assert nts1.reverb in sections
    assert nts1.eg in sections
    assert nts1.keys in sections


def test__all_parameters(nts1):
    parameters = nts1.all_parameters()

    assert len(parameters) == 29

    assert nts1.filter.cutoff.parameter in parameters
    assert nts1.keys.notes not in parameters


def test__pads_or_key_section(nts1):
    keys = nts1.pads_or_keys()

    assert keys is not None
    assert keys is getattr(nts1.keys.__class__, "notes")


def test__virtual_device_current_preset():
    l = nallely.LFO(waveform="sine", min_value=20, max_value=1000, speed=50)

    d = l.current_preset()
    assert len(d) == 11
    assert d["max_value"] == 1000
    assert d["min_value"] == 20
    assert d["speed"] == 50
    assert d["waveform"] == "sine"


def test__virtual_device_load_preset():
    d = {"max_value": 1000, "min_value": 20, "speed": 50, "waveform": "sine"}
    l = nallely.LFO(waveform="random", min_value=0, max_value=0, speed=0)

    l.load_preset(dct=d)

    assert l.max_value == 1000
    assert l.min_value == 20
    assert l.speed == 50
    assert l.waveform == "sine"


def test__save_midi_device_nondefault_values(nts1):
    nts1.filter.cutoff = 15
    nts1.filter.resonance = 44
    nts1.arp.length = 100

    d = nts1.to_dict()
    config = d["config"]

    assert len(config) == 2
    assert "filter" in config
    assert "arp" in config
    assert "oscs" not in config
    assert "keys" not in config

    assert len(config["filter"]) == 2
    assert "cutoff" in config["filter"]
    assert "resonance" in config["filter"]
    assert "type" not in config["filter"]

    assert len(config["arp"]) == 1
    assert "length" in config["arp"]
    assert "interval" not in config["arp"]

    assert config["filter"]["cutoff"] == 15
    assert config["filter"]["resonance"] == 44
    assert config["arp"]["length"] == 100
