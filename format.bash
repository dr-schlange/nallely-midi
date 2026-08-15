#!/usr/bin/env bash

isort --profile black nallely/ experiments/ tests/
black --target-version=py310 nallely tests experiments
(cd trevor && yarn format)
