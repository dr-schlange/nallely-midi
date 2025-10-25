import ast
import inspect
import io
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

try:
    import black
except ImportError:
    black = None

code_registry = set()


@dataclass
class InputPort:
    cv_name: str
    name: str
    policy: str | None = None
    range: tuple[float, float] | None = None
    accepted_values: list[str] | None = None
    edges: list[str] | None = None
    default: str | float | None = None

    @property
    def is_choice(self):
        return self.accepted_values is not None

    @property
    def is_range(self):
        return self.range is not None

    def port_definition_node(self):
        return ast.parse(self.as_port_definition(), mode="single").body[0]

    def reactive_method_nodes(self) -> list[ast.FunctionDef]:
        code = self.as_method()
        if len(code) > 0:
            return ast.parse(code, mode="exec").body
        return []

    def as_port_definition(self) -> str:
        default = f", default={self.default}" if self.default is not None else ""
        if self.is_choice:
            return f"{self.cv_name} = VirtualParameter(name={self.name!r}, accepted_values={self.accepted_values!r}{default})"
        else:
            conv_policy = f", conversion_policy={self.policy!r}" if self.policy else ""
            return f"{self.cv_name} = VirtualParameter(name={self.name!r},range={self.range!r}{conv_policy}{default})"

    def as_method(self):
        if not self.edges:
            return ""
        methods = []
        for edge in self.edges:
            methods.append(
                f"\n@on({self.cv_name}, edge={edge!r})\ndef on_{self.name}_{edge}(self, value, ctx):\n    ...\n"
            )
        return "\n\n".join(methods)


@dataclass
class OutputPort(InputPort):
    default_output: bool = False

    def as_range_methods(self):
        if not self.range:
            return ""
        return f"\n@property\ndef min_range(self):\n    return {self.range[0]}\n\n@property\ndef max_range(self):\n    return {self.range[1]}\n"

    def range_method_nodes(self):
        code = self.as_range_methods()
        if len(code) > 0:
            return ast.parse(code, mode="exec").body
        return []


def generate_class_node(
    cls_def,
    inputs: list[InputPort],
    outputs: list[OutputPort],
    meta,
    remove_decorator=True,
):
    if remove_decorator:
        cls_def.decorator_list.clear()

    cls_def.bases = [ast.Name("VirtualDevice")]
    var_names = {}
    has_default_range = False
    edges = defaultdict(list)
    has_post_init = False
    for node in cls_def.body:
        match node:
            case ast.Assign(targets=[ast.Name() as n]):
                var_names[n.id] = node
            case ast.FunctionDef(
                decorator_list=[
                    ast.Call(
                        func=ast.Name(id="on"),
                        args=[ast.Name(id=var)],
                        keywords=[
                            ast.keyword(arg="edge", value=ast.Constant(value=edge))
                        ],
                    )
                ]
            ):
                edges[var].append(edge)
            case ast.FunctionDef(name=name) if name in ["min_range", "max_range"]:
                has_default_range = True
            case ast.FunctionDef(name="__post_init__"):
                has_post_init = True
    default_output = None
    for input in inputs[::-1]:
        if input.cv_name not in var_names:
            cls_def.body.insert(1, input.port_definition_node())
        else:
            idx = cls_def.body.index(var_names[input.cv_name])
            cls_def.body[idx] = input.port_definition_node()
        reactive_methods = input.reactive_method_nodes()
        if input.cv_name not in edges:
            cls_def.body.extend(reactive_methods)
        else:
            existing_edges = edges[input.cv_name]
            missing_methods = [
                m
                for m in reactive_methods
                if m.decorator_list[0].keywords[0].value.value not in existing_edges
            ]
            cls_def.body.extend(missing_methods)
    for output in outputs:
        if output.cv_name not in var_names:
            if output.default_output:
                default_output = output
                continue
            cls_def.body.insert(len(inputs) + 1, output.port_definition_node())
        else:
            idx = cls_def.body.index(var_names[output.cv_name])
            cls_def.body[idx] = output.port_definition_node()
    if not has_post_init and meta:
        cls_def.body.insert(len(inputs) + len(outputs), meta)
    if not has_default_range and default_output:
        cls_def.body.insert(
            len(inputs) + len(outputs), default_output.range_method_nodes()
        )
    return cls_def


def updategencode(cls, save_in=None, verbose=False):
    cls_file = inspect.getsourcefile(cls)
    if save_in is None:
        if cls_file is None:
            frame = inspect.currentframe()
            if frame is None or frame.f_back is None:
                print(
                    f"No file found or specified for {cls}, returning {cls} and stop codegen"
                )
                return cls
            else:
                cls_file = Path(frame.f_back.f_code.co_filename)
        elif cls_file is not None:
            cls_file = Path(cls_file)
        if cls_file not in code_registry:
            if verbose:
                print("Transforming", cls_file)
            code_registry.clear()
            code_registry.add(cls_file)
        else:
            return cls
        file_code = ast.parse(cls_file.read_text("utf-8"))
    elif isinstance(save_in, Path):
        try:
            cls_file = Path(save_in)
            new_class = ast.parse(cls.__source__, filename=cls_file)
            if cls_file.exists():
                file_code = ast.parse(cls_file.read_text("utf-8"))
            else:
                file_code = new_class
        except AttributeError:
            print(
                f"Class {cls} doesn't have a __source__ attribute, returning {cls} and stop codegen"
            )
            return cls
    elif isinstance(save_in, io.StringIO):
        assert cls_file
        try:
            source = getattr(cls, "__source__", None)
            if not source:
                # If not source, we parse the new class from the file in memory (in case there is something)
                new_class = ast.parse(
                    save_in.read(), filename=f"<inmem {cls.__name__}>"
                )
            else:
                # Otherwise, we parse from the source and we know we are in context of in mem
                new_class = ast.parse(source=source, filename=f"<inmem {cls.__name__}>")

            # We read now the code from the file that comes from the cls_file
            cls_file = Path(cls_file)
            file_code = ast.parse(cls_file.read_text("utf-8"), filename=cls_file)
            cls_file = save_in
        except AttributeError:
            print(
                f"Class {cls} doesn't have a __source__ attribute, returning {cls} and stop codegen"
            )
            return cls
    else:
        raise Exception("Unknown save_in type", save_in.__class__)

    has_imports = False
    autogen_import = None
    for i, node in enumerate(file_code.body):
        match node:
            case ast.ClassDef(name=cls.__name__) as clsdef:
                if verbose:
                    print(f" * transforming {clsdef.name}")
                cls_node = (
                    new_class.body[0]
                    if save_in is not None and new_class.body
                    else clsdef
                )
                file_code.body[i] = generate_class_node(
                    cls_node, *parsedoc(ast.get_docstring(cls_node, clean=True))
                )
            # case ast.ClassDef(decorator_list=[ast.Name("updategencode")]) as clsdef:
            #     print(f" * transforming {clsdef.name}")
            #     file_code.body[i] = generate_class_node(
            #         clsdef, *parsedoc(ast.get_docstring(node, clean=True))
            #     )
            case ast.ImportFrom(module="nallely"):
                has_imports = True
            case ast.ImportFrom(module=name) as imp if name and "codegen" in name:
                autogen_import = imp

    if autogen_import:
        file_code.body.remove(autogen_import)
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
    if black:
        module_content = black.format_str(ast.unparse(file_code), mode=black.Mode())
    else:
        module_content = ast.unparse(file_code)
    if isinstance(cls_file, io.StringIO):
        cls_file.write(module_content)
    else:
        cls_file.write_text(module_content, encoding="utf-8")
    return cls


def parsespec(entries, are_outputs=False):
    re_cv_name = "(?P<cv_name>\\w+)"
    re_cv_range = "(?P<cv_range>[^]]+)"
    re_cv_policy = "\\s+(?P<policy>[^ ]+)"
    re_cv_edge = f"\\s+<(?P<edges>[^>]+)>"
    re_cv_default = f"\\s+init=(?P<default>[^\\s]+)"
    re_input = re.compile(
        f"\\*\\s+{re_cv_name}\\s+\\[{re_cv_range}\\]({re_cv_default})?({re_cv_policy})?({re_cv_edge})?"
    )
    Cls = InputPort if not are_outputs else OutputPort
    nodes = []
    for spec, descr in entries:
        m = re_input.match(spec)
        if not m:
            continue
        cv_name = m.group("cv_name")
        lower, upper, *rest = m.group("cv_range").split(",")
        name = cv_name.replace("_cv", "")
        default = m.group("default")
        try:
            default = float(default)
        except Exception:
            ...
        try:
            policy = m.group("policy")
            edges = m.group("edges")
            if edges:
                edges = [m.strip() for m in edges.split(",")]
            lower = float(lower)
            upper = float(upper)
            range = (lower, upper)
            params = {
                "cv_name": cv_name,
                "name": name,
                "range": range,
                "policy": policy,
                "edges": edges,
                "default": default,
            }
            if are_outputs:
                params["default_output"] = cv_name == "output_cv"
            nodes.append(Cls(**params))
        except Exception:
            accepted_values = [lower, upper, *rest]
            nodes.append(
                Cls(
                    cv_name=cv_name,
                    name=name,
                    accepted_values=accepted_values,
                    edges=["any"],
                )
            )
    return nodes


def parsedoc(doc: str | None):
    if doc is None:
        return ([], [], None)
    doc_iter = iter(doc.split("\n"))
    input_specs = []
    output_specs = []
    meta = []
    while (line := next(doc_iter, None)) is not None:
        line = line.strip()
        if line.startswith("inputs:"):
            while cat := next(doc_iter, None):
                cat = cat.strip()
                if not cat.startswith("* "):
                    break
                code = cat.rsplit(":", 1)
                input_specs.append(code)
            line = cat
        if line and line.startswith("outputs:"):
            while cat := next(doc_iter, None):
                cat = cat.strip()
                if cat.startswith("* "):
                    code = cat.rsplit(":", 1)
                    output_specs.append(code)
            line = cat
        if line and line.startswith("meta:"):
            meta.append(line.split(":")[1].strip())
    inputs = parsespec(input_specs)
    outputs = parsespec(output_specs, are_outputs=True)
    if meta == ["disable default output"]:
        meta = ast.parse(
            f'\ndef __post_init__(self, **kwargs):\n    return {{\n        "disable_output": True\n    }}\n',
            mode="exec",
        ).body[0]
    return (inputs, outputs, meta)
