#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist"
mkdir -p "$OUT_DIR"

python3 - "$REPO_ROOT" "$OUT_DIR" <<'PY'
import pathlib
import sys
import zipfile

root = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2]) / "evidence-note-board-gnome50-poc.zip"
source = root / "extension"
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in ("extension.js", "canvasMath.js", "metadata.json", "stylesheet.css"):
        archive.write(source / name, arcname=name)
print(f"Created: {destination}")
PY
