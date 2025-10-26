import inspect
import textwrap
from collections import ChainMap

from ..utils import get_source


class MetaTrevorAPI:

    def __init__(self, session, exec_context=None):
        from ..session import Session

        self.session: Session = session
        self.exec_context = exec_context if exec_context else ChainMap(globals())

    def fetch_class_code(self, device):
        cls = device.__class__
        method_codes = {
            name: get_source(obj)
            for name, obj in cls.__dict__.items()
            if callable(obj) and not inspect.isclass(obj)
        }
        return {"className": cls.__name__, "methods": method_codes}

    def get_class_code(self, device):
        cls = device.__class__
        class_code = get_source(cls)
        method_codes = {
            name: get_source(obj)
            for name, obj in cls.__dict__.items()
            if callable(obj) and not inspect.isclass(obj)
        }
        return {
            "className": cls.__name__,
            "classCode": class_code,
            "methods": method_codes,
        }

    def compile_inject(self, device, method_name: str, method_code: str):
        filename = f"<mem {device.__class__.__name__}>"

        bytecode = compile(
            source=method_code.replace(
                "super()", f"super({device.__class__.__name__}, self)"
            ),
            filename=filename,
            mode="exec",
        )
        ctx_copy = ChainMap(self.exec_context)

        glob = device.__class__.__env__
        exec(bytecode, glob, ctx_copy)
        compiled_method = ctx_copy[method_name]
        setattr(device.__class__, method_name, compiled_method)
        compiled_method.__source__ = method_code

    # def object_centric_compile_inject(self, device, method_name: str, method_code: str):
    #     current_cls = device.__class__
    #     tmp_class = getattr(current_cls, "__tmp__", None)
    #     if tmp_class:
    #         # print("[DEBUG] Already on tmp cls")
    #         self.compile_inject(device, method_name, method_code)
    #         return

    #     # print("[DEBUG] Create tmp cls")
    #     src = get_source(current_cls)
    #     env = inspect.getmodule(current_cls)
    #     cls = self.session.compile_device(
    #         f"{current_cls.__name__}", src, env=env.__dict__, temporary=True
    #     )
    #     # print("[DEBUG] cls", cls)
    #     cls.__tmp__ = current_cls
    #     # print("[DEBUG] Migrate instance")
    #     self.session.migrate_instance(device, cls, temporary=True)
    #     # print(f"[DEBUG] Compile inject for {method_name}")
    #     self.compile_inject(device, method_name, method_code)

    def object_centric_compile_inject(self, device, class_code: str):
        current_cls = device.__class__
        # print("[DEBUG] Compiling dedicated class for", current_cls)

        tmp_class = getattr(current_cls, "__tmp__", {})

        if tmp_class:
            replace_name = tmp_class["name"].__name__
            device_name = current_cls.__name__
        else:
            replace_name = current_cls.__name__
            device_name = f"t_{replace_name}"

        final_code = class_code.replace(f"class {replace_name}", f"class {device_name}")

        env = inspect.getmodule(current_cls)
        cls = self.session.compile_device(
            device_name,
            final_code,
            env=env.__dict__,
        )
        try:
            current_path = inspect.getfile(current_cls)
        except OSError:
            current_path = f"<mem {device_name}>"
        cls.__tmp__ = (
            tmp_class if tmp_class else {"name": current_cls, "path": current_path}
        )

        self.session.migrate_instance(device, cls, temporary=True)
