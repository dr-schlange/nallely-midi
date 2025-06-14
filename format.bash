#!/usr/bin/env bash

isort --profile black nallely/ experiments/ tests/
black nallely visual-spiral.py external_scope.py tests experiments
(cd trevor && yarn format)
