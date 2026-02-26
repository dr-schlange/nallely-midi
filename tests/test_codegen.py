import ast

from nallely.codegen.midi_module_generator import generate_code
from nallely.codegen.virtual_module_autogen import parsedoc, parsespec


def test__parse_docstring():
    docstring = """
    Simple module

    inputs:
    * in0_cv [0, 127] init=64 round <any>: first parameter
    * in1_cv [0, 1] init=0.5 <both>: second parameter
    * in2_cv [a, b, c] init=c <rising>: third parameter
    * in3_cv [-1, 1] <any, rising>: fourth parameter

    outputs:
    * out0_cv [0, 127]: first output

    type: ondemand
    category: clock
    meta: disable default output
    """
    ins, outs, post = parsedoc(docstring)

    assert post
    assert "'disable_output': True" in ast.unparse(post)

    expected_inputs = [
        # cv_name, name, range, default, policy, edges accepted_values
        ("in0_cv", "in0", (0.0, 127.0), 64.0, "round", ["any"], None),
        ("in1_cv", "in1", (0.0, 1.0), 0.5, None, ["both"], None),
        ("in2_cv", "in2", None, "c", None, ["rising"], ["a", "b", "c"]),
        ("in3_cv", "in3", (-1.0, 1.0), None, None, ["any", "rising"], None),
    ]
    for spec, exp in zip(ins, expected_inputs):
        assert spec.cv_name == exp[0]
        assert spec.name == exp[1]
        assert spec.range == exp[2]
        assert spec.default == exp[3]
        assert spec.policy == exp[4]
        assert spec.edges == exp[5]
        assert spec.accepted_values == exp[6]

    expected_outputs = [
        # cv_name, name, range
        ("out0_cv", "out0", (0.0, 127.0)),
    ]
    for spec, exp in zip(outs, expected_outputs):
        assert spec.cv_name == exp[0]
        assert spec.name == exp[1]
        assert spec.range == exp[2]


def test__parse_docstring_with_spaces():
    docstring = """
    Simple module

    inputs:
    * in0_cv [0, 127] init=64 round <any>: first parameter
    * in1_cv [0, 1] init=0.5 <both>: second parameter

    * in2_cv [a, b, c] init=c <rising>: third parameter
    * in3_cv [-1, 1] <any, rising>: fourth parameter


    outputs:
    * out0_cv [0, 127]: first output

    * out1_cv [0, 127]: first output

    type: ondemand
    category: clock
    meta: disable default output
    """
    ins, outs, post = parsedoc(docstring)

    assert post
    assert "'disable_output': True" in ast.unparse(post)

    expected_inputs = [
        # cv_name, name, range, default, policy, edges accepted_values
        ("in0_cv", "in0", (0.0, 127.0), 64.0, "round", ["any"], None),
        ("in1_cv", "in1", (0.0, 1.0), 0.5, None, ["both"], None),
        ("in2_cv", "in2", None, "c", None, ["rising"], ["a", "b", "c"]),
        ("in3_cv", "in3", (-1.0, 1.0), None, None, ["any", "rising"], None),
    ]
    for spec, exp in zip(ins, expected_inputs):
        assert spec.cv_name == exp[0]
        assert spec.name == exp[1]
        assert spec.range == exp[2]
        assert spec.default == exp[3]
        assert spec.policy == exp[4]
        assert spec.edges == exp[5]
        assert spec.accepted_values == exp[6]

    expected_outputs = [
        # cv_name, name, range
        ("out0_cv", "out0", (0.0, 127.0)),
        ("out1_cv", "out1", (0.0, 127.0)),
    ]
    for spec, exp in zip(outs, expected_outputs):
        assert spec.cv_name == exp[0]
        assert spec.name == exp[1]
        assert spec.range == exp[2]


def test__midi_device_generator_accepted_values(tmp_path):
    device = {
        "KORG": {
            "NTS1": {
                "oscillator": {
                    "alt": {
                        "cc": 55,
                        "description": "",
                        "init": 0,
                        "max": 127,
                        "min": 0,
                        "accepted_values": ["OFF", "ON", "NEW"],
                    }
                }
            }
        }
    }

    out_file = tmp_path / "mydev.py"
    generate_code(device, out_file)

    content = out_file.read_text()

    assert "accepted_values=['OFF', 'ON', 'NEW']" in content
