"""
Minimal forth.

Host interpreter is inspired by sectorforth https://github.com/cesarblum/sectorforth/tree/master
Added primitive: SP! (for DROP, otherwise DROP cannot work on 1 element stack and provokes an underflow)
Bootstrapped kernel is a port of socrotforth's minimal examples
"""

import os
from dataclasses import dataclass, field
from typing import Any, override

if os.name == "nt":
    import msvcrt

    def readchar():  # type: ignore
        return msvcrt.getch().decode("utf-8", errors="ignore")

else:
    import sys
    import termios
    import tty

    def readchar():
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setcbreak(fd)
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return ch


class EmptyStack(Exception): ...


class Colors:
    ERROR = "\033[35m"
    WARNING = "\033[33m"
    END = "\033[0m"


SPACE = ord(" ")
SPACES = [ord(" "), ord("\n"), ord("\t"), ord("\r")]
LPAR = ord("(")
RPAR = ord(")")
DQUOTE = ord('"')
DOT = ord(".")
RETURN = 13


@dataclass
class NForth:
    cell_size: int = 1
    memory: list[Any] = field(default_factory=lambda: [0] * 0x3FFFC)
    # constants to know
    sp0: int = 0x3FFF8
    rp0: int = 0x1DBF8
    origin: int = 0x4040  # Not a system var, but need to be tweaked if other changes!
    # system vars
    here: int = 0x4038
    latest: int = 0x4030
    rp: int = 0x4028
    sp: int = 0x4020
    ip: int = 0x4018
    w: int = 0x4010
    toin: int = 0x4008
    state: int = 0x4000
    tib: int = 0x0000

    def __post_init__(self):
        self._reset_machine()
        self.__oldprint = None
        self.__newprint = None

    def print(self, *msg, **kwargs):
        print(*msg, **kwargs)

    def swap_print(self, foo):
        if self.__oldprint is not None or self.__newprint is foo:
            return
        self.__oldprint = self.print
        self.__newprint = foo
        self.print = foo.__get__(self)

    def restore_print(self):
        if self.__oldprint is None:
            return
        self.print = self.__oldprint
        self.__oldprint = None
        self.__newprint = None

    def _reset_machine(self):
        self.memory[self.ip] = 0
        self.memory[self.w] = 0
        self.memory[self.toin] = 0
        self.memory[self.tib : self.tib + self.state] = [0] * (self.state - self.tib)
        self.memory[self.here] = self.origin
        self.memory[self.latest] = 0
        self.memory[self.sp] = self.sp0
        self.memory[self.rp] = self.rp0
        self._in_next = False
        self.primitive_id: int = 0
        self.primitives = {}
        self._setup_primitives()

    def _soft_reset(self):
        self.memory[self.w] = 0
        self.memory[self.ip] = 0
        self.memory[self.sp] = self.sp0
        self.memory[self.rp] = self.rp0

    def _setup_primitives(self):
        self.docol_id, _ = self._register_primitive("docol", self.docol)
        self._register_primitive("@", self.fetch)
        self._register_primitive("!", self.store)
        self._register_primitive("SP@", self.spfetch)
        self._register_primitive("SP!", self.spstore)
        self._register_primitive("RP@", self.rpfetch)
        self._register_primitive("0=", self.zeroeq)
        self._register_primitive("+", self.add)
        self._register_primitive("NAND", self.nand)
        _, self._exit = self._register_primitive("EXIT", self.exit)
        self._register_primitive("KEY", self.key)
        self._register_primitive("EMIT", self.emit)
        self._register_primitive(":", self.colon)
        self._register_primitive(";", self.semicolon, immediate=True)
        self._register_primitive("STATE", lambda: (self.pushd(self.state), self.next()))
        self._register_primitive("TIB", lambda: (self.pushd(self.tib), self.next()))
        self._register_primitive(">IN", lambda: (self.pushd(self.toin), self.next()))
        self._register_primitive("HERE", lambda: (self.pushd(self.here), self.next()))
        self._register_primitive(
            "LATEST", lambda: (self.pushd(self.latest), self.next())
        )

    def _register_primitive(self, name, func, immediate=False):
        _id = self.primitive_id
        self.primitives[_id] = func
        cfa = self._header(name, self.primitive_id, immediate)
        self.primitive_id += 1
        return _id, cfa

    def _register_word(self, name, cfa, immediate=False):
        return self._header(name, cfa, immediate)

    def _header(self, name, cfa_value, immediate=False):
        lfa = self.memory[self.here]
        self.memory[lfa] = self.memory[self.latest]
        self.memory[self.latest] = lfa
        self.memory[self.here] += 1

        nfa = self.memory[self.here]
        self.memory[nfa] = name
        self.memory[self.here] += 1

        ffa = self.memory[self.here]
        self.memory[ffa] = 1 if immediate else 0
        self.memory[self.here] += 1

        cfa = self.memory[self.here]
        self.memory[cfa] = cfa_value
        self.memory[self.here] += 1

        return cfa

    def decode_cfa(self, cfa):
        self.decode_addr(cfa - 3)

    def debug(self):
        self.print("= VARS")
        for var in ["rp", "sp", "latest", "here", "toin", "state"]:
            varval = getattr(self, var)
            self.print(f"  {var} = {self.memory[varval]}[{varval}]")
        self.print(f"  tib = {self.tib}")
        self.print(f"  {self.memory[self.tib : self.tib + self.memory[self.toin]]}")

    def decode_addr(self, addr):
        self.print(f"[{addr}] {self.memory[addr : addr + 4]}")
        self.print(f"  LFA = {self.memory[addr]}")
        self.print(f"  NFA = {self.memory[addr + 1]}")
        self.print(f"  FFA = {self.memory[addr + 2]}")
        self.print(f"  CFA = {self.memory[addr + 3]}")

    def decode_def(self, addr):
        self.print(f"DEF [{addr}] {self.memory[addr : addr + 4]}")
        self.print(f"  LFA = {self.memory[addr]}")
        self.print(f"  NFA = {self.memory[addr + 1]}")
        self.print(f"  FFA = {self.memory[addr + 2]}")
        self.print(f"  CFA = {self.memory[addr + 3]}")
        addr += 3
        while self.memory[addr] != self._exit:
            self.print(f"{self.memory[self.memory[addr] - 2]}", end=" ")
            addr += 1
        self.print(f"{self.memory[self.memory[addr] - 2]}")

    def printd(self):
        self.print(self.memory[self.sp0 : self.memory[self.sp] - 1 : -1])

    def next(self):
        if self._in_next:
            return
        self._in_next = True
        try:
            while self.memory[self.ip] != 0:
                self.memory[self.w] = self.memory[self.memory[self.ip]]
                self.memory[self.ip] += 1
                exec_id = self.memory[self.memory[self.w]]
                self.primitives[exec_id]()
        finally:
            self._in_next = False

    def pushd(self, value):
        self.memory[self.sp] -= 1
        self.memory[self.memory[self.sp]] = value

    def popd(self) -> Any:
        if self.memory[self.sp] == self.sp0:
            raise EmptyStack("data")
        value = self.memory[self.memory[self.sp]]
        self.memory[self.sp] += 1
        return value

    def pushr(self, value):
        self.memory[self.rp] -= 1
        self.memory[self.memory[self.rp]] = value

    def popr(self) -> int:
        if self.memory[self.rp] == self.rp0:
            raise EmptyStack("return")
        value = self.memory[self.memory[self.rp]]
        self.memory[self.rp] += 1
        return value

    def fetch(self):
        addr = self.popd()
        self.pushd(self.memory[addr])
        self.next()

    def store(self):
        addr = self.popd()
        value = self.popd()
        self.memory[addr] = value
        self.next()

    def spfetch(self):
        sp = self.memory[self.sp]
        self.pushd(sp)
        self.next()

    def spstore(self):
        value = self.popd()
        if value > self.sp0:
            raise EmptyStack("data")
        self.memory[self.sp] = value
        self.next()

    def rpfetch(self):
        self.pushd(self.memory[self.rp])
        self.next()

    def zeroeq(self):
        value = self.popd()
        self.pushd(-1 if value == 0 else 0)
        self.next()

    def add(self):
        b = self.popd()
        a = self.popd()
        self.pushd(a + b)
        self.next()

    def nand(self):
        b = self.popd()
        a = self.popd()
        self.pushd(~(a & b))
        self.next()

    def exit(self):
        self.memory[self.ip] = self.popr()
        self.next()

    def key(self):
        self.pushd(ord(readchar()))
        self.next()

    def emit(self):
        value = self.popd()
        self._writechar(value)
        self.next()

    def docol(self):
        self.pushr(self.memory[self.ip])
        self.memory[self.ip] = self.memory[self.w] + 1
        self.next()

    def colon(self):
        token = self._token()
        cfa = self._register_word(token, cfa=self.docol_id)
        self.memory[self.state] = 1  # compilation state
        self.next()

    def semicolon(self):
        here = self.memory[self.here]
        self.memory[here] = self._exit
        self.memory[self.here] += 1
        self.memory[self.state] = 0
        self.next()

    def _token(self):
        self.memory[self.tib + self.toin]
        while self.memory[self.tib + self.memory[self.toin]] in SPACES:
            self.memory[self.toin] += 1
        start = self.memory[self.toin]
        while (b := self.memory[self.tib + self.memory[self.toin]]) and b not in SPACES:
            self.memory[self.toin] += 1
        return "".join(
            [
                chr(c)
                for c in self.memory[
                    self.tib + start : self.tib + self.memory[self.toin]
                ]
            ]
        ).upper()

    def _write(self, code):
        self.memory[self.tib : len(code)] = [ord(char) for char in code]
        self.memory[self.tib + len(code)] = 0
        self.memory[self.toin] = 0

    def _writechar(self, char):
        self.print(chr(char), end="")

    def _readline(self):
        self._writechar(13)
        self._writechar(10)
        char = readchar()
        if char == RETURN:
            ...

    def find(self, word):
        lfa = self.memory[self.latest]
        word = word.upper()
        while self.memory[lfa + 1] != word and lfa != 0:
            lfa = self.memory[lfa]
        if lfa != 0:
            cfa = lfa + 3
            return cfa, self.memory[lfa + 2]
        return None, None

    def execute(self, cfa):
        self.memory[self.ip] = 0  # top-level call
        self.memory[self.w] = cfa
        self.primitives[self.memory[cfa]]()

    def compile(self, cfa):
        here = self.memory[self.here]
        self.memory[here] = cfa
        self.memory[self.here] += 1

    def interpret_word(self, word):
        cfa, immediate = self.find(word)
        if cfa is not None:
            if immediate or self.memory[self.state] == 0:
                self.execute(cfa)
            else:
                self.compile(cfa)
            return
        self.print(f"{Colors.ERROR}Unknown {word}{Colors.END}")
        self._soft_reset()

    def interpret(self):
        try:
            while True:
                word = self._token()
                if not word:
                    return True
                self.interpret_word(word)
        except EmptyStack as e:
            self.print(
                f"{Colors.ERROR}\nError! {e.args[0]} stack is empty{Colors.END}",
            )
            self._soft_reset()
            return False

    def get_stacks(self):
        return (
            self.memory[self.memory[self.sp] : self.sp0][::-1],
            self.memory[self.memory[self.rp] : self.rp0][::-1],
        )

    def boot(self):
        self._write("""
        : dup sp@ @ ;
        : -1 dup dup nand dup dup nand nand ;
        : 0 -1 dup nand ;
        : 1 -1 dup + dup nand ;
        : 2 1 1 + ;
        : 3 1 2 + ;
        : 4 2 2 + ;
        : 6 2 4 + ;
        : invert dup nand ;
        : and nand invert ;
        : negate invert 1 + ;
        : - negate + ;
        : = - 0= ;
        : <> = invert ;
        : drop sp@ 1 + sp! ;
        : over sp@ 1 + @ ;
        : swap over over sp@ 3 + ! sp@ 1 + ! ;
        : nip swap drop ;
        : 2dup over over ;
        : 2drop drop drop ;
        : or invert swap invert and invert ;
        : , here @ ! here @ 1 + here ! ;
        : 2* dup + ;
        : immediate latest @ 2 + 1 swap ! ;
        : [ 0 state ! ; immediate
        : ] 1 state ! ;
        : lit rp@ @ dup 1 + rp@ ! @ ;
        : ['] rp@ @ dup 1 + rp@ ! @ ;
        : branch rp@ @ dup @ + rp@ ! ;
        : ?branch 0= rp@ @ @ 1 - and rp@ @ + 1 + rp@ ! ;
        : >rexit rp@ ! ;
        : >r
            rp@ @
            swap rp@ !
            >rexit
        ;
        : r>
            rp@ 1 + @
            rp@ @ rp@ 1 + !
            lit [ here @ 3 + , ]
            rp@ !
        ;
        : rot >r swap r> swap ;
        : if
            ['] ?branch ,
            here @
            0 ,
            ; immediate
        : then
            dup
            here @ swap -
            swap !
            ; immediate
        : else
            ['] branch ,
            here @
            0 ,
            swap
            dup here @ swap -
            swap !
            ; immediate
        : begin
            here @
            ; immediate
        : while
            ['] ?branch ,
            here @
            0 ,
            ; immediate
        : repeat
            swap
            ['] branch , here @ - ,
            dup here @ swap - swap !
            ; immediate
        : until
            ['] ?branch , here @ - ,
            ; immediate
        : do
            here @
            ['] >r , ['] >r ,
            ; immediate
        : loop
            ['] r> , ['] r> ,
            ['] lit , 1 , ['] + ,
            ['] 2dup , ['] = ,
            ['] ?branch , here @ - ,
            ['] 2drop ,
        ; immediate
        : 0fh lit [ 4 4 4 4 + + + 1 - , ] ;
        : ffh lit [ 0fh 2* 2* 2* 2* 0fh or , ] ;
        : c@ @ ffh and ;
        : c!
            dup @
            ffh invert and
            rot ffh and
            or swap !
        ;
        : c, here @ c! here @ 1 + here ! ;
        : litstring
            rp@ @ dup 1 + rp@ ! @
            rp@ @
            swap
            2dup + rp@ !
        ;
        : type 0 do dup c@ emit 1 + loop drop ;
        : in> tib >in @ + c@ >in dup @ 1 + swap ! ;
        : bl lit [ 1 2* 2* 2* 2* 2* , ] ;
        : parse
            in> drop
            tib >in @ +
            swap 0 begin
                over in>
            <> while
                1 +
            repeat swap
            bl = if
                >in dup @ 1 - swap !
            then
        ;
        : word
            in> drop
            begin dup in> <> until
            >in @ 2 - >in !
            parse
        ;
        : [char] ['] lit , bl word drop c@ , ; immediate
        : ( [char] ) parse 2drop ; immediate
        ( finally can have comments from here! )
        : 10 ( -- 10 ) lit [ 4 4 2 + + , ] ;
        : 10h ( -- 10h ) lit [ 4 4 4 4 + + + , ] ;
        : ."
            [char] " parse
            state @ if
                ['] litstring ,
                dup ,
                0 do dup c@ c, 1 + loop drop
                ['] type ,
            else
                type
            then ; immediate
        : 0<> 0= invert ;
        : create
            :
            ['] lit ,
            here @ 2 + ,
            ['] exit ,
            0 state !
        ;
        : cells lit [ 1 , ] ;
        : allot here @ + here ! ;
        : variable create cells allot ;
        : ?dup dup ?branch [ 2 , ] dup ;
        : -rot rot rot ;
        : xor 2dup and invert -rot or and ;
        : 80h 1 2* 2* 2* 2* 2* 2* 2* ;
        : 8000h lit [ 0 c, 80h c, ] ;
        : >= - 8000h and 0= ;
        : < >= invert ;
        : <= 2dup < -rot = or ;
        : 0< 0 < ;
        : /mod
            over 0< -rot
            2dup xor 0< -rot
            dup 0< if negate then
            0 >r begin
                    over 2dup >=
                while
                    -
                    r> 1 + >r
                repeat
                drop nip
                rot if negate then
                r> rot
                if negate then ;
        : / /mod nip ;
        : mod /mod drop ;

        variable base
        10 base !
        : hex 10h base ! ;
        : decimal 10 base ! ;
        : digit
            dup 10 < if [char] 0 + else 10 - [char] A + then ;
        : space bl emit ;
        : .
            -1 swap
            dup 0< if negate -1 else 0 then
            >r
            begin base @ /mod ?dup 0= until
            r> if [char] - emit then
            begin digit emit dup -1 = until drop
            space ;

        : sp0 lit [ sp@ , ] ;

        : backspace lit [ 4 4 + , ] emit ;
        : cr lit [ 4 1 + 2* , ] emit ;
        : .s
            sp@ 0 swap begin
                dup sp0 <
            while
                2 +
                swap 1 + swap
            repeat swap
            [char] < emit dup . backspace [char] > emit space
            ?dup if
                0 do 2 - dup @ . loop
            then drop ;

        """)
        return self.interpret()

    fullboot = boot

    def minimalboot(self):
        self._write("""
            : dup sp@ @ ;
            : -1 dup dup nand dup dup nand nand ;
        """)
        return self.interpret()

    def display_stacks(self):
        self.print(
            "S",
            self.memory[self.memory[self.sp] : self.sp0],
            "R",
            self.memory[self.memory[self.rp] : self.rp0],
        )

    def dump_known_words(self):
        latest = self.memory[self.latest]
        words = []
        while latest != 0:
            words.insert(0, self.memory[latest + 1])
            latest = self.memory[latest]
        return words


import cmd


class ForthShell(cmd.Cmd):
    intro = "Welcome to the Forth shell.\nType help or ? to list commands.\n"
    prompt = "> "

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.forth = NForth()
        print("Booting Forth kernel...", end="")
        self._boot()

    def dump_words(self):
        print("Known words are (oldest to newest)")
        print(" ".join(self.forth.dump_known_words()))

    def do_dump(self, args):
        cfa, _ = self.forth.find(args)
        if cfa:
            self.forth.decode_def(cfa - 3)
        else:
            print(f"Word {args} is unknown")

    def _boot(self, mode="full"):
        self.forth._reset_machine()
        res = getattr(self.forth, f"{mode}boot")()
        if res:
            print("[OK]")
        else:
            print("[KO] An error occurred during kernel boot!")

    @override
    def default(self, line):
        self.forth._write(line)
        self.forth.interpret()

    def do_boot(self, args):
        if args not in ["full", "minimal"]:
            print("arg must be either full or minimal")
            return
        print(f"Reset the machine and start with a {args} boot...", end="")
        self._boot(args)
        self.dump_words()

    def do_help(self, arg: str):
        self.dump_words()

    def emptyline(self):
        return False

    @override
    def postcmd(self, stop: bool, line: str) -> bool:
        if stop:
            print("see you soon!")
            return stop
        self.forth.display_stacks()
        return False

    def do_bye(self, _):
        return True

    do_EOF = do_bye


if __name__ == "__main__":
    shell = ForthShell()
    shell.cmdloop()
