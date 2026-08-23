"""
Minimal forth.

Host interpreter is inspired by sectorforth https://github.com/cesarblum/sectorforth/tree/master
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


SPACE = ord(" ")
SPACES = [ord(" "), ord("\n"), ord("\t"), ord("\r")]
LPAR = ord("(")
RPAR = ord(")")
DQUOTE = ord('"')
DOT = ord(".")
RETURN = 13


@dataclass
class NForth:
    w: int = 0
    cell_size: int = 1
    ip: int = 0
    memory: list[Any] = field(default_factory=lambda: [0] * 0x3FFFC)
    sp0: int = 0x3FFF8
    rp0: int = 0x1DBF8
    origin: int = 0x4020
    here: int = 0x4018
    latest: int = 0x4010
    toin: int = 0x4008
    state: int = 0x4000
    tib: int = 0x0000

    def __post_init__(self):
        self._reset_machine()
        self.primitive_id: int = 0
        self.primitives = {}
        self._in_next = False
        self._setup_primitives()

    def _reset_machine(self):
        self.memory[self.toin] = 0
        self.memory[self.tib : self.tib + self.state] = [0] * (self.state - self.tib)
        self.memory[self.here] = self.origin
        self.memory[self.latest] = 0
        self.sp = self.sp0
        self.rp = self.rp0

    def _soft_reset(self):
        self.sp = self.sp0
        self.rp = self.rp0

    def _setup_primitives(self):
        self.docol_id, _ = self._register_primitive("docol", self.docol)
        self._register_primitive("@", self.fetch)
        self._register_primitive("!", self.store)
        self._register_primitive("SP@", self.spfetch)
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
        # self._register_primitive(".", self.dot)

    # def dot(self):
    #     print(self.memory[self.sp])
    #     self.next()

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
        print("= VARS")
        for var in ["rp", "sp", "latest", "here", "toin", "state"]:
            varval = getattr(self, var)
            print(f"  {var} = {self.memory[varval]}[{varval}]")
        print(f"  tib = {self.tib}")
        print(f"  {self.memory[self.tib : self.tib + self.memory[self.toin]]}")

    def decode_addr(self, addr):
        print(f"[{addr}] {self.memory[addr : addr + 4]}")
        print(f"  LFA = {self.memory[addr]}")
        print(f"  NFA = {self.memory[addr + 1]}")
        print(f"  FFA = {self.memory[addr + 2]}")
        print(f"  CFA = {self.memory[addr + 3]}")

    def decode_def(self, addr):
        print(f"DEF [{addr}] {self.memory[addr : addr + 4]}")
        print(f"  LFA = {self.memory[addr]}")
        print(f"  NFA = {self.memory[addr + 1]}")
        print(f"  FFA = {self.memory[addr + 2]}")
        print(f"  CFA = {self.memory[addr + 3]}")
        addr += 3
        while self.memory[addr] != self._exit:
            print(f"{self.memory[self.memory[addr] - 2]}", end=" ")
            addr += 1
        print(f"{self.memory[self.memory[addr] - 2]}")

    def printd(self):
        print(self.memory[self.sp0 : self.sp - 1 : -1])

    def next(self):
        if self._in_next:
            return
        self._in_next = True
        try:
            while self.ip != 0:
                self.w = self.memory[self.ip]
                self.ip += 1
                exec_id = self.memory[self.w]
                self.primitives[exec_id]()
        finally:
            self._in_next = False

    def pushd(self, value):
        self.sp -= 1
        self.memory[self.sp] = value

    def popd(self, count=1):
        value = self.memory[self.sp : self.sp + count]
        self.sp += count
        return value[0] if count == 1 else value

    def pushr(self, value):
        self.rp -= 1
        self.memory[self.rp] = value

    def popr(self, count=1):
        value = self.memory[self.rp : self.rp + count]
        self.rp += count
        return value[0] if count == 1 else value

    def fetch(self):
        addr = self.popd()
        self.pushd(self.memory[addr])
        self.next()

    def store(self):
        addr, value = self.popd(2)
        self.memory[addr] = value
        self.next()

    def spfetch(self):
        sp = self.sp
        self.pushd(sp)
        self.next()

    def rpfetch(self):
        self.pushd(self.rp)
        self.next()

    def zeroeq(self):
        value = self.popd()
        self.pushd(-1 if value == 0 else 0)
        self.next()

    def add(self):
        b, a = self.popd(2)
        self.pushd(a + b)
        self.next()

    def nand(self):
        b, a = self.popd(2)
        self.pushd(~(a & b))
        self.next()

    def exit(self):
        self.ip = self.popr()
        self.next()

    def key(self):
        self.pushd(ord(readchar()))
        self.next()

    def emit(self):
        value = self.popd()
        self._writechar(value)
        self.next()

    def docol(self):
        self.pushr(self.ip)
        self.ip = self.w + 1
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
        print(chr(char), end="")

    def _readline(self):
        self._writechar(13)
        self._writechar(10)
        char = readchar()
        if char == RETURN:
            ...

    def find(self, word):
        lfa = self.memory[self.latest]
        while self.memory[lfa + 1] != word and lfa != 0:
            lfa = self.memory[lfa]
        if lfa != 0:
            cfa = lfa + 3
            return cfa, self.memory[lfa + 2]
        return None, None

    def execute(self, cfa):
        self.ip = 0  # top-level call
        self.w = cfa
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
        print(f"Unknown {word}")
        self._soft_reset()

    def interpret(self):
        while True:
            word = self._token()
            if not word:
                return
            self.interpret_word(word)

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
        : drop dup - + ;
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
        self.interpret()

    def boot2(self):
        self._write("""


        """)
        self.interpret()

    def display_stacks(self):
        print("S", self.memory[self.sp : self.sp0])
        print("R", self.memory[self.rp : self.rp0])


import cmd


class ForthShell(cmd.Cmd):
    intro = "Welcome to the Forth shell.\nType help or ? to list commands.\n"
    prompt = "> "

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.forth = NForth()
        print("Booting Forth kernel...", end="")
        self.forth.boot()
        print("[OK]")

    @override
    def default(self, line):
        self.forth._write(line)
        self.forth.interpret()

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


shell = ForthShell()
shell.cmdloop()
