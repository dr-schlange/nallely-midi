import argparse
import sys
from pathlib import Path


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="nallely",
        description="""Playground for MIDI instruments that let's you focus on your device, not the exchanged MIDI messages""",
        epilog="Current phase: Ipomoea Tricolor",
    )
    parser.add_argument(
        "-l",
        "--libs",
        nargs="*",
        dest="libs",
        type=Path,
        help="""Includes one or more paths (file or directory) where to look for MIDI devices API (includes those paths to Python's lib paths). The current working directory is always added, even if this option is not used. The paths that are Python files will be automatically imported.""",
    )
    parser.add_argument(
        "--with-trevor",
        action="store_true",
        help="Activates Trevor protocol/websocket server",
    )
    parser.add_argument(
        "-b",
        "--builtin-devices",
        action="store_true",
        help=f"Loads builtin MIDI devices (Korg NTS1, Korg Minilogue)",
    )
    parser.add_argument(
        "-i",
        "--init",
        type=Path,
        dest="init_script",
        help="""Path towards an init script to launch. If used with "--with-trevor", the script will be launched *before* Trevor is started.""",
    )

    return parser.parse_args(argv)


def include_lib_paths(paths):
    sys.path.extend(paths)


def main():
    args = parse_args(sys.argv[1:])
    if args.libs:
        include_lib_paths(args.libs)
    if args.with_trevor:
        from .trevor import start_trevor

        start_trevor(args.builtin_devices, args.libs, args.init_script)


if __name__ == "__main__":
    main()
