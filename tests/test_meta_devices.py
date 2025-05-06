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
