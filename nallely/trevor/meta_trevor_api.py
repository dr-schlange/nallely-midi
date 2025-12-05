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

    def object_centric_compile_inject(
        self, device, class_code: str, tmp_name: bool = True, filename=None
    ):
        current_cls = device.__class__
        # print("[DEBUG] Compiling dedicated class for", current_cls)

        tmp_class = getattr(current_cls, "__tmp__", {})

        if tmp_class:
            replace_name = tmp_class["name"].__name__
            device_name = current_cls.__name__
            final_code = class_code.replace(
                f"class {replace_name}", f"class {device_name}"
            )
        elif tmp_name:
            replace_name = current_cls.__name__
            device_name = f"t_{replace_name}"
            final_code = class_code.replace(
                f"class {replace_name}", f"class {device_name}"
            )
        else:
            # if we don't have tmp class and we don't ask for a tmp name,
            # then we just override this class
            device_name = current_cls.__name__
            replace_name = device_name
            final_code = class_code

        env = inspect.getmodule(current_cls)
        print(f"[META] Compiling first version of {device_name} considering {filename}")
        cls = self.session.compile_device(
            device_name, final_code, env=env.__dict__, filename=filename
        )
        if filename:
            cls.__name__ = replace_name
            cls.__source__ = cls.__source__.replace(
                f"class {device_name}", f"class {replace_name}"
            )
            print(f"[META] Create and save new version of {cls} in {filename}")
            cls = self.session.compile_device_from_cls(cls, filename=filename)
            cls.__tmp__ = None
            # We force a reload of the stored device
            self.session._load_device_file(filename)
            self.session.migrate_instances(cls.__name__)
        else:
            try:
                current_path = inspect.getfile(current_cls)
            except OSError:
                current_path = f"<mem {device_name}>"
            cls.__tmp__ = (
                tmp_class if tmp_class else {"name": current_cls, "path": current_path}
            )
        self.session.migrate_instance(device, cls, temporary=True)

    def compile_save_new_class(
        self, device, class_code: str, force_name: str | None = None
    ):
        current_cls = device.__class__
        if force_name and force_name != current_cls.__name__:
            current_cls.__name__ = force_name
        device_file = self.session.devices_path / f"{current_cls.__name__.lower()}.py"
        self.object_centric_compile_inject(
            device, class_code, tmp_name=False, filename=device_file
        )
