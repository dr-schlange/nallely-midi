from __future__ import annotations
from dataclasses import dataclass, field
from inspect import isfunction
import math
from traceback import print_exc
from typing import Any, Literal, Type
from typing import TYPE_CHECKING
import mido


# import threading
# import queue

if TYPE_CHECKING:
    from .core import MidiDevice


NOT_INIT = "uninitialized"


# class ModuleWorker(threading.Thread):
#     def __init__(self):
#         super().__init__(daemon=True)
#         self.task_queue = queue.Queue()
#         self.running = True
#         self.start()

#     def run(self):
#         while self.running:
#             try:
#                 task, args = self.task_queue.get(timeout=1)
#                 task(*args)
#             except queue.Empty:
#                 continue
#             except:
#                 print_exc()

#     def submit_task(self, task, *args):
#         self.task_queue.put((task, args))

#     def stop(self):
#         self.running = False

# worker = ModuleWorker()


def intex(val, param, device):
    v = IntExt(val)
    v.parameter = param
    v.device = device
    v.converter = lambda x: x  # type: ignore
    return v.converter(v)


class IntExt(int):
    def __init__(self, val):
        super().__init__()
        self.value = val
        self.cv = None
        self.parameter = None
        self.device = None
        self.converter = None

    def __iadd__(self, other):
        return self

    def __isub__(self, other):
        print("TODO Removing", other.parameter, self.parameter)
        return self

    def scale(self, min, max, method: Literal["lin"] | Literal["log"] = "lin"):
        if method == "lin":
            self.converter = lambda x: min + (x / 127) * (max - min)
        elif method == "log":
            self.converter = lambda x: math.exp(
                math.log(min) + (x / 127) * (math.log(max) - math.log(min))
            )
        return self


@dataclass
class ModuleParameter:
    cc: int
    channel: int = 0
    name: str = NOT_INIT
    module_state_name: str = NOT_INIT
    stream: bool = False

    def __get__(self, instance, owner=None) -> IntExt:
        return instance.state[self.name]

    def __set__(self, instance, value, send=True, debug=False, force=False):
        if not force and isinstance(value, IntExt):
            to_module: MidiDevice = instance
            from_module: MidiDevice = value.device  # type: ignore
            # we create a callback on from_module that will "set" the module parameter to value of to_module
            # finally triggering the code that sends the cc and sync the state lower in this class.
            from_module.bind(
                lambda value, ctx: setattr(to_module, self.name, value),
                type="control_change",
                value=value.parameter.cc,
            )
            return

        from .core import VirtualDevice

        if isinstance(value, VirtualDevice):
            if debug:
                value.bind(
                    lambda lfo_value, ctx: print(
                        f"[{instance.meta.name} #{self.name}]",
                        ctx.parent.waveform,
                        "t =",
                        ctx.ticks,
                        "v =",
                        lfo_value,
                    )
                )
                return
            value.bind(lambda value, ctx: setattr(instance, self.name, value))
            return
        if isfunction(value):
            instance.device.bind(value, type="control_change", value=self.cc)
            return
        if send:
            # Normal case, we set a value through the descriptor, this triggers the send of the message
            instance.device.control_change(self.cc, value, channel=self.channel)
        instance.state[self.name] = intex(value, self, instance.device)

    def basic_set(self, device: MidiDevice, value):
        getattr(device.modules, self.module_state_name).state[self.name] = intex(
            value, self, device
        )



@dataclass
class ModulePadsOrKeys:
    channel: int = 0

    # def __post_init__(self):
    #     self.callbacks = []

    # def bind_to(self, module, control):
    #     module.setup_function(control, FAKE())
    #     self.bind(module.main_function(control))

    # def bind(self, fun):
    #     self.callbacks.append(fun)

    def __get__(self, instance, owner=None):
        return self

    def __set__(self, instance, value):
        # if isinstance(value, ModulePadsOrKeys):
        #     value.bind(
        #         lambda note, params: instance.device.send(
        #             mido.Message(
        #                 params[2], note=note, velocity=params[1], channel=self.channel
        #             )
        #         )
        #     )
        #     return
        # if hasattr(value, "callback"):
        #     self.bind(value.callback)
        ...

    def basic_send(self, type, note, velocity):
        ...
        # for callback in self.callbacks:
        #     try:
        #         callback(note, (self, velocity, type))
        #     except:
        #         print_exc()


@dataclass
class MetaModule:
    name: str
    parameters: list[ModuleParameter]
    pads_or_keys: ModulePadsOrKeys | None


@dataclass
class Module:
    device: MidiDevice
    meta: Any = None
    state_name: str = NOT_INIT
    state: dict[str, int] = field(default_factory=dict)

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        parameters = []
        pads = None
        for name, value in vars(cls).items():
            if isinstance(value, ModuleParameter):
                value.name = name
                value.module_state_name = cls.state_name
                parameters.append(value)
            if isinstance(value, ModulePadsOrKeys):
                pads = value
        cls.meta = MetaModule(cls.__name__, parameters, pads)

    def __post_init__(self):
        self.meta = self.__class__.meta
        for param in self.meta.parameters:
            self.state[param.name] = intex(0, param, self.device)

    def setup_function(self, control, lfo): ...

    def main_function(self, control):
        return lambda value, _: (
            setattr(self, control.name, value) if value is not None else None
        )


@dataclass
class KeySection(Module):
    state_name = "keys"
    notes = ModulePadsOrKeys()


class ModuleState:
    def __init__(self, device, modules: list[Type[Module]]):
        init_modules = {}
        for ModuleCls in modules:
            moduleInstance = ModuleCls(device)
            init_modules[ModuleCls.state_name] = moduleInstance
            for param in moduleInstance.meta.parameters:
                device.reverse_map[("cc", param.cc)] = param
            if moduleInstance.meta.pads_or_keys:
                device.reverse_map[("note", None)] = moduleInstance.meta.pads_or_keys
        self.modules = init_modules

    def __getattr__(self, name):
        return self.modules[name]
