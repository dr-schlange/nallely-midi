import cmd
import os
import pathlib
import readline  # type: ignore we need it for Emacs style shortcuts
from typing import Any, override

from nallely.forth.nforth import NForth
from nallely.forth.nproxy import NBridge


class ForthShell(cmd.Cmd):
    intro = "Welcome to the Forth shell.\nType help or ? to list commands.\n"
    prompt = "nforth> "

    def __init__(self, *args, boot=False, populate=False, **kwargs):
        completekey = kwargs.pop("completekey", None) or "tab: menu-complete "
        super().__init__(*args, completekey=completekey, **kwargs)
        self.bridge = NBridge()
        self.forth = NForth(bridge=self.bridge)
        self.populate = populate
        self.booted = False
        if boot:
            print("Booting Forth kernel...", end="")
            self.boot()

    def dump_words(self):
        print("Known words are (oldest to newest)")
        print(" ".join(self.forth.dump_known_words()))

    def do_dump(self, args):
        cfa, _ = self.forth.find(args)
        if cfa:
            self.forth.decode_def(cfa - 3)
        else:
            self.forth.decode_def(int(args, base=self.forth.memory[self.forth.base]))

    def boot(self, mode="full"):
        self.forth._reset_machine()
        res = getattr(self.forth, f"{mode}boot")()
        if res:
            print("[OK]")
            self.booted = True
        else:
            print("[KO] An error occurred during kernel boot!")
            self.booted = False

    def preloop(self):
        if not self.populate:
            return

        from ..core import all_devices
        from .nproxy import NProxy

        print("Populating dictionnary with session vocabulary... ", end="")
        first = True
        for device in all_devices():
            proxy = NProxy.of(device)
            if first:
                self.interpret(proxy.generate_prelude())
                first = False
            self.interpret(proxy.generate_vocab(self.forth.dump_known_words()))
        print("[OK]")

    def interpret(self, code):
        self.forth._write(code)
        self.forth.interpret()

    @override
    def default(self, line):
        self.interpret(f"{line}\n")

    def completedefault(self, text, line, begidx, endidx) -> list[str]:
        return [
            word
            for word in self.forth.dump_known_words()
            if word.upper().startswith(text.upper())
        ]

    def completenames(self, text: str, *ignored: Any) -> list[str]:
        return [
            word
            for word in self.forth.dump_known_words() + ["dump", "words?", "bye"]
            if word.upper().startswith(text.upper())
        ]

    def do_boot(self, args):
        if args not in ["full", "minimal"]:
            print("arg must be either full or minimal")
            return
        print(f"Reset the machine and start with a {args} boot...", end="")
        self.boot(args)
        self.dump_words()

    def do_help(self, arg: str):
        self.dump_words()

    def emptyline(self):
        return False

    def do_loadf(self, args):
        p = pathlib.Path(args)
        if p.exists():
            txt = p.read_text()
            print(txt)
            self.interpret(txt)
        else:
            print(f"Cannot find {p.absolute()}")

    def do_saveimg(self, args):
        p = pathlib.Path(args)
        if p.exists():
            choice = (
                input(
                    f"Image is already saved as {p.absolute()}, do you want to replace this image? (Y/n)? "
                )
                or "Y"
            )
            if choice.upper() == "Y":
                self.forth.save_to_file(p)
            return
        self.forth.save_to_file(p)

    def do_loadimg(self, args):
        p = pathlib.Path(args)
        if not p.exists():
            f"No file image found at {p.absolute()}"
            return
        self.forth.reload_from_file(p)

    @override
    def postcmd(self, stop: bool, line: str) -> bool:
        if stop:
            print("see you soon!")
            return stop
        self.forth.print("ok")
        return False

    def do_bye(self, _):
        return True

    do_EOF = do_bye


if __name__ == "__main__":
    shell = ForthShell(boot=True)
    shell.cmdloop()
