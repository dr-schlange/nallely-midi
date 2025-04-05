from collections import defaultdict
import csv
from pathlib import Path
from ruamel.yaml import YAML


def convert(path: Path | str):
    path = Path(path)
    with path.open("r") as p:
        reader = csv.reader(p)
        brand = None
        device = None
        sections = defaultdict(dict)
        next(reader)  # we skip the header
        for row in reader:
            (
                brand,
                device,
                section,
                parameter_name,
                description,
                cc_msb,
                _,
                cc_min_value,
                cc_max_value,
                *_,
            ) = row
            section_split = [s.lower().replace("-", "_") for s in section.split()]
            parameter_name_split = [
                s.lower().replace("-", "") for s in parameter_name.split()
            ]
            if section_split[0] == parameter_name_split[0]:
                if (
                    len(parameter_name_split) >= 2
                    and parameter_name_split[1].isdecimal()
                ):
                    parameter_name = "_".join(parameter_name_split)
                else:
                    parameter_name = "_".join(parameter_name_split[1:])
            else:
                parameter_name = "_".join(parameter_name_split)
            section = "_".join(section_split)
            sections[section][parameter_name] = {
                "description": description,
                "cc": int(cc_msb),
                "min": int(cc_min_value),
                "max": int(cc_max_value),
            }
    if brand is not None and device is not None:
        device = device.replace("-", "")
        return {brand: {device.capitalize(): {**sections}}}
    return {}


def generate_code(d: dict, out: Path | str):
    out = Path(out)
    brand = next(iter(d))
    device = next(iter(d[brand]))
    sections = d[brand][device]
    with out.open("w") as f:
        f.write(f'''"""
Generated configuration for the {brand} - {device}
"""\n''')
        f.write("import nallely\n\n")
        for section, parameters in sections.items():
            f.write(f"class {section.capitalize()}Section(nallely.Module):\n")
            f.write(f"    state_name = {section.lower()!r}\n")
            for parameter_name, config in parameters.items():
                cc = config["cc"]
                min, max = config["min"], config["max"]
                if min == 0 and max == 127:
                    range = ""
                else:
                    range = f", range=({min}, {max})"
                descr = config["description"]
                descr = f", description={descr!r}" if descr else ""
                parameter_code = f"    {parameter_name} = nallely.ModuleParameter({cc}{range}{descr})\n"
                f.write(parameter_code)
            f.write("\n\n")
        f.write(f"class {device}(nallely.MidiDevice):\n")
        f.write(f"    def __init__(self, device_name=None, *args, **kwargs):\n")
        f.write(f"        super().__init__(\n")
        f.write(f"            *args, device_name=device_name or {device!r},\n")
        f.write(f"            modules_descr=[\n")
        for section in sections:
            f.write(f"                {section.capitalize()}Section,\n")
        f.write(f"            ],\n")
        f.write( "            **kwargs,\n")
        f.write( "       )\n\n")


if __name__ == "__main__":
    import sys

    csv_file = Path(sys.argv[1])
    d = convert(csv_file)
    yaml = YAML(typ="safe")
    yaml.dump(d, csv_file.with_suffix('.yaml'))

    out_code = Path(sys.argv[2])
    generate_code(d, out_code)
