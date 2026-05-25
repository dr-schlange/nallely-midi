import json
import time
from typing import cast

from dulwich.objects import Blob, Commit, Tree, parse_timezone
from dulwich.refs import Ref
from dulwich.repo import Repo

from .utils import address2frags


class SessionMetadata:
    def __init__(self, repo: Repo):
        self.repo = repo

    def metadata_for(self, address):
        frags = address2frags(address)
        return AddressMetadata(self, "/".join(frags))


class AddressMetadata:
    filename = b"meta.json"

    def __init__(self, metadata_session: "SessionMetadata", address_frag):
        self.address_frag = cast(Ref, f"refs/metadata/{address_frag}".encode())
        self.metadata_session = metadata_session

    def write(self, infos):
        parent_commits = []
        repo = self.metadata_session.repo

        object_store = self.metadata_session.repo.object_store
        if self.address_frag in repo:
            try:
                last_commit_id = repo.refs[self.address_frag]
                last_commit = cast(Commit, object_store[last_commit_id])
                parent_commits = [last_commit_id]
                tree = cast(Tree, object_store[last_commit.tree])
            except KeyError:
                tree = Tree()
        else:
            tree = Tree()

        file_blob = Blob()
        file_blob.data = json.dumps(infos).encode()
        object_store.add_object(file_blob)

        tree.add(self.filename, 0o100644, file_blob.id)
        object_store.add_object(tree)

        commit = Commit()
        commit.tree = tree.id
        if parent_commits:
            commit.parents = parent_commits
            commit.message = f"Init metadata for {self.address_frag}".encode()
        else:
            commit.message = f"Update metadata for {self.address_frag}".encode()
        commit.author = b"Nallely MIDI <drcoatl@proton.me>"
        commit.committer = b"dr-schlange <drcoatl@proton.me>"
        commit.commit_time = commit.author_time = int(time.time())
        commit.commit_timezone = commit.author_timezone = parse_timezone(b"+0000")[0]
        object_store.add_object(commit)

        repo.refs[self.address_frag] = commit.id

    def read(self):
        object_store = self.metadata_session.repo.object_store
        repo = self.metadata_session.repo
        if self.address_frag not in repo:
            return {}

        last_commit_id = repo.refs[self.address_frag]
        last_commit = cast(Commit, object_store[last_commit_id])
        tree = cast(Tree, object_store[last_commit.tree])
        _, blob_id = tree[self.filename]
        blob = cast(Blob, object_store[blob_id])
        content = json.loads(blob.data.decode())
        return content
