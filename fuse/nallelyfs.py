import errno
import os
import stat
import sys

import pyfuse3
import trio
from nallely import *
from nallely import (
    LFO,
    VirtualDevice,
    all_devices,
    stop_all_connected_devices,
)
from nallely.core.world import get_all_device_classes
from nallely.session import Session

DEV_DIR_INODE = 2
CLASS_DIR_INODE = 3
BASE_INODES = [pyfuse3.ROOT_INODE, DEV_DIR_INODE, CLASS_DIR_INODE]


def hashparam(dev, param):
    pinst = getattr(dev, param.cv_name)
    hash_mix = hash(pinst.repr().encode("utf-8"))
    return (hash_mix & 0xFFFFFFFFFFFFFFFF) | 0x1000000000000000, pinst


def find_class_by_id(cls_id, cls_registry):
    for cls in cls_registry:
        if id(cls) == cls_id:
            return cls
    raise StopIteration()


class NallelyFS(pyfuse3.Operations):
    def __init__(
        self,
        session,
        all_devices=all_devices,
        get_all_device_classes=get_all_device_classes,
    ):
        super().__init__()
        self.nallely_session = session
        self.nallely_trevor = session.trevor
        self.nallely_metatrevor = session.meta_trevor
        self.all_devices = all_devices
        self.get_all_device_classes = get_all_device_classes
        self._param_lookup = {}
        self._open_files = {}

    async def getattr(self, inode, ctx=None):
        entry = pyfuse3.EntryAttributes()

        # Base config
        entry.st_atime_ns = 0
        entry.st_mtime_ns = 0
        entry.st_ctime_ns = 0
        entry.st_gid = os.getgid()
        entry.st_uid = os.getuid()
        entry.st_ino = inode

        # / case
        if inode in BASE_INODES:
            entry.st_mode = stat.S_IFDIR | 0o755
            entry.st_size = 0
            entry.attr_timeout = 0
            entry.entry_timeout = 0
        elif inode in self._param_lookup:
            param = self._param_lookup[inode]
            val = getattr(param.device, param.parameter.name)
            entry.st_mode = stat.S_IFREG | 0o644
            entry.st_size = len(f"{val}\n".encode("utf-8"))
        else:
            try:
                # An inode/thread/module we confirm it's here
                dev = self.nallely_trevor.get_device_instance(inode)
            except StopIteration:
                try:
                    # We look if that's a class instead
                    cls = find_class_by_id(inode, self.get_all_device_classes())
                    entry.st_mode = stat.S_IFDIR | 0o755
                    entry.st_size = 0
                    entry.attr_timeout = 0
                    entry.entry_timeout = 0
                except StopIteration:
                    print("Cannot ding", inode)
                    raise pyfuse3.FUSEError(errno.ENOENT)

        return entry

    async def lookup(self, parent_inode, name, ctx=None):
        if parent_inode == pyfuse3.ROOT_INODE:
            if name == b"dev":
                return await self.getattr(DEV_DIR_INODE)
            if name == b"class":
                return await self.getattr(CLASS_DIR_INODE)

        elif parent_inode == DEV_DIR_INODE:
            for dev_id, dev in [(dev.uuid, dev) for dev in self.all_devices()]:
                if name == dev.uid().encode("utf-8"):
                    return await self.getattr(dev_id)
        elif parent_inode == CLASS_DIR_INODE:
            for cls_id, cls in [
                (id(cls), cls) for cls in self.get_all_device_classes()
            ]:
                if name == cls.__name__.encode("utf-8"):
                    return await self.getattr(cls_id)
        else:
            try:
                dev = self.nallely_trevor.get_device_instance(parent_inode)
                if name == b".meta":
                    return await self.getattr(parent_inode)
                for param in dev.all_parameters():
                    if name == param.name.encode("utf-8"):
                        h, p = hashparam(dev, param)
                        self._param_lookup[h] = p
                        return await self.getattr(h)
            except StopIteration:
                ...
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def readdir(self, fh, start_id, token):
        entries = []

        if fh == pyfuse3.ROOT_INODE:
            # /
            entries = [
                (b".", pyfuse3.ROOT_INODE),
                (b"..", pyfuse3.ROOT_INODE),
                (b"dev", DEV_DIR_INODE),
                (b"class", CLASS_DIR_INODE),
            ]
        elif fh == DEV_DIR_INODE:
            # /dev
            entries = [
                (b".", DEV_DIR_INODE),
                (b"..", pyfuse3.ROOT_INODE),
            ]
            for dev_id, dev in [(dev.uuid, dev) for dev in self.all_devices()]:
                entries.append((dev.uid().encode("utf-8"), dev_id))
        elif fh == CLASS_DIR_INODE:
            # /class
            entries = [
                (b".", CLASS_DIR_INODE),
                (b"..", pyfuse3.ROOT_INODE),
            ]
            for cls in self.get_all_device_classes():
                entries.append((cls.__name__.encode("utf-8"), id(cls)))
        else:
            try:
                # List a device folder
                dev = self.nallely_trevor.get_device_instance(fh)
                entries = [
                    (b".", fh),
                    (b"..", DEV_DIR_INODE),
                ]
                entries.append((b".meta", fh))
                if isinstance(dev, VirtualDevice):
                    for param in dev.all_parameters():
                        h, p = hashparam(dev, param)
                        self._param_lookup[h] = p
                        entries.append((param.name.encode("utf-8"), h))  # type: ignore
                else:
                    ...
            except StopIteration:
                raise pyfuse3.FUSEError(errno.ENOENT)

        # Send list to FUSE
        for i, (name, ino) in enumerate(entries[start_id:], start=start_id):
            attr = await self.getattr(ino)
            if not pyfuse3.readdir_reply(token, name, attr, i + 1):
                break

    async def opendir(self, inode, ctx=None):
        if inode in BASE_INODES:
            return inode

        try:
            self.nallely_trevor.get_device_instance(inode)
            return inode
        except StopIteration:
            try:
                print("Look for", inode)
                find_class_by_id(inode, self.get_all_device_classes())
                return inode
            except StopIteration:
                raise pyfuse3.FUSEError(errno.ENOENT)

    async def open(self, inode, flags, ctx=None):
        found = (None, None)
        for dev in self.all_devices():
            if isinstance(dev, VirtualDevice):
                for param in dev.all_parameters():
                    h, pinst = hashparam(dev, param)
                    if h == inode:
                        found = (dev, pinst)
                        break
            if found != (None, None):
                break

        if found == (None, None):
            raise pyfuse3.FUSEError(errno.ENOENT)

        self._open_files[inode] = found
        fi = pyfuse3.FileInfo(fh=inode)
        fi.direct_io = True
        return fi

    async def read(self, fh, off, size):
        if fh not in self._open_files:
            raise pyfuse3.FUSEError(errno.EBADF)

        dev, pinst = self._open_files[fh]

        bval = f"{getattr(dev, pinst.parameter.name)}\n".encode("utf-8")

        if off >= len(bval):
            return b""  # EOF

        return bval[off : off + size]

    async def release(self, fh):
        if fh in self._open_files:
            del self._open_files[fh]

    async def setattr(self, inode, attr, fields, fh, ctx=None):
        entry = await self.getattr(inode, ctx)
        if fields.update_size:
            entry.st_size = attr.st_size

        return entry

    async def write(self, fh, off, buf):
        if fh not in self._open_files:
            raise pyfuse3.FUSEError(errno.EBADF)

        dev, pinst = self._open_files[fh]

        try:
            data_str = buf.decode("utf-8").strip()
            if isinstance(dev, VirtualDevice):
                try:
                    data = float(data_str)
                except ValueError:
                    data = data_str
                dev.set_parameter(pinst.parameter.name, data)

        except ValueError:
            raise pyfuse3.FUSEError(errno.EINVAL)
        except Exception:
            raise pyfuse3.FUSEError(errno.EIO)

        return len(buf)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <mountpoint>")
        sys.exit(1)

    mountpoint = sys.argv[1]
    session = Session()
    lfo = LFO(speed=5, auto_srate="OFF", sampling_rate=256)
    lfo.start()
    lfo2 = LFO()
    lfo2.start()
    fs = NallelyFS(session)

    fuse_options = set(pyfuse3.default_options)
    fuse_options.add("fsname=nallelyfs")

    pyfuse3.init(fs, mountpoint, fuse_options)
    try:
        trio.run(pyfuse3.main)
    except KeyboardInterrupt:
        pass
    finally:
        pyfuse3.close()
        stop_all_connected_devices()
