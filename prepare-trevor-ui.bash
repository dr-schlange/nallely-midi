#!/usr/bin/env bash

DEST_FOLDER="trevor-ui"

mkdir -p "$DEST_FOLDER"
(cd trevor && rm -rf nodes_modules && yarn install && yarn build)
cp -r trevor/dist/* "$DEST_FOLDER"
cp -r visuals "$DEST_FOLDER"