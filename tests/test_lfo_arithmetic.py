from nallely import LFO


def test__lfo_add():
    l1 = LFO()
    l2 = LFO()

    l3 = l1 + l2

    assert l3
    assert l3.speed == max(l1.speed, l2.speed)


def test__lfo_mult():
    l1 = LFO()
    l2 = LFO()

    l3 = l1 * l2

    assert l3
    assert l3.speed == max(l1.speed, l2.speed)
