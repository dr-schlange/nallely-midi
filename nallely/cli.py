import argparse
import sys
from pathlib import Path


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="nallely",
        description="""Playground for MIDI instruments that let's you focus on your device, not the exchanged MIDI messages""",
        epilog="Current phase: Ololiuhqui",
    )
    subparsers = parser.add_subparsers(dest="command", required=False)
    run_parser = subparsers.add_parser(
        "run",
        help="Run scripts and Trevor (protocol for remote control)",
    )
    run_parser.add_argument(
        "-l",
        "--libs",
        nargs="*",
        dest="libs",
        type=Path,
        help="""Includes one or more paths (file or directory) where to look for MIDI devices API (includes those paths to Python's lib paths). The current working directory is always added, even if this option is not used. The paths that are Python files will be automatically imported.""",
    )
    run_parser.add_argument(
        "--with-trevor",
        action="store_true",
        help="Launches the Trevor protocol/websocket server",
    )
    run_parser.add_argument(
        "--serve-ui",
        action="store_true",
        help="Serves Trevor-UI, and makes it accessible from your browser. This option is only activated if '--with-trevor' is used.",
    )
    run_parser.add_argument(
        "-b",
        "--builtin-devices",
        action="store_true",
        help=f"Loads builtin MIDI devices (Korg NTS1, Korg Minilogue)",
    )
    run_parser.add_argument(
        "--experimental",
        action="store_true",
        help=f"Loads experimental virtuals devices",
    )
    run_parser.add_argument(
        "-i",
        "--init",
        type=Path,
        dest="init_script",
        help="""Path towards an init script to launch. If used with "--with-trevor", the script will be launched *before* Trevor is started.""",
    )

    generate_parser = subparsers.add_parser(
        "generate",
        help="Generate a Python API for a MIDI device",
    )
    generate_parser.add_argument(
        "-i",
        "--input",
        required=True,
        type=Path,
        help="Path to input CSV or YAML file",
    )
    generate_parser.add_argument(
        "-o",
        "--output",
        required=True,
        type=Path,
        help="Path to the file that will be generated",
    )

    return parser.parse_args(argv)


def include_lib_paths(paths):
    sys.path.extend(paths)


def main():
    args = parse_args(sys.argv[1:])
    if args.command == "run":
        if args.libs:
            include_lib_paths(args.libs)
        if args.with_trevor:
            from nallely.trevor import start_trevor

            start_trevor(
                args.builtin_devices,
                loaded_paths=args.libs,
                init_script=args.init_script,
                serve_ui=args.serve_ui,
                include_experimental=args.experimental,
            )
        elif args.init_script:
            from nallely.trevor import launch_standalone_script

            launch_standalone_script(
                args.builtin_devices,
                loaded_paths=args.libs,
                init_script=args.init_script,
                include_experimental=args.experimental,
            )
    elif args.command == "generate":
        from nallely.generator import generate_api

        generate_api(args.input, args.output)


if __name__ == "__main__":
    main()
