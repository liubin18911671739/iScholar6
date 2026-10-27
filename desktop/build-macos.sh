#!/bin/sh
set -eu

cd "$(dirname "$0")"
PYTHON="${PYTHON:-python3.12}"

uv venv --clear .venv --python "$PYTHON"
uv pip install --python .venv/bin/python -e '.[build]'
.venv/bin/python -m PyInstaller --clean --noconfirm --distpath dist --workpath build iScholar.spec

echo "Built desktop/dist/iScholar.app"
