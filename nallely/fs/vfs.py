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
from nallely.core.parameter_instances import ParameterInstance
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


def find_class_by_id(cls_id: int, cls_registry):
    for cls in cls_registry:
        if id(cls) == cls_id:
            return cls
    raise StopIteration()


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
        return 0

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


class VDir(VNode):
    @property
    @override
    def mode(self) -> int:
        return 0o755

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
        return fi


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
        for v in [VDev, VClas]:
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
        for v in [VDev, VClas]:
            if name == v._get_name(None).encode("utf-8"):
                m = self._get(None, v)
                assert m
                return m.getattr(m.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VClas(VDir):
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
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.name


class VMidiClasDef(VDir):
    @classmethod
    @override
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.__name__

    def get_all_sections(self):
        return (
            v
            for cls in reversed(self.component.__mro__)
            for k, v in getattr(cls, "__annotations__", {}).items()
            if isinstance(v, type) and issubclass(v, Module)
        )

    @override
    def readdir(
        self: Self, fh: FileHandleT, start_id: int, token: ReaddirToken
    ) -> list[tuple[bytes, InodeT]]:
        entries = super().readdir(fh, start_id, token)
        for section in self.get_all_sections():
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
        for section in self.get_all_sections():
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
    def stable_ref(cls, component) -> int:
        return id(component)

    @classmethod
    @override
    def _get_name(cls, component) -> str:
        return component.name


class VDev(VDir):
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
            dev = self._get(device, VVdev)
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
                    dev = self._get(dev, VVdev)
                else:
                    dev = self._get(dev, VMidiDev)
                assert dev
                return dev.getattr(dev.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


class VVdev(VDir):
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
        for v in [VMeta, VViewVirtual]:
            m = self._get(self.component, v)
            assert m
            entries.append((m.name, m.inode_num))
        for param in self.component.all_parameters():
            p = self._get(getattr(self.component, param.cv_name), VParam)
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
        for v in [VMeta, VViewVirtual]:
            if name == v._get_name(self.component).encode("utf-8"):
                m = self._get(self.component, v)
                assert m
                return m.getattr(m.inode_num, ctx)
        for param in self.component.all_parameters():
            if param.hidden:
                continue
            pname = param.name.encode("utf-8")
            if name == pname:
                p = self._get(getattr(self.component, param.cv_name), VParam)
                assert p
                return p.getattr(p.inode_num, ctx)
        raise FUSEError(errno.ENOENT)


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


class VParam(VFile):
    @property
    @override
    def mode(self) -> int:
        return 0o644

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
        return f"{getattr(param.device, param.parameter.name)}\n".encode("utf-8")

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
        return f"{self.mountpoint}/class/{self.component.__class__.__name__}".encode(
            "utf-8"
        )

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFLNK | 0o777
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
    """.encode("utf-8")

    @override
    def getattr(
        self: Self, inode: InodeT, ctx: RequestContext | None = None
    ) -> EntryAttributes:
        entry = super().getattr(inode, ctx)
        entry.st_mode = stat.S_IFREG | 0o544
        entry.st_nlink = 1
        entry.attr_timeout = 1
        entry.entry_timeout = 1
        entry.st_size = len(self.gen_sh())
        return entry

    @override
    def read(self: Self, fh: FileHandleT, off: int, size: int) -> bytes:
        return self.gen_sh()


ROOT = VRoot()
_dev = VDev(ROOT)
_clas = VClas(ROOT)
