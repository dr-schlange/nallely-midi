from pathlib import Path


def universe_path(universe):
    return (Path.cwd() / universe).resolve()


def address2path(universe, address):
    location = universe_path(universe)
    frags = address2frags(address)
    address_file = location / (Path().with_segments(*frags)).with_suffix(".nly")
    return address_file


def address2frags(address):
    frags = [address[i : i + 2] for i in range(0, len(address), 2)]
    return frags
