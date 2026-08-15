import errno
import os
import stat
import threading
import traceback
from pathlib import Path

import pyfuse3
import trio

from nallely import VirtualDevice, all_devices
from nallely.core.parameter_instances import ParameterInstance
from nallely.core.world import get_all_device_classes

DEV_DIR_INODE = 2
CLASS_DIR_INODE = 3
BASE_INODES = [pyfuse3.ROOT_INODE, DEV_DIR_INODE, CLASS_DIR_INODE]
DATE_NS = -842690400000000000


def hashparam(dev, param):
    pinst = getattr(dev, param.cv_name)
    hash_mix = hash(pinst.repr().encode("utf-8"))
    return (hash_mix & 0xFFFFFFFF) | 0x10000000, pinst


def hashpath(path):
    return (hash(path.encode("utf-8")) & 0xFFFFFFFF) | 0x10000000


def find_class_by_id(cls_id, cls_registry):
    for cls in cls_registry:
        if id(cls) == cls_id:
            return cls
    raise StopIteration()


def gen_sh(dev):
    localdir = (
        'SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)'
    )
    pentries = ""
    params = dev.all_parameters()
    for p in params:
        if getattr(p, "hidden", False):
            continue
        pentries += f'echo "{p.name} = $(cat $SCRIPT_DIR/{p.name})"\n'
    return f"""#!/usr/bin/env sh
{localdir}

echo -e "# {dev.uid()} Summary\n"
echo -e "Stable identity = {dev.uuid}\n"
{pentries}

"""


class NallelyFS(pyfuse3.Operations):
    def __init__(
        self,
        mountpoint,
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
        self._section_lookup = {}
        self._meta_lookup = {}
        self._view_lookup = {}
        self._note_lookup = {}
        self._open_files = {}
        self.mountpoint = mountpoint.rstrip("/").encode("utf-8")

    async def getattr(self, inode, ctx=None):
        entry = pyfuse3.EntryAttributes()

        # Base config
        entry.st_atime_ns = DATE_NS
        entry.st_mtime_ns = DATE_NS
        entry.st_ctime_ns = DATE_NS
        entry.st_gid = os.getgid()
        entry.st_uid = os.getuid()
        entry.st_ino = inode

        if inode in BASE_INODES:
            entry.st_mode = stat.S_IFDIR | 0o755
            entry.st_size = 0
            entry.attr_timeout = 0
            entry.entry_timeout = 0
        elif inode in self._param_lookup:
            param = self._param_lookup[inode]
            if isinstance(param, ParameterInstance):
                val = getattr(param.device, param.parameter.name)
            else:
                p = param.parameter
                val = getattr(getattr(param.device, p.section_name), p.name)
            entry.st_mode = stat.S_IFREG | 0o644
            entry.st_size = len(f"{val}\n".encode("utf-8"))
        elif inode in self._meta_lookup:
            entry.st_mode = stat.S_IFLNK | 0o777
            entry.st_size = len(
                self.mountpoint
                + f"/class/{self._meta_lookup[inode].__name__}".encode("utf-8")
            )
            entry.st_nlink = 1
            entry.attr_timeout = 1
            entry.entry_timeout = 1
        elif inode in self._view_lookup:
            entry.st_mode = stat.S_IFREG | 0o544
            entry.st_size = len(gen_sh(self._view_lookup[inode]))
            entry.attr_timeout = 5
            entry.entry_timeout = 5
        elif inode in self._note_lookup:
            entry.st_mode = stat.S_IFREG | 0o200
            entry.st_size = 0  # only for writing and we don't know what yet
            entry.attr_timeout = 5
            entry.entry_timeout = 5
        elif inode in self._section_lookup:
            entry.st_mode = stat.S_IFDIR | 0o755
            entry.st_size = 0
            entry.attr_timeout = 5
            entry.entry_timeout = 5
        else:
            entry.st_mode = stat.S_IFDIR | 0o755
            entry.st_size = 0
            entry.attr_timeout = 1
            entry.entry_timeout = 1
            try:
                # An inode/thread/module we confirm it's here
                dev = self.nallely_trevor.get_device_instance(inode)
            except StopIteration:
                try:
                    # We look if that's a class instead
                    cls = find_class_by_id(inode, self.get_all_device_classes())
                except StopIteration:
                    raise pyfuse3.FUSEError(errno.ENOENT)

        return entry

    async def readlink(self, inode, ctx=None):
        if inode in self._meta_lookup:
            return (
                self.mountpoint
                + f"/class/{self._meta_lookup[inode].__name__}".encode("utf-8")
            )

        # If a non-symlink inode winds up here, return Invalid Argument
        raise pyfuse3.FUSEError(errno.EINVAL)

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
        elif parent_inode in self._section_lookup:
            dev, section = self._section_lookup[parent_inode]
            for param in section.all_parameters():
                if name == param.name.encode("utf-8"):
                    h = hashpath(f"/dev/{dev.uid()}/{param.section_name}/{param.name}")
                    self._param_lookup[h] = getattr(
                        getattr(dev, param.section_name), param.name
                    )
                    return await self.getattr(h)
        else:
            try:
                dev = self.nallely_trevor.get_device_instance(parent_inode)
                if name == b".meta":
                    h = hashpath(f"/class/{dev.__class__.__name__}")
                    self._meta_lookup[h] = dev.__class__
                    return await self.getattr(h)
                if name == b".view":
                    h = hashpath(f"/dev/{dev.uid()}/view")
                    self._view_lookup[h] = dev
                    return await self.getattr(h)
                if name == b"notes":
                    h = hashpath(f"/dev/{dev.uid()}/notes")
                    self._note_lookup[h] = dev
                    return await self.getattr(h)
                if isinstance(dev, VirtualDevice):
                    for param in dev.all_parameters():
                        if getattr(param, "hidden", False):
                            continue
                        if name == param.name.encode("utf-8"):
                            h, p = hashparam(dev, param)
                            self._param_lookup[h] = p
                            return await self.getattr(h)
                else:
                    for section in dev.all_sections():
                        if name == section.state_name.encode("utf-8"):
                            h = hashpath(f"/dev/{dev.uid()}/{section.state_name}")
                            self._section_lookup[h] = (dev, section)
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
        elif fh in self._section_lookup:
            dev, section = self._section_lookup[fh]
            for param in section.all_parameters():
                h = hashpath(f"/dev/{dev.uid()}/{param.section_name}/{param.name}")
                self._param_lookup[h] = getattr(
                    getattr(dev, param.section_name), param.name
                )
                entries.append((param.name.encode("utf-8"), h))
        else:
            try:
                # List a device folder
                dev = self.nallely_trevor.get_device_instance(fh)
                entries = [
                    (b".", fh),
                    (b"..", DEV_DIR_INODE),
                ]
                # .meta
                h = hashpath(f"/class/{dev.__class__.__name__}")
                self._meta_lookup[h] = dev.__class__
                entries.append((b".meta", h))
                # .view
                h = hashpath(f"/dev/{dev.uid()}/view")
                self._view_lookup[h] = dev
                entries.append((b".view", h))
                if isinstance(dev, VirtualDevice):
                    for param in dev.all_parameters():
                        if param.hidden:
                            continue
                        h, p = hashparam(dev, param)
                        self._param_lookup[h] = p
                        entries.append((param.name.encode("utf-8"), h))
                else:
                    # note-on note-off
                    h = hashpath(f"/dev/{dev.uid()}/notes")
                    self._note_lookup[h] = dev
                    entries.append((b"notes", h))
                    for section in dev.all_sections():
                        h = hashpath(f"/dev/{dev.uid()}/{section.state_name}")
                        self._section_lookup[h] = (dev, section)
                        entries.append((section.state_name.encode("utf-8"), h))
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

        if inode in self._section_lookup:
            return inode

        try:
            dev = self.nallely_trevor.get_device_instance(inode)
            return inode
        except StopIteration:
            try:
                find_class_by_id(inode, self.get_all_device_classes())
                return inode
            except StopIteration:
                raise pyfuse3.FUSEError(errno.ENOENT)

    async def open(self, inode, flags, ctx=None):
        if inode in self._view_lookup:
            found = self._view_lookup[inode]
        elif inode in self._note_lookup:
            found = self._note_lookup[inode]
        else:
            found = (None, None)
            for dev in self.all_devices():
                if isinstance(dev, VirtualDevice):
                    for param in dev.all_parameters():
                        if param.hidden:
                            continue
                        h, pinst = hashparam(dev, param)
                        if h == inode:
                            found = (dev, pinst)
                            break
                else:
                    for param in dev.all_parameters():
                        h = hashpath(
                            f"/dev/{dev.uid()}/{param.section_name}/{param.name}"
                        )
                        if h == inode:
                            found = (
                                dev,
                                getattr(getattr(dev, param.section_name), param.name),
                            )
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

        if fh in self._view_lookup:
            bval = gen_sh(self._open_files[fh]).encode("utf-8")
        else:
            dev, pinst = self._open_files[fh]
            if isinstance(dev, VirtualDevice):
                bval = f"{getattr(dev, pinst.parameter.name)}\n".encode("utf-8")
            else:
                bval = f"{getattr(getattr(dev, pinst.parameter.section_name), pinst.parameter.name)}\n".encode(
                    "utf-8"
                )

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

        if fh in self._note_lookup:
            try:
                data_str = buf.decode("utf-8").strip()
                cmd, *rest = data_str.split()
                dev = self._open_files[fh]
                if cmd == "ON":
                    note, *velocity = rest
                    dev.note_on(
                        int(note), velocity=int(velocity[0]) if velocity else 127
                    )
                elif cmd == "OFF":
                    note, *velocity = rest
                    dev.note_off(
                        int(note), velocity=int(velocity[0]) if velocity else 127
                    )
                elif cmd == "ALL-OFF":
                    dev.all_notes_off()
                elif cmd == "FORCE-OFF":
                    dev.force_all_notes_off()
                else:
                    print(f"[NALLELYFS] Unknown command {cmd} for {dev.uid()}")
            except ValueError as e:
                # print("[NALLELYFS] Error while decoding notes to play", e)
                raise pyfuse3.FUSEError(errno.EINVAL)
            except Exception as e:
                # print("[NALLELYFS] Error while decoding notes to play", e)
                raise pyfuse3.FUSEError(errno.EIO)
            return len(buf)

        dev, pinst = self._open_files[fh]

        try:
            data_str = buf.decode("utf-8").strip()
            try:
                data = float(data_str)
            except ValueError:
                data = data_str
            if isinstance(dev, VirtualDevice):
                dev.set_parameter(pinst.parameter.name, data)
            else:
                setattr(
                    getattr(dev, pinst.parameter.section_name),
                    pinst.parameter.name,
                    data,
                )
        except ValueError:
            raise pyfuse3.FUSEError(errno.EINVAL)
        except Exception:
            raise pyfuse3.FUSEError(errno.EIO)

        return len(buf)


class NallelyFSThread(threading.Thread):
    def __init__(self, mountpoint, session):
        self.session = session
        self.mountpoint = Path(mountpoint).resolve().as_posix()
        self.fs = NallelyFS(mountpoint, session)
        self.fuse_options = set(pyfuse3.default_options)
        self.fuse_options.add("fsname=nallelyfs")
        self._trio_token = None
        super().__init__()

    def run(self) -> None:
        print("[NALLELYFS] Init FUSE...")
        pyfuse3.init(self.fs, self.mountpoint, self.fuse_options)

        async def main_async_loop():
            self._trio_token = trio.lowlevel.current_trio_token()
            print("[NALLELYFS] Start main loop...")
            try:
                await pyfuse3.main()
            except Exception:
                traceback.print_exc()
                print("[NALLELYFS] An issue occurred in FUSE main loop...")

        try:
            trio.run(main_async_loop)
        except Exception:
            traceback.print_exc()
        finally:
            print(f"[NALLELYFS] Unmounting cleanup for {self.mountpoint}...")
            try:
                pyfuse3.close()
            except Exception as e:
                print("[NALLELYFS] Error occured while closing", e)
            print("[NALLELYFS] FUSE thread finished...")

    def stop(self):
        if not self.is_alive() or not self._trio_token:
            return
        print("[NALLELYFS] Triggering unmount...")
        try:
            trio.from_thread.run_sync(pyfuse3.close, trio_token=self._trio_token)
        except trio.RunFinishedError:
            pass


def init_nallelyfs(mountpoint, session):
    return NallelyFSThread(mountpoint, session)


def local_mount(mountpoint):
    import json

    from websockets.sync.client import connect

    try:
        with connect("ws://localhost:6788/trevor") as ws:
            response = ws.recv()  # First we receive the full state
            ws.send(
                json.dumps(
                    {
                        "command": "mount_nallelyfs",
                        "mountpoint": f"{mountpoint}",
                    }
                )
            )
            response = ws.recv()
            if response != '"OK"':
                print(f"[NALLELYFS] Couldn't mount {mountpoint}... {response}")
    except Exception as e:
        print("[NALLELYFS]", e)
        print(
            "[NALLELYFS] Couldn't mount the NallelyFS, check if a Nallely session is running localhost and try again"
        )


def local_umount():
    import json

    from websockets.sync.client import connect

    try:
        with connect("ws://localhost:6788/trevor") as ws:
            response = ws.recv()  # First we receive the full state
            ws.send(json.dumps({"command": "umount_nallelyfs"}))
            response = ws.recv()
            if response != '"OK"':
                print(f"[NALLELYFS] Couldn't umount the filesystem... {response}")
    except Exception as e:
        print("[NALLELYFS]", e)
        print(
            "[NALLELYFS] Couldn't umount the NallelyFS, check if a Nallely session is running localhost and try again"
        )
