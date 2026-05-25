#!/usr/bin/env bash

isort --profile black nallely/ experiments/ tests/
black --target-version=py310 nallely visual-spiral.py external_scope.py tests experiments
(cd trevor && yarn format)
