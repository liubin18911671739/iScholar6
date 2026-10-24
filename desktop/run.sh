#!/bin/sh
set -eu

cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3.12 -m venv .venv
fi
.venv/bin/python -m pip install -e .
exec .venv/bin/ischolar-desktop "$@"
