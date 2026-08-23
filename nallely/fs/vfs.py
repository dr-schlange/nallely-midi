import errno
import os
import stat
from typing import Any, Callable, Self, override

from pyfuse3 import (
    ROOT_INODE,
    EntryAttributes,
    FileHandleT,
    FileInfo,
    FileNameT,
    FlagT,
    FUSEError,
    InodeT,
    ReaddirToken,
    RequestContext,
    SetattrFields,
)

from nallely import MidiDevice, Module, VirtualDevice, all_devices
from nallely.core.links import Link
from nallely.core.midi_device import ModulePadsOrKeys, ModuleParameter, ModulePitchwheel
from nallely.core.parameter_instances import Int, ParameterInstance
from nallely.core.virtual_device import VirtualParameter
from nallely.core.world import (
    get_all_device_classes,
    get_connected_devices,
    get_virtual_devices,
)

# getattr: Callable[[Self, InodeT, RequestContext | None], EntryAttributes] | None
# readlink: Callable[[Self, InodeT, RequestContext | None], str] | None
# lookup: (
#     Callable[[Self, InodeT, FileNameT, RequestContext | None], EntryAttributes]
#     | None
# )
# readdir: Callable[[Self, FileHandleT, int, ReaddirToken], None] | None
# opendir: Callable[[Self, InodeT, RequestContext | None], InodeT] | None
# open: Callable[[Self, InodeT, FlagT, RequestContext | None], FileInfo] | None
# read: Callable[[Self, FileHandleT, int, int], bytes] | None
# release: Callable[[Self, FileHandleT], None] | None
# setattr: (
#     Callable[
#         [
#             Self,
#             InodeT,
#             EntryAttributes,
#             SetattrFields,
#             FileHandleT | None,
#             RequestContext | None,
#         ],
#         EntryAttributes,
#     ]
#     | None
# )
# write: Callable[[Self, FileHandleT, int, bytes], int] | None

DEV_DIR_INODE = 2
CLASS_DIR_INODE = 3
BASE_INODES = [ROOT_INODE, DEV_DIR_INODE, CLASS_DIR_INODE]
DATE_NS = -842690400000000000


def hashpath(path: str):
    return (hash(path.encode("utf-8")) & 0xFFFFFFFF) | 0x10000000


class Registry:
    def __init__(self):
        self.inodes = {}

    def register(self, inode, elem):
        self.inodes[inode] = elem


class VNode:
    mountpoint: str = ""
    _registry: dict[InodeT | FileHandleT, "VNode"] = {}

    def __init__(self, name: bytes, parent: "VDir", component):
        self.children: list[VNode] = []
        self.parent = parent if parent else self
        if self.parent is not self:
            parent.children.append(self)
        self.name = name
        self.component = component
        self._registry[self.inode_num] = self

    @property
    def mode(self) -> int:
        return 0o000

    @classmethod
    def get(
        cls, inode: InodeT | FileHandleT, provider: Callable[..., "VNode"] | None = None
    ) -> "VNode | None":
        try:
            return cls._registry[inode]
        except KeyError:
            if provider:
                entry = provider()
                cls._registry[inode] = entry
                return entry
            return None

    def _get(self, component: Any, _type) -> "VNode | None":
        return self.get(_type.stable_ref(component), self._build_dev(_type, component))

    def _build_dev(self, _type, component):
        return lambda component=component: _type(
            component=component,
            name=_type._get_name(component).encode("utf-8"),
            parent=self,
        )

    @property
    def inode_num(self) -> int:
        return self.stable_ref(self.component)

    @classmethod
    def _get_name(cls, component: Any) -> str:
        raise NotImplementedError()

    @classmethod
    def stable_ref(cls, component: Any) -> int:
        raise NotImplementedError()

    @property
    def isroot(self):
        return self.parent is self

    def base_entry(self, inode: InodeT) -> EntryAttributes:
        entry = EntryAttributes()
        entry.st_atime_ns = DATE_NS
        entry.st_mtime_ns = DATE_NS
        entry.st_ctime_ns = DATE_NS
        entry.st_gid = os.getgid()
        entry.st_uid = os.getuid()
        entry.st_ino = inode
        return entry

    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes: ...

    def readlink(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> bytes: ...

    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes: ...

    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]: ...
    def opendir(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> InodeT: ...
    def open(
        self: Self, inode: InodeT, flags: FlagT, ctx: RequestContext | None = None
    ) -> FileInfo: ...
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes: ...
    def release(self: Self, fh: FileHandleT) -> None: ...
    def releasedir(self, fh: FileHandleT) -> None: ...
    def setattr(
        self: Self,
        inode: InodeT,
        attr: EntryAttributes,
        fields: SetattrFields,
        fh: FileHandleT | None,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes: ...
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int: ...
    def symlink(
        self,
        parent_inode: int,
        name: bytes,
        target: bytes,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes: ...
    def unlink(
        self, parent_inode: int, name: bytes, ctx: RequestContext | None = None
    ): ...


class VDir(VNode):
    @property
    @override
    def mode(self) -> int:
        return 0o700

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        return [
            (b".", fh),
            (b"..", self.parent.inode_num),
            # *((child.name, child.inode_num) for child in self.children),
        ]

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = self.base_entry(inode)
        entry.st_mode = stat.S_IFDIR | self.mode
        entry.st_size = 0
        entry.attr_timeout = 0
        entry.entry_timeout = 0
        return entry

    @override
    def opendir(self: Self, inode: InodeT, ctx: RequestContext | None = None) -> InodeT:
        return self.inode_num

    @override
    def releasedir(self, fh: FileHandleT) -> None:
        # try:
        #     del self._registry[fh]
        # except KeyError:
        #     pass
        pass

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for child in self.children:
            if child.name == name:
                return child.getattr(child.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VFile(VNode):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fh2pid = {}

    @property
    @override
    def mode(self) -> int:
        return 0o600

    def display(self, fh, *msgs, repeat=True, end="\n", **kwargs):
        pid = self.fh2pid[fh]
        if repeat:
            print("[NALLELYFS]", *msgs, end=end, **kwargs)
        try:
            if pid > 0:
                tty_path = os.readlink(f"/proc/{pid}/fd/1")

                if tty_path.startswith(("/dev/pts/", "/dev/tty")):
                    with open(tty_path, "w") as tty:
                        tty.write(f"\r{' '.join(str(msg) for msg in msgs)}{end}")

        except Exception as e:
            print(e)

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = self.base_entry(inode)
        entry.st_mode = stat.S_IFREG | self.mode
        entry.st_size = 0
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        return entry

    @override
    def open(
        self: Self, inode: InodeT, flags: FlagT, ctx: RequestContext | None = None
    ) -> FileInfo:
        fi = FileInfo(fh=inode)
        fi.direct_io = True
        fi.keep_cache = False
        self.fh2pid[inode] = ctx.pid
        return fi

    def release(self: Self, fh: FileHandleT) -> None:
        try:
            del self.fh2pid[fh]
        except KeyError:
            pass


class VRoot(VDir):
    def __init__(self):
        super().__init__(b"/", parent=self, component=None)

    @classmethod
    @override
    def _get_name(cls, component: Any) -> str:
        return "/"

    @classmethod
    @override
    def stable_ref(cls, component: Any) -> int:
        return ROOT_INODE

    @override
    def releasedir(self, fh: FileHandleT) -> None:
        pass

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for v in [VDevRoot, VClasRoot]:
            m = self._get(None, v)
            assert m
            entries.append((m.name, m.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        for v in [VDevRoot, VClasRoot]:
            if name == v._get_name(None).encode("utf-8"):
                m = self._get(None, v)
                assert m
                return m.getattr(m.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VClasRoot(VDir):
    def __init__(self, parent: VDir):
        super().__init__(b"class", parent=parent, component=None)

    @classmethod
    @override
    def _get_name(cls, component: Any) -> str:
        return "class"

    @classmethod
    @override
    def stable_ref(cls, component: Any) -> int:
        return CLASS_DIR_INODE

    @override
    def releasedir(self, fh: FileHandleT) -> None:
        pass

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for cls in get_all_device_classes():
            t = VMidiClasDef if issubclass(cls, MidiDevice) else VClasDef
            d = self._get(cls, t)
            assert d
            entries.append((d.name, d.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for cls in get_all_device_classes():
            t = VMidiClasDef if issubclass(cls, MidiDevice) else VClasDef
            cname = t._get_name(cls).encode("utf-8")
            if cname == name:
                d = self._get(cls, t)
                assert d
                return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VClasDef(VDir):
    @classmethod
    @override
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.__name__

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for section in self.component.all_parameters():
            d = self._get(section, VParamDef)
            assert d
            entries.append((d.name, d.inode_num))

        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for section in self.component.all_parameters():
            cname = VParamDef._get_name(section).encode("utf-8")
            if cname == name:
                d = self._get(section, VParamDef)
                assert d
                return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VParamDef(VDir):
    @classmethod
    @override
    def stable_ref(cls, component: VirtualParameter) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component: VirtualParameter) -> str:
        return component.name

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for p in [
            "name",
            "stream",
            "consumer",
            "description",
            "range",
            "accepted_values",
            "conversion_policy",
            "disable_policy",
            "cv_name",
            "section_name",
            "cc_note",
            "hidden",
            "default",
            "no_init",
        ]:
            if hasattr(self.component, p):
                d = self._get((p, self.component), VParamPropDef)
                assert d
                entries.append((d.name, d.inode_num))

        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for p in [
            "name",
            "stream",
            "consumer",
            "description",
            "range",
            "accepted_values",
            "conversion_policy",
            "disable_policy",
            "cv_name",
            "section_name",
            "cc_note",
            "hidden",
            "default",
            "no_init",
        ]:
            if hasattr(self.component, p):
                cname = VParamPropDef._get_name((p, self.component)).encode("utf-8")
                if cname == name:
                    d = self._get((p, self.component), VParamPropDef)
                    assert d
                    return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VMidiClasDef(VDir):
    @classmethod
    @override
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.__name__

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for section in self.component.sections.values():
            d = self._get(section, VSectionDef)
            assert d
            entries.append((d.name, d.inode_num))

        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for section in self.component.sections.values():
            cname = VSectionDef._get_name(section).encode("utf-8")
            if cname == name:
                d = self._get(section, VSectionDef)
                assert d
                return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VSectionDef(VDir):
    @classmethod
    @override
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.state_name

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for section in self.component.meta.parameters:
            d = self._get(section, VMidiParamDef)
            assert d
            entries.append((d.name, d.inode_num))

        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for section in self.component.meta.parameters:
            cname = VMidiParamDef._get_name(section).encode("utf-8")
            if cname == name:
                d = self._get(section, VMidiParamDef)
                assert d
                return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VMidiParamDef(VDir):
    @classmethod
    @override
    def stable_ref(
        cls, component: ModuleParameter | ModulePadsOrKeys | ModulePitchwheel
    ) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(
        cls, component: ModuleParameter | ModulePadsOrKeys | ModulePitchwheel
    ) -> str:
        return component.name

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for p in [
            "type",
            "cc_note",
            "channel",
            "name",
            "section_name",
            "init_value",
            "description",
            "range",
            "accepted_values",
            "stream",
        ]:
            if hasattr(self.component, p):
                d = self._get((p, self.component), VParamPropDef)
                assert d
                entries.append((d.name, d.inode_num))

        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        for p in [
            "type",
            "cc_note",
            "channel",
            "name",
            "section_name",
            "init_value",
            "description",
            "range",
            "accepted_values",
            "stream",
        ]:
            if hasattr(self.component, p):
                cname = VParamPropDef._get_name((p, self.component)).encode("utf-8")
                if cname == name:
                    d = self._get((p, self.component), VParamPropDef)
                    assert d
                    return d.getattr(d.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VParamPropDef(VFile):
    @classmethod
    @override
    def stable_ref(
        cls,
        component: tuple[
            str,
            ModuleParameter | ModulePadsOrKeys | ModulePitchwheel | VirtualParameter,
        ],
    ) -> int:
        return hashpath(f"{id(component[1])}/{component[0]}")

    @classmethod
    @override
    def _get_name(
        cls,
        component: tuple[
            str,
            ModuleParameter | ModulePadsOrKeys | ModulePitchwheel | VirtualParameter,
        ],
    ) -> str:
        return component[0]

    def content(self):
        return str(getattr(self.component[1], self.component[0])).encode("utf-8")

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.content())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = int(data_str)
            except ValueError:
                try:
                    data = float(data_str)
                except ValueError:
                    if data_str in [b"True", b"False", b"true", b"false"]:
                        data = data_str in [b"True", b"true"]
                    elif data_str.startswith("("):
                        fields = data_str.split(",")
                        try:
                            data = tuple(int(f) for f in fields)
                        except ValueError:
                            data = tuple(float(f) for f in fields)
                    else:
                        data = data_str
            setattr(self.component[1], self.component[0], data)
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)


class VDevRoot(VDir):
    def __init__(self, parent: VDir):
        super().__init__(b"dev", parent=parent, component=None)

    @classmethod
    @override
    def _get_name(cls, component: Any) -> str:
        return "dev"

    @classmethod
    @override
    def stable_ref(cls, component: Any) -> int:
        return DEV_DIR_INODE

    @override
    def releasedir(self, fh: FileHandleT) -> None:
        pass

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for device in get_virtual_devices():
            dev = self._get(device, VDev)
            assert dev
            entries.append((dev.name, dev.inode_num))
        for device in get_connected_devices():
            dev = self._get(device, VMidiDev)
            assert dev
            entries.append((dev.name, dev.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        for dev in all_devices():
            if name == dev.uid().encode("utf-8"):
                if isinstance(dev, VirtualDevice):
                    dev = self._get(dev, VDev)
                else:
                    dev = self._get(dev, VMidiDev)
                assert dev
                return dev.getattr(dev.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VDev(VDir):
    @classmethod
    @override
    def stable_ref(cls, component: VirtualDevice) -> int:
        return component.uuid

    @classmethod
    @override
    def _get_name(cls, component: VirtualDevice) -> str:
        return component.uid()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        return entry

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        assert fh == self.inode_num
        entries = super().readdir(fh, start_id, token)
        for v in [VMeta, VViewVirtual, VForth, VForthREPL]:
            m = self._get(self.component, v)
            assert m
            entries.append((m.name, m.inode_num))
        for param in self.component.all_parameters():
            pinst = getattr(self.component, param.cv_name)
            p = self._get(pinst, VParam)
            assert p
            entries.append((p.name, p.inode_num))
            # using list idx is not the best
            for i, link in enumerate(pinst.outgoing_links):
                p = self._get((i, link), VLink)
                assert p
                entries.append((p.name, p.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        for v in [VMeta, VViewVirtual, VForth, VForthREPL]:
            if name == v._get_name(self.component).encode("utf-8"):
                m = self._get(self.component, v)
                assert m
                return m.getattr(m.inode_num, ctx)
        base, _, idx = name.partition(b".")
        for param in self.component.all_parameters():
            if param.hidden:
                continue
            pname = param.name.encode("utf-8")
            if name == pname:
                p = self._get(getattr(self.component, param.cv_name), VParam)
                assert p
                return p.getattr(p.inode_num, ctx)
            # using list idx is not the best
            if not idx:
                continue
            for i, link in enumerate(
                getattr(self.component, param.cv_name).outgoing_links
            ):
                pname = link.src.parameter.name.encode("utf-8")
                if pname == base:
                    p = self._get((i, link), VLink)
                    assert p
                    return p.getattr(p.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VLink(VDir):
    @classmethod
    @override
    def stable_ref(cls, component: tuple[int, Link]) -> int:
        return hashpath(f"{component[1].repr()}/src")

    @classmethod
    @override
    def _get_name(cls, component: tuple[int, Link]) -> str:
        return f"{component[1].src.parameter.name}.{component[0]}"

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        link = self.component[1]
        for t in [VLinkDst, VLinkDstDev]:
            dev = self._get(link, t)
            assert dev
            entries.append((dev.name, dev.inode_num))
        for param in ["bouncy", "muted", "velocity", "extra_zero"]:
            dev = self._get((link, param), VLinkParam)
            assert dev
            entries.append((dev.name, dev.inode_num))
        if link.chain:
            dev = self._get(link, VScaler)
            assert dev
            entries.append((dev.name, dev.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        link = self.component[1]
        for t in [VLinkDst, VLinkDstDev]:
            if name == t._get_name(link).encode("utf-8"):
                dev = self._get(link, VLinkDst)
                assert dev
                return dev.getattr(dev.inode_num, ctx)
        for param in ["bouncy", "muted", "velocity", "extra_zero"]:
            pname = param.encode("utf-8")
            if name == pname:
                dev = self._get((link, param), VLinkParam)
                assert dev
                return dev.getattr(dev.inode_num, ctx)
        if link.chain and name == VScaler._get_name(link).encode("utf-8"):
            dev = self._get(link, VScaler)
            assert dev
            return dev.getattr(dev.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VLinkParam(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: tuple[Link, str]) -> int:
        return hashpath(f"{component[0].repr()}/{component[1]}")

    @classmethod
    @override
    def _get_name(cls, component: tuple[Link, str]) -> str:
        return component[1]

    def content(self):
        return f"{getattr(self.component[0], self.component[1])}\n".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = float(data_str)
            except ValueError:
                if data_str in [b"True", b"False", b"true", b"false"]:
                    data = data_str in [b"True", b"true"]
                else:
                    data = data_str
            setattr(self.component[0], self.component[1], data)
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)


class VScaler(VDir):
    @classmethod
    @override
    def stable_ref(cls, component: Link) -> int:
        return hashpath(f"{component.repr()}/scaler")

    @classmethod
    @override
    def _get_name(cls, component: Link) -> str:
        return "scaler"

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        link = self.component
        for param in ["to_min", "to_max", "method", "as_int"]:
            dev = self._get((link, param), VScalerParam)
            assert dev
            entries.append((dev.name, dev.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        link = self.component
        for param in ["to_min", "to_max", "method", "as_int"]:
            pname = param.encode("utf-8")
            if name == pname:
                dev = self._get((link, param), VScalerParam)
                assert dev
                return dev.getattr(dev.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VScalerParam(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: tuple[Link, str]) -> int:
        return hashpath(f"{component[0].repr()}/scaler/{component[1]}")

    @classmethod
    @override
    def _get_name(cls, component: tuple[Link, str]) -> str:
        return component[1]

    def content(self):
        return f"{getattr(self.component[0].chain, self.component[1])}\n".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = float(data_str)
            except ValueError:
                if data_str in [b"True", b"False", b"true", b"false"]:
                    data = data_str in [b"True", b"true"]
                else:
                    data = data_str
            setattr(self.component[0].chain, self.component[1], data)
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)


class VLinkDst(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: Link) -> int:
        return hashpath(f"{component.repr()}/dest")

    @classmethod
    @override
    def _get_name(cls, component: Link) -> str:
        return "target"

    def target(self) -> str:
        dst = self.component.dest
        dev = dst.device
        if isinstance(dev, VirtualDevice):
            return (
                f"{self.mountpoint}/dev/{VDev._get_name(dev)}/{VParam._get_name(dst)}"
            )
        return f"{self.mountpoint}/dev/{VMidiDev._get_name(dev)}/{dst.parameter.section_name}/{VMidiParam._get_name(dst)}"

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFLNK | 0o700
        entry.st_nlink = 1
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.target())
        return entry

    @override
    def readlink(self: Self, inode: InodeT, ctx: RequestContext | None = None) -> bytes:
        return self.target().encode("utf-8")


class VLinkDstDev(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: Link) -> int:
        return hashpath(f"{component.repr()}/destdev")

    @classmethod
    @override
    def _get_name(cls, component: Link) -> str:
        return "target_device"

    def target(self) -> str:
        dst = self.component.dest
        dev = dst.device
        if isinstance(dev, VirtualDevice):
            return f"{self.mountpoint}/dev/{VDev._get_name(dev)}"
        return f"{self.mountpoint}/dev/{VMidiDev._get_name(dev)}/{dst.parameter.section_name}"

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFLNK | 0o700
        entry.st_nlink = 1
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.target())
        return entry

    @override
    def readlink(self: Self, inode: InodeT, ctx: RequestContext | None = None) -> bytes:
        return self.target().encode("utf-8")


class VMidiDev(VDir):
    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice) -> int:
        return component.uuid

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice) -> str:
        return component.uid()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        return entry

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        assert fh == self.inode_num
        entries = super().readdir(fh, start_id, token)
        for v in [VMeta, VNote, VForth, VForthREPL]:
            m = self._get(self.component, v)
            assert m
            entries.append((m.name, m.inode_num))
        for section in self.component.all_sections():
            p = self._get(getattr(self.component, section.state_name), VMidiSection)
            assert p
            entries.append((p.name, p.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        for v in [VMeta, VNote, VForth, VForthREPL]:
            if name == v._get_name(self.component).encode("utf-8"):
                m = self._get(self.component, v)
                assert m
                return m.getattr(m.inode_num, ctx)
        for section in self.component.all_sections():
            pname = section.state_name.encode("utf-8")
            if name == pname:
                p = self._get(getattr(self.component, section.state_name), VMidiSection)
                assert p
                return p.getattr(p.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VMidiSection(VDir):
    @classmethod
    @override
    def _get_name(cls, component: Module) -> str:
        return component.state_name

    @classmethod
    @override
    def stable_ref(cls, component: Module) -> int:
        return hashpath(f"/dev/{component.device.uuid}/{component.state_name}")

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        assert fh == self.inode_num
        entries = super().readdir(fh, start_id, token)
        for param in self.component.all_parameters():
            pinst = getattr(self.component, param.name)
            p = self._get(pinst, VMidiParam)
            assert p
            entries.append((p.name, p.inode_num))
            # using list idx is not the best
            for i, link in enumerate(pinst.outgoing_links):
                p = self._get((i, link), VLink)
                assert p
                entries.append((p.name, p.inode_num))
        return entries

    @override
    def lookup(
        self: Self,
        parent_inode: InodeT,
        name: FileNameT,
        ctx: RequestContext | None = None,
    ) -> EntryAttributes:
        assert parent_inode == self.inode_num
        base, _, idx = name.partition(b".")
        for param in self.component.all_parameters():
            pname = param.name.encode("utf-8")
            pinst = getattr(self.component, param.name)
            if name == pname:
                p = self._get(pinst, VMidiParam)
                assert p
                return p.getattr(p.inode_num, ctx)
            # using list idx is not the best
            if not idx:
                continue
            for i, link in enumerate(pinst.outgoing_links):
                pname = link.src.parameter.name.encode("utf-8")
                if pname == base:
                    p = self._get((i, link), VLink)
                    assert p
                    return p.getattr(p.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VMidiParam(VFile):
    @classmethod
    @override
    def _get_name(cls, component: Int) -> str:
        return component.parameter.name

    @classmethod
    @override
    def stable_ref(cls, component: Int) -> int:
        return hashpath(
            f"/dev/{component.device.uuid}/{component.parameter.section_name}/{component.parameter.name}"
        )

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = float(data_str)
            except ValueError:
                data = data_str
            setattr(
                getattr(self.component.device, self.component.parameter.section_name),
                self.component.parameter.name,
                data,
            )
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        return entry

    def content(self):
        return f"{getattr(getattr(self.component.device, self.component.parameter.section_name), self.component.parameter.name)}".encode()

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()


class VNote(VFile):
    @property
    @override
    def mode(self) -> int:
        return 0o200

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice) -> str:
        return "notes"

    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice) -> int:
        return hashpath(f"/dev/{component.uid()}/notes")

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            cmd, *rest = data_str.split()
            dev = self.component
            if cmd == "ON":
                note, *velocity = rest
                dev.note_on(int(note), velocity=int(velocity[0]) if velocity else 127)
            elif cmd == "OFF":
                note, *velocity = rest
                dev.note_off(int(note), velocity=int(velocity[0]) if velocity else 127)
            elif cmd == "ALL-OFF":
                dev.all_notes_off()
            elif cmd == "FORCE-OFF":
                dev.force_all_notes_off()
            else:
                msg = f"[NALLELYFS] Unknown command {cmd} for {dev.uid()}"
                print(msg)
                self.display(fh, msg)
        except ValueError as e:
            raise FUSEError(errno.EINVAL)
        except Exception as e:
            print(e)
            raise FUSEError(errno.EIO)
        return len(buf)


class VParam(VFile):
    @classmethod
    @override
    def _get_name(cls, component: ParameterInstance) -> str:
        return component.name

    @classmethod
    @override
    def stable_ref(cls, component: ParameterInstance) -> int:
        return hashpath(component.repr())

    def content(self):
        param = self.component
        return f"{getattr(param.device, param.parameter.name)}\n".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = int(data_str)
            except ValueError:
                try:
                    data = float(data_str)
                except ValueError:
                    data = data_str
            dev = self.component.device
            dev.set_parameter(self.component.parameter.name, data)
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)


class VMeta(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice | VirtualDevice) -> int:
        return hashpath(f"/class/{component.__class__.__name__}")

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice | VirtualDevice) -> str:
        return ".meta"

    def target(self) -> bytes:
        return f"{self.mountpoint}/class/{self.component.__class__.__name__}".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFLNK | 0o700
        entry.st_nlink = 1
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.target())
        return entry

    @override
    def readlink(self: Self, inode: InodeT, ctx: RequestContext | None = None) -> bytes:
        return self.target()


class VViewVirtual(VFile):
    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice | VirtualDevice) -> int:
        return hashpath(f"/dev/{component.uid()}/view")

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice | VirtualDevice) -> str:
        return ".view"

    def gen_sh(self):
        localdir = 'SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)'
        pentries = ""
        dev = self.component
        params = dev.all_parameters()
        for p in params:
            if p.hidden:
                continue
            pentries += f'echo "{p.name} = $(cat $SCRIPT_DIR/{p.name})"\n'
        return f"""#!/usr/bin/env bash
    {localdir}

    echo -e "# {dev.uid()} Summary\\n"
    echo -e "Stable identity = {self.stable_ref(dev)}\\n"
    {pentries}
    """.encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFREG | 0o500
        entry.st_nlink = 1
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.gen_sh())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.gen_sh()


class VForth(VFile):
    @property
    def mode(self) -> int:
        return 0o600

    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice | VirtualDevice) -> int:
        return hashpath(f"/dev/{component.uid()}/forth")

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice | VirtualDevice) -> str:
        return ".forth"

    def _stdout(self):
        return f"{self.mountpoint}/dev/{self.component.uid()}/.forth"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from ..forth.nforth import NForth

        self.forth = NForth()
        self.forth.swap_print(self.forth_display)
        self.forth.boot()
        self.result = ""

    def content(self):
        return f"{self.result}".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()

    def forth_display(self, *msgs, end="\n", **kwargs):
        self.result += f"{' '.join(str(msg) for msg in msgs)}{end}"

    def flush_display(self):
        self.result = ""

    @override
    def write(self: Self, fh: FileHandleT, off: int, buf: bytes) -> int:
        try:
            self.flush_display()
            data_str = buf.decode("utf-8").strip()
            cmd = data_str.strip().lower()
            if cmd.startswith("words?"):
                self.forth_display(" ".join(self.forth.dump_known_words()))
            elif cmd.startswith("dump "):
                cmd, *word = cmd.split()
                if len(word) > 1:
                    self.forth_display("Usage: dump <WORD>")
                    return len(buf)
                word = word[0]
                cfa, _ = self.forth.find(word)
                if cfa:
                    self.forth.decode_def(cfa - 3)
                else:
                    self.forth_display(f"Word {word} is unknown")
            else:
                self.forth._write(data_str)
                self.forth.interpret()
                self.forth.display_stacks()
        except ValueError:
            raise FUSEError(errno.EINVAL)
        except Exception:
            raise FUSEError(errno.EIO)
        return len(buf)


class VForthREPL(VFile):
    @property
    def mode(self) -> int:
        return 0o500

    @classmethod
    @override
    def stable_ref(cls, component: MidiDevice | VirtualDevice) -> int:
        return hashpath(f"/dev/{component.uid()}/forthrepl")

    @classmethod
    @override
    def _get_name(cls, component: MidiDevice | VirtualDevice) -> str:
        return ".forthrepl"

    def _stdout(self):
        return f"{self.mountpoint}/dev/{self.component.uid()}/.forth"

    def content(self):
        return f"""#!/usr/bin/env bash

FORTH_VM="{self._stdout()}"
echo "Interactive forth repl started on {self.component.uid()}"
# Do a first cat to flush what was issued during the boot
cat $FORTH_VM
while read -e -p "nforth> " FORTH_INPUT; do
    if [[ "$FORTH_INPUT" == "bye" ]]; then
        break
    fi
    echo $FORTH_INPUT > $FORTH_VM
    cat $FORTH_VM
done
echo "bye"
""".encode()

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_size = len(self.content())
        entry.attr_timeout = 10
        entry.entry_timeout = 10
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.content()


ROOT = VRoot()
_dev = VDevRoot(ROOT)
_clas = VClasRoot(ROOT)
