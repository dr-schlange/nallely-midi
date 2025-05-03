import csv
import sys
from collections import defaultdict
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
                _,
                _,
                _,
                _,
                orientation,
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
            min, max = int(cc_min_value), int(cc_max_value)
            if orientation.lower() == "centered":
                init = (min - max) // 2
            else:
                init = 0
            section = "_".join(section_split)
            sections[section][parameter_name] = {
                "description": description,
                "cc": int(cc_msb),
                "min": int(cc_min_value),
                "max": int(cc_max_value),
                "init": init,
            }
    if brand is not None and device is not None:
        return {brand: {device: {**sections}}}
    return {}


def generate_code(d: dict, out: Path | str):
    out = Path(out)
    brand = next(iter(d))
    device = next(iter(d[brand]))
    sections = d[brand][device]
    with out.open("w") as f:
        f.write(
            f'''"""
Generated configuration for the {brand} - {device}
"""\n'''
        )
        f.write("import nallely\n\n")
        for section, parameters in sections.items():
            f.write(f"class {section.capitalize()}Section(nallely.Module):\n")
            for parameter_name, config in parameters.items():
                if config == "keys_or_pads":
                    parameter_code = (
                        f"    {parameter_name} = nallely.ModulePadsOrKeys()\n"
                    )
                else:
                    cc = config["cc"]
                    min, max = config["min"], config["max"]
                    init = config["init"]
                    if init == 0:
                        init = ""
                    else:
                        init = f", init_value={init}"
                    if min == 0 and max == 127:
                        range = ""
                    else:
                        range = f", range=({min}, {max})"
                    descr = config["description"]
                    descr = f", description={descr!r}" if descr else ""
                    parameter_code = f"    {parameter_name} = nallely.ModuleParameter({cc}{range}{init}{descr})\n"
                f.write(parameter_code)
            f.write("\n\n")
        device_name = device.replace("-", "")
        f.write(f"class {device_name.capitalize()}(nallely.MidiDevice):\n")
        for section in sections:
            f.write(f"    {section}: {section.capitalize()}Section  # type: ignore\n")
        f.write("\n")
        f.write(f"    def __init__(self, device_name=None, *args, **kwargs):\n")
        f.write(f"        super().__init__(\n")
        f.write(f"            *args\n,")
        f.write(f"            device_name=device_name or {device!r},\n")
        f.write(f"            **kwargs,\n")
        f.write(f"        )\n\n")
        for section in sections:
            f.write(f"    @property\n")
            f.write(f"    def {section}(self) -> {section.capitalize()}Section:\n")
            f.write(f"        return self.modules.{section}\n\n")


def generate_api(input_path, output_path):
    yaml = YAML(typ="safe")
    if input_path.suffix == ".csv":
        device_config = convert(input_path)
        yaml.dump(device_config, input_path.with_suffix(".yaml"))
    elif input_path.suffix == ".yaml":
        device_config = yaml.load(input_path)
    else:
        print(f"File format {input_path.suffix} not supported")
        sys.exit(1)

    generate_code(device_config, output_path)


if __name__ == "__main__":
    generate_api(Path(sys.argv[1]), Path(sys.argv[2]))
