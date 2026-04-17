import ast
from collections import Counter
from dataclasses import InitVar, dataclass, field
from decimal import Decimal
from typing import Sequence

from ..core import MidiDevice, VirtualDevice, VirtualParameter
from ..core.links import Link


@dataclass
class Stmt:
    def collect_imports(self) -> Sequence["Import"]:
        raise NotImplementedError("")

    def gen_body(self) -> Sequence[ast.stmt]:
        raise NotImplementedError("")

    @property
    def outgoing_links(self) -> list[Link]:
        return []


@dataclass
class Import(Stmt):
    module: str
    name: str

    @classmethod
    def dup(cls, device: MidiDevice | VirtualDevice):
        return cls(module=device.__class__.__module__, name=device.__class__.__name__)

    def collect_imports(self):
        return [self]


@dataclass(unsafe_hash=True)
class ImportFrom(Import):
    def __post_init__(self):
        self.ast_node = ast.ImportFrom(module=self.module, names=[ast.alias(self.name)])

    def gen_body(self) -> Sequence[ast.stmt]:
        return [self.ast_node]


@dataclass(unsafe_hash=True)
class ImportAbsolute(Import):
    def __post_init__(self):
        self.ast_node = ast.Import(names=[ast.alias(f"{self.module}.{self.name}")])

    def gen_body(self) -> Sequence[ast.stmt]:
        return [self.ast_node]


@dataclass
class DeviceInstance(Stmt):
    import_: Import
    name: str
    device: MidiDevice | VirtualDevice
    auto_start: bool = False

    def __post_init__(self):
        self.ast_nodes: Sequence[ast.stmt]

    @classmethod
    def from_instance(cls, name, device: MidiDevice | VirtualDevice, auto_start=False):
        return cls(
            name=name,
            import_=ImportFrom.dup(device),
            auto_start=auto_start,
            device=device,
        )

    def collect_imports(self):
        return [self.import_]

    def gen_body(self) -> Sequence[ast.stmt]:
        return self.ast_nodes

    @property
    def outgoing_links(self) -> list[Link]:
        return self.device.outgoing_links


@dataclass
class MidiDeviceInstance(DeviceInstance):
    def __post_init__(self):
        self.ast_nodes = [
            ast.Assign(
                targets=[ast.Name(id=self.name)],
                value=ast.Call(func=ast.Name(id=self.device.__class__.__name__)),
            )
        ]
        for section, content in self.device.current_preset().items():
            for parameter, value in content.items():
                self.ast_nodes.append(
                    ast.Assign(
                        targets=[
                            ast.Attribute(
                                value=ast.Attribute(
                                    value=ast.Name(id=self.name), attr=section
                                ),
                                attr=parameter,
                            )
                        ],
                        value=ast.Constant(
                            value=(
                                float(value) if isinstance(value, Decimal) else value
                            )
                        ),
                    )
                )


@dataclass
class VirtualDeviceInstance(DeviceInstance):
    def __post_init__(self):
        self.ast_nodes = [
            ast.Assign(
                targets=[ast.Name(id=self.name)],
                value=ast.Call(func=ast.Name(id=self.device.__class__.__name__)),
            )
        ]
        for key, value in self.device.current_preset().items():
            self.ast_nodes.append(
                ast.Assign(
                    targets=[ast.Attribute(value=ast.Name(id=self.name), attr=key)],
                    value=ast.Constant(
                        value=(float(value) if isinstance(value, Decimal) else value)
                    ),
                )
            )


def create_instance(device: MidiDevice | VirtualDevice, name=None, auto_start=False):
    if isinstance(device, MidiDevice):
        cls = MidiDeviceInstance
    else:
        cls = VirtualDeviceInstance
    return cls.from_instance(name=name, device=device, auto_start=auto_start)


@dataclass
class Code:
    imports: list[Import | ImportFrom] = field(default_factory=list)
    body: list[Stmt] = field(default_factory=list)
    allocated: dict[str, DeviceInstance] = field(default_factory=dict)

    def __post_init__(self):
        self.alloc_idx = Counter()

    def dup_instance(
        self,
        device: MidiDevice | VirtualDevice,
        name: str | None = None,
        auto_start=False,
        replace=False,
    ) -> DeviceInstance:
        # we consider that the name of instance will have different "shape"
        if name is None:
            name = "_dev"

        if name in self.allocated:
            if not replace:
                self.alloc_idx[name] += 1
                name = f"{name}_{self.alloc_idx[name]}"

        instance = create_instance(name=name, device=device, auto_start=auto_start)
        self.allocated[name] = instance
        self.body.append(instance)
        return instance

    def collect_imports(self):
        imports = {}
        for stmt in self.body:
            for s in stmt.collect_imports():
                imports[s] = s.gen_body()[0]

        return list(imports.values())

    def gen_body(self):
        body = []
        for stmt in self.body:
            body.extend(stmt.gen_body())
        return body

    def find_name(self, device):
        for key, dev in self.allocated.items():
            if device is dev.device:
                return key
        raise KeyError()

    def gen_links(self):
        links = []
        all_devices = [stmt.device for stmt in self.allocated.values()]
        for name, stmt in self.allocated.items():
            for link in stmt.outgoing_links:
                dst = link.dest
                if dst.device not in all_devices:
                    continue
                src = link.src

                if isinstance(src.device, MidiDevice):
                    src_cv = ast.Attribute(
                        value=ast.Attribute(
                            value=ast.Name(id=name), attr=src.parameter.section_name
                        ),
                        attr=src.parameter.name,
                    )
                else:
                    assert isinstance(src.parameter, VirtualParameter)
                    assert src.parameter.cv_name
                    src_cv = ast.Attribute(
                        value=ast.Name(id=name), attr=src.parameter.cv_name
                    )

                if isinstance(dst.device, MidiDevice):
                    dst_cv = ast.Attribute(
                        value=ast.Attribute(
                            value=ast.Name(id=self.find_name(dst.device)),
                            attr=dst.parameter.section_name,
                        ),
                        attr=dst.parameter.name,
                    )
                else:
                    assert isinstance(dst.parameter, VirtualParameter)
                    assert dst.parameter.cv_name
                    dst_cv = ast.Attribute(
                        value=ast.Name(id=self.find_name(dst.device)),
                        attr=dst.parameter.cv_name,
                    )

                links.append(
                    ast.Assign(
                        targets=[dst_cv],
                        value=src_cv,
                    )
                )
        return links

    def ast(self):
        imports = self.collect_imports()
        body = self.gen_body()
        module = ast.Module(body=[*imports, *body, *self.gen_links()])
        return ast.fix_missing_locations(module)

    def unparse(self):
        return ast.unparse(self.ast())


def gen_subgraph_code(devices: list[MidiDevice | VirtualDevice]) -> Code:
    code = Code()
    for device in devices:
        code.dup_instance(device)
    return code
