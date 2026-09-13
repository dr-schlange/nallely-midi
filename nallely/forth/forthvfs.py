import errno
from typing import Self, override

from pyfuse3 import EntryAttributes, FileHandleT, FUSEError, InodeT, RequestContext

from nallely.core import MidiDevice, VirtualDevice
from nallely.forth.nproxy import NBridge, NProxy

from ..fs.vfs import VFile, hashpath


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

    def collect_vocab(self):
        vocab = " ".join(self.forth.dump_known_words())
        self.forth_display(f"--vocab-start--{vocab}--vocab-end--")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from ..forth.nforth import NForth

        self.result = ""
        self.bridge = NBridge(forth_display=self.forth_display)
        self.forth = NForth(bridge=self.bridge)
        self.forth.swap_print(self.forth_display)
        self.forth.boot()
        self.forth._write(NProxy.generate_prelude())
        self.forth.interpret()
        initial_proxy = NProxy.of(self.component)
        self.forth._write(initial_proxy.generate_vocab(self.forth.dump_known_words()))
        self.forth.interpret()
        self.collect_vocab()

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
            forthvm = self.forth
            if cmd.startswith("words?"):
                self.forth_display(" ".join(forthvm.dump_known_words()))
            elif cmd.startswith("dump "):
                cmd, *word = cmd.split()
                if len(word) > 1:
                    self.forth_display("Usage: dump <WORD>")
                    return len(buf)
                word = word[0]
                cfa, _ = forthvm.find(word)
                if cfa:
                    forthvm.decode_def(cfa - 3)
                else:
                    try:
                        # in case it's an addr
                        forthvm.decode_def(int(word, base=forthvm.memory[forthvm.base]))
                    except Exception:
                        self.forth_display(f"Word {word} is unknown")
            elif cmd.startswith("reset!"):
                cmd, *word = cmd.split()
                nb_params = len(word)
                if nb_params > 1:
                    self.forth_display("Usage: reset! [minimal, full]")
                    return len(buf)
                elif nb_params == 0:
                    boot_param = "full"
                else:
                    boot_param = word[0]
                if boot_param not in ("minimal", "full"):
                    self.forth_display("Usage: reset! [minimal, full]")
                    return len(buf)
                forthvm._reset_machine()
                getattr(self.forth, f"{boot_param}boot")()
            else:
                forthvm._write(data_str)
                forthvm.interpret()
                forthvm.print("ok")
                self.collect_vocab()
        except ValueError as e:
            self.display(fh, e)
            self.forth_display("Outer interpreter error", e)
            self.collect_vocab()
            import traceback

            traceback.print_exc()
            raise FUSEError(errno.EINVAL)
        except Exception as e:
            self.display(fh, e)
            self.forth_display("Outer interpreter error", e)
            self.collect_vocab()
            import traceback

            traceback.print_exc()
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

if [[ $- != *i* ]]; then
    exec bash -i "$0" "$@"
fi
set -o emacs
bind 'set menu-complete-display-prefix on'
bind '"\\t": menu-complete'
bind 'set completion-ignore-case on'


FORTH_VM_IO="{self._stdout()}"
echo -e "Interactive forth repl started on {self.component.uid()}"

# Do a first cat to get the vocab for completion
VOCAB=$(cat $FORTH_VM_IO)
echo "${{VOCAB%--vocab-start--*}}"

VOCAB="${{VOCAB#*--vocab-start--}}"
VOCAB="${{VOCAB%--vocab-end--*}}"
read -r -a VOCAB <<< "$VOCAB"

LAST_WORD=""
MATCH_INDEX=0
CURRENT_MATCHES=()

nforth_complete() {{
    local line="$READLINE_LINE"
    local point="$READLINE_POINT"

    local before="${{line:0:point}}"
    local after="${{line:point}}"

    local current_word="${{before##*[[:space:]]}}"
    local prefix="${{before%"$current_word"}}"

    if [[ -n "$LAST_WORD" && "$current_word" == "$LAST_WORD" && ${{#CURRENT_MATCHES[@]}} -gt 1 ]]; then
        MATCH_INDEX=$(( (MATCH_INDEX + 1) % ${{#CURRENT_MATCHES[@]}} ))
        local next_match="${{CURRENT_MATCHES[$MATCH_INDEX]}}"

        READLINE_LINE="${{prefix}}${{next_match}}${{after}}"
        READLINE_POINT=$((${{#prefix}} + ${{#next_match}}))
        LAST_WORD="$next_match"
        return
    fi

    local matches=()
    local old_nocasematch=$(shopt -p nocasematch)
    shopt -s nocasematch
    for item in "${{VOCAB[@]}}"; do
        if [[ "$item" == "$current_word"* ]]; then
            matches+=("$item")
        fi
    done
    $old_nocasematch

    if (( ${{#matches[@]}} == 1 )); then
        READLINE_LINE="${{prefix}}${{matches[0]}}${{after}}"
        READLINE_POINT=$((${{#prefix}} + ${{#matches[0]}}))
        LAST_WORD=""
    elif (( ${{#matches[@]}} > 1 )); then
        CURRENT_MATCHES=("${{matches[@]}}")
        MATCH_INDEX=0
        LAST_WORD="${{matches[0]}}"

        READLINE_LINE="${{prefix}}${{matches[0]}}${{after}}"
        READLINE_POINT=$((${{#prefix}} + ${{#matches[0]}}))
    fi
}}

bind -x '"\\t": nforth_complete'
while read -e -p "nforth> " FORTH_INPUT; do
    if [[ "$FORTH_INPUT" == "bye" ]]; then
        break
    fi

    if [[ -n "$FORTH_INPUT" ]]; then
        history -s "$FORTH_INPUT"

        echo "$FORTH_INPUT" > "$FORTH_VM_IO"

        # Update vocab for next completion
        VOCAB=$(cat "$FORTH_VM_IO")
        echo "${{VOCAB%--vocab-start--*}}"

        VOCAB="${{VOCAB#*--vocab-start--}}"
        VOCAB="${{VOCAB%--vocab-end--*}}"
        read -r -a VOCAB <<< "$VOCAB"
    fi

    LAST_WORD=""
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
