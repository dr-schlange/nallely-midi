#!/usr/bin/env python

import sys
from setuptools import setup


version = tuple(sys.version_info[:2])

packages = ["nallely"]

setup(
    name="nallely",
    version="0.0.1",
    description=(
        "MIDI companion, tools and abstraction to easily scripts for your MIDI devices"
    ),
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    keywords="music,midi,midi-device,midi-controller,lfo",
    url="https://github.com/dr-schlange/nallely-midi",
    author="dr-schlange",
    author_email="drcoatl@proton.me",
    packages=packages,
    package_data={"": ["README.md", "LICENSE", "CHANGELOG.md"]},
    include_package_data=True,
    # tests_require=['pytest'],
    requires=["mido", "websockets", "plotext", "wrapt"],
    license="BSD 3-Clause",
    classifiers=[
        "Development Status :: 2 - Pre-Alpha",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3.8",  # some versions are not tested
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Programming Language :: Python :: 3.13",
        "Operating System :: OS Independent",
        "Intended Audience :: Developers",
        "Intended Audience :: Other Audience",
        "Topic :: Software Development",
        "Topic :: Software Development :: Libraries",
        "License :: OSI Approved :: BSD License",
    ],
)
