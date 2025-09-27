import re
from nallely import VirtualDevice, VirtualParameter, on
import ast
import inspect
from pathlib import Path
from typing import cast
import black


def modifyme(cls):
    code = inspect.getsource(cls)
    module = ast.parse(code)
    cls_node: ast.ClassDef = cast(ast.ClassDef, module.body[0])
    cls_node.bases = [ast.Name("VirtualDevice")]
    inputs, rest = parsedoc(cls)
    methods = []
    for input, edges in inputs[::-1]:
        cls_node.body.insert(1, input.body[0])
        var_name = input.body[0].targets[0].id
        for edge in edges:
            methods.append(
                f"\n@on({var_name}, edge={edge!r})\ndef on_{var_name}_{edge}(self, value, ctx):\n    ...\n                       "
            )
            cls_node.body.append(ast.parse(methods[-1], mode="exec").body[0])
    frame = inspect.currentframe()
    if frame is None:
        return cls
    cls_file = Path(frame.f_back.f_code.co_filename)
    file_code = ast.parse(cls_file.read_text("utf-8"))
    has_imports = False
    for i, node in enumerate(file_code.body):
        match node:
            case ast.ClassDef(name=cls.__name__):
                file_code.body[i] = cls_node
            case ast.ImportFrom(module="nallely"):
                has_imports = True
    if not has_imports:
        file_code.body.insert(
            0,
            ast.ImportFrom(
                module="nallely",
                names=[
                    ast.alias("VirtualDevice"),
                    ast.alias("VirtualParameter"),
                    ast.alias("on"),
                ],
                level=0,
            ),
        )
    ast.fix_missing_locations(file_code)
    module_content = black.format_str(ast.unparse(file_code), mode=black.Mode())
    cls_file.write_text(module_content, encoding="utf-8")
    return cls


def parsedoc(cls):
    doc = cls.__doc__
    doc_iter = iter(doc.split("\n"))
    inputs = []
    outputs = []
    while (line := next(doc_iter, None)) is not None:
        line = line.strip()
        print(f"line={line}")
        if line.startswith("inputs:"):
            while cat := next(doc_iter, None):
                cat = cat.strip()
                if not cat.startswith("* "):
                    break
                code = cat.rsplit(":", 1)
                inputs.append(code)
            line = cat
        if line.startswith("outputs:"):
            while cat := next(doc_iter, None):
                cat = cat.strip()
                if cat.startswith("* "):
                    code = cat.rsplit(":", 1)
                    outputs.append(code)
    re_cv_name = "(?P<cv_name>\\w+)"
    re_cv_range = "(?P<cv_range>[^]]+)"
    re_cv_policy = "\\s+(?P<policy>\\w+)"
    re_cv_edge = f"\\s+<(?P<edges>[^>]+)>"
    re_input = re.compile(
        f"\\*\\s+{re_cv_name}\\s+\\[{re_cv_range}\\]({re_cv_policy})?({re_cv_edge})?"
    )
    nodes = []
    for spec, descr in inputs:
        m = re_input.match(spec)
        if not m:
            continue
        cv_name = m.group("cv_name")
        lower, upper, *rest = m.group("cv_range").split(",")
        name = cv_name.replace("_cv", "")
        if len(rest) > 0:
            accepted_values = [
                s.replace("'", "").replace('"', "") for s in (lower, upper, *rest)
            ]
            nodes.append(
                (
                    ast.parse(
                        f"{cv_name} = VirtualParameter(name={name!r}, accepted_values={accepted_values!r})",
                        mode="single",
                    ),
                    ["any"],
                )
            )
        else:
            try:
                policy = m.group("policy")
                edges = m.group("edges")
                if edges:
                    edges = [m.strip() for m in edges.split(",")]
                lower = float(lower)
                upper = float(upper)
                range = (lower, upper)
                nodes.append(
                    (
                        ast.parse(
                            f"{cv_name} = VirtualParameter(name={name!r}, range={range!r}{(f', conversion_policy={policy!r}' if policy else '')})",
                            mode="single",
                        ),
                        edges,
                    )
                )
            except Exception:
                accepted_values = [
                    lower.replace("'", "").replace('"', ""),
                    upper.replace("'", "").replace('"', ""),
                ]
                nodes.append(
                    (
                        ast.parse(
                            f"{cv_name} = VirtualParameter(name={name!r}, accepted_values={accepted_values!r})",
                            mode="single",
                        ),
                        ["any"],
                    )
                )
    return (nodes, [])


@modifyme
class Hold(VirtualDevice):
    """Sample & Hold module

    inputs:
        * input_cv [0, 127] <any>: the input signal
        * trigger_cv [0, 127] round <rising>: when activated with a tigger holds the
        * mode_cv [sample&hold, track&hold]: choose betwwen sample & hold and track and hold
    outputs:
        * output_cv: the sampled value

    When the trigger is active, the output takes the note the input was when triggered.

    type: continuous
    category: Tracker
    meta: disable default output
    """

    input_cv = VirtualParameter(name="input", range=(0.0, 127.0))
    trigger_cv = VirtualParameter(
        name="trigger", range=(0.0, 127.0), conversion_policy="round"
    )
    mode_cv = VirtualParameter(
        name="mode", accepted_values=["sample&hold", " track&hold"]
    )

    @on(mode_cv, edge="any")
    def on_mode_cv_any(self, value, ctx): ...

    @on(trigger_cv, edge="rising")
    def on_trigger_cv_rising(self, value, ctx): ...

    @on(input_cv, edge="any")
    def on_input_cv_any(self, value, ctx): ...
