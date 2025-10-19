from nallely import *
from pathlib import Path

from nallely.core.world import get_virtual_device_classes


HERE = Path(__file__).parent
doc_file = HERE / "docs" / "existing-modules.md"


def generate_neuron_doc(neuron):
    doc = neuron.__doc__
    description = "No description/documentation"
    if doc:
        summary = ""
        for line in doc.splitlines()[1:]:
            l = line.strip()
            if l and l.startswith("inputs"):
                break
            if l:
                summary += f"{l}\n"
        description = summary.strip()

    neuron_doc = f"* {neuron.__name__}: {description}\n"
    if doc:
        neuron_doc += f"""<details>
    <summary>details</summary>
```
{doc}
```
</details>\n\n"""
    return neuron_doc


vdevs = sorted([v for v in get_virtual_device_classes()], key=lambda cls: cls.__name__)

with doc_file.open("w+") as f:
    f.write(
        """# Nallely's Virtual Modules (Neurons) Documentation

This document centralize the various virtual modules (neurons) that exists in the system and provides a quick documentation to each device.\n\n"""
    )
    f.write("## Built-in Neurons\n\n")
    for cls in vdevs:
        f.write(generate_neuron_doc(cls))

    f.write("\n\n## Experimental Neurons\n\n")
    from nallely.experimental import *

    for cls in sorted(
        (dev for dev in get_virtual_device_classes() if dev not in vdevs),
        key=lambda cls: cls.__name__,
    ):
        f.write(generate_neuron_doc(cls))
