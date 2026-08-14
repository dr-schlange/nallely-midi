import argparse
import sys
from pathlib import Path

_LINUX = sys.platform.startswith("linux")


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="nallely",
        description="""Modular MIDI brain for MIDI instruments that let's you focus on your device, not the exchanged MIDI messages""",
        epilog="Current phase: Tepezcohuite",
    )
    parser.add_argument(
        "--version", action="version", version="Nallely v0.7.0 -- Tepezcohuite"
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
        help="""Includes one or more paths (file or directory) where to look for MIDI devices API (includes those paths to Python's lib paths). The current working directory is always added, even if this option is not used. The paths that are Python files will be automatically imported""",
    )
    run_parser.add_argument(
        "--with-trevor",
        action="store_true",
        help="Launches the Trevor protocol/websocket server",
    )
    run_parser.add_argument(
        "--serve-ui",
        action="store_true",
        help="Serves Trevor-UI, and makes it accessible from your browser. This option is only activated if '--with-trevor' is used",
    )
    run_parser.add_argument(
        "-b",
        "--builtin-devices",
        action="store_true",
        help="Loads builtin MIDI devices (Korg NTS1, Korg Minilogue)",
    )
    run_parser.add_argument(
        "--experimental",
        action="store_true",
        help="Loads experimental virtuals devices",
    )
    run_parser.add_argument(
        "-i",
        "--init",
        type=Path,
        dest="init_script",
        help="""Path towards an init script/patch to launch. If used with "--with-trevor", the script will be launched *before* Trevor is started; accepted formats=[.py, .nly]""",
    )
    run_parser.add_argument(
        "-a",
        "--address",
        help="""Address to load from the git-store memory. The format must be XXXX where X is an hexadecimal value.""",
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

    if _LINUX:
        fs_parser = subparsers.add_parser("fs", help="Handles NallelyFS")
        fs_subparsers = fs_parser.add_subparsers(dest="fs_action", required=True)
        mount_parser = fs_subparsers.add_parser("mount", help="Mount NallelyFS")
        mount_parser.add_argument(
            "mount_path", type=Path, help="Path to the mounting point"
        )
        fs_subparsers.add_parser("umount", help="Unmount NallelyFS")
        # umount_parser.add_argument("umount_path", type=Path, nargs="?", help="Optional path to unmount")

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
                address=args.address,
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
        from nallely.codegen import generate_api

        generate_api(args.input, args.output)
    elif args.command == "fs":
        import json

        from websockets.sync.client import connect

        if args.fs_action == "mount":
            try:
                with connect("ws://localhost:6788/trevor") as ws:
                    response = ws.recv()  # First we receive the full state
                    ws.send(
                        json.dumps(
                            {
                                "command": "mount_nallelyfs",
                                "mountpoint": f"{args.mount_path.resolve()}",
                            }
                        )
                    )
                    response = ws.recv()
                    if response != '"OK"':
                        print(
                            f"[NALLELYFS] Couldn't mount {args.mount_path}... {response}"
                        )
            except Exception as e:
                print("[NALLELYFS]", e)
                print(
                    "[NALLELYFS] Couldn't mount the NallelyFS, check if a Nallely session is running localhost and try again"
                )
        else:
            try:
                with connect("ws://localhost:6788/trevor") as ws:
                    response = ws.recv()  # First we receive the full state
                    ws.send(json.dumps({"command": "umount_nallelyfs"}))
                    response = ws.recv()
                    if response != '"OK"':
                        print(
                            f"[NALLELYFS] Couldn't umount the filesystem... {response}"
                        )
            except Exception as e:
                print("[NALLELYFS]", e)
                print(
                    "[NALLELYFS] Couldn't umount the NallelyFS, check if a Nallely session is running localhost and try again"
                )

    else:
        from nallely.trevor.trevor_bus import _print_with_trevor

        welcome = """-= Welcome to Nallely a small organic live programmable modular brain =-

To launch a session with the Trevor protocol and UI, use the "run" subcommand:

    $ nallely run --with-trevor --serve-ui

You can then browse to http://localhost:3000 to open Trevor-UI.
The "--help" option will give you information about the options you can use:

    $ nallely run --help

To generate the Python code API for one of your MIDI device configuration use the "generate" subcommand:

    $ nallely generate -i MYDEVICE.yaml -o MYDEVICE.py
"""
        if _LINUX:
            welcome += """Once you started a Nallely session, you can mount it as file system using
    $ nallely fs mount MY_MOUNTING_POINT
            """
        _print_with_trevor(welcome)


if __name__ == "__main__":
    main()
