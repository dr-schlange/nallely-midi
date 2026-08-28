import errno
import threading
import traceback
from pathlib import Path
from typing import override

import pyfuse3
import trio

DEV_DIR_INODE = 2
CLASS_DIR_INODE = 3
BASE_INODES = [pyfuse3.ROOT_INODE, DEV_DIR_INODE, CLASS_DIR_INODE]
DATE_NS = -842690400000000000

from .vfs import VNode, VRoot


class NallelyFS(pyfuse3.Operations):
    def __init__(self, mountpoint, session):
        super().__init__()
        self.nallely_session = session
        self.nallely_trevor = session.trevor
        self.nallely_metatrevor = session.meta_trevor
        self._registry = VNode

        self.mountpoint = mountpoint.rstrip("/").encode("utf-8")
        self.root = VRoot(self.mountpoint)


    async def getattr(self, inode, ctx=None):
        d = self._registry.get(inode)
        if d is not None:
            return d.getattr(inode, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def readlink(self, inode, ctx=None):
        d = self._registry.get(inode)
        if d is not None:
            return d.readlink(inode, ctx)
        raise pyfuse3.FUSEError(errno.EINVAL)

    async def lookup(self, parent_inode, name, ctx=None):
        d = self._registry.get(parent_inode)
        if d is not None:
            return d.lookup(parent_inode, name, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def readdir(self, fh, start_id, token):
        d = self._registry.get(fh)
        if d is not None:
            entries = d.readdir(fh, start_id, token)
            # Send list to FUSE
            for i, (name, ino) in enumerate(entries[start_id:], start=start_id):
                attr = await self.getattr(ino)
                if not pyfuse3.readdir_reply(token, name, attr, i + 1):
                    break
            return
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def opendir(self, inode, ctx=None):
        d = self._registry.get(inode)
        if d is not None:
            return d.opendir(inode, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)

    @override
    async def releasedir(self, fh: pyfuse3.FileHandleT) -> None:
        d = self._registry.get(fh)
        if d is not None:
            return d.releasedir(fh)
        return await super().releasedir(fh)

    async def open(self, inode, flags, ctx=None):
        d = self._registry.get(inode)
        if d is not None:
            return d.open(inode, flags, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def read(self, fh, off, size):
        d = self._registry.get(fh)
        if d is not None:
            bval = d.read(fh, off, size)
            if off >= len(bval):
                return b""  # EOF
            return bval[off : off + size]

    async def release(self, fh):
        d = self._registry.get(fh)
        if d is not None:
            d.release(fh)

    async def setattr(self, inode, attr, fields, fh, ctx=None):
        d = self._registry.get(inode)
        if d is not None:
            entry = d.getattr(inode, ctx)
            if fields.update_size:
                entry.st_size = attr.st_size
            return entry

    async def write(self, fh, off, buf):
        d = self._registry.get(fh)
        if d is not None:
            return d.write(fh, off, buf)
        raise pyfuse3.FUSEError(errno.EBADF)

    async def symlink(self, parent_inode: int, name: bytes, target: bytes, ctx):
        d = self._registry.get(parent_inode)
        if d is not None:
            return d.symlink(parent_inode, name, target, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)

    async def unlink(self, parent_inode: int, name: bytes, ctx=None):
        d = self._registry.get(parent_inode)
        if d is not None:
            return d.unlink(parent_inode, name, ctx)
        raise pyfuse3.FUSEError(errno.ENOENT)


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
