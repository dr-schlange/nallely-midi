import inspect
import textwrap
from collections import ChainMap
from typing import *

# Imports for compilation
from nallely import *


class MetaTrevorAPI:
    def __init__(self, exec_context):
        self.exec_context = exec_context

    def fetch_class_code(self, device):
        cls = device.__class__
        method_codes = {
            name: textwrap.dedent(inspect.getsource(obj))
            for name, obj in cls.__dict__.items()
            if callable(obj)
        }
        return {"className": cls.__name__, "methods": method_codes}

    def compile_inject(self, device, method_name: str, method_code: str):
        bytecode = compile(
            source=method_code.replace(
                "super()", f"super({device.__class__.__name__}, self)"
            ),
            filename="<string>",
            mode="exec",
        )
        ctx_copy = ChainMap(self.exec_context)
        exec(bytecode, globals(), ctx_copy)
        compiled_method = ctx_copy[method_name]
        setattr(device.__class__, method_name, compiled_method)
