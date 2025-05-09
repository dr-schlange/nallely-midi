from nallely.lfos import LFO


def test__scaler_lin_x_y_target():
    lfo = LFO()

    scaler = lfo.scale(0, 50, as_int=True)

    assert scaler.convert_lin(0, None, None) == 0
    assert scaler.convert_lin(0, 0, None) == 0

    assert scaler.convert_lin(0, None, 0) == 50

    assert scaler.convert_lin(50, None, None) == 50
    assert scaler.convert_lin(50, 0, None) == 50
    assert scaler.convert_lin(-50, None, 0) == 50
    assert scaler.convert_lin(50, None, 5) == 50

    assert scaler.convert_lin(25, None, None) == 25
    assert scaler.convert_lin(25, 0, None) == 25
    assert scaler.convert_lin(-25, None, 0) == 25


def test__scaler_lin_None_y_target():
    lfo = LFO()

    scaler = lfo.scale(None, 50, as_int=True)

    assert scaler.convert_lin(0, None, None) == 0
    assert scaler.convert_lin(0, 0, None) == 0
    assert scaler.convert_lin(0, 5, None) == 10
    assert scaler.convert_lin(0, None, 0) == 50

    assert scaler.convert_lin(50, None, None) == 50
    assert scaler.convert_lin(50, 0, None) == 50
    assert scaler.convert_lin(50, None, 0) == 50
    assert scaler.convert_lin(50, None, 5) == 50

    assert scaler.convert_lin(25, None, None) == 25
    assert scaler.convert_lin(25, 0, None) == 25
    assert scaler.convert_lin(25, None, 0) == 50


def test__scaler_lin_x_None_target():
    lfo = LFO()

    scaler = lfo.scale(0, None, as_int=True)

    assert scaler.convert_lin(0, None, None) == 0
    assert scaler.convert_lin(0, 0, None) == 0
    assert scaler.convert_lin(0, 5, None) == 0
    assert scaler.convert_lin(0, None, 0) == 0
    assert scaler.convert_lin(5, None, 0) == 0

    assert scaler.convert_lin(50, None, None) == 50
    assert scaler.convert_lin(50, 0, None) == 50
    assert scaler.convert_lin(50, None, 0) == 0
    assert scaler.convert_lin(50, None, 5) == 5

    assert scaler.convert_lin(25, None, None) == 25
    assert scaler.convert_lin(25, 0, None) == 25
    assert scaler.convert_lin(25, None, 0) == 0


def test__scaler_lin_x_None_None():
    lfo = LFO()

    scaler = lfo.scale(None, None, as_int=True)

    assert scaler.convert_lin(0, None, None) == 0
    assert scaler.convert_lin(0, 0, None) == 0
    assert scaler.convert_lin(5, 5, None) == 5
    assert scaler.convert_lin(0, None, 0) == 0
    assert scaler.convert_lin(-4, None, 0) == -4

    assert scaler.convert_lin(50, None, None) == 50
    assert scaler.convert_lin(50, 0, None) == 50
    assert scaler.convert_lin(50, None, 0) == 0
    assert scaler.convert_lin(50, None, 5) == 5

    assert scaler.convert_lin(25, None, None) == 25
    assert scaler.convert_lin(25, 0, None) == 25
    assert scaler.convert_lin(25, None, 0) == 0
