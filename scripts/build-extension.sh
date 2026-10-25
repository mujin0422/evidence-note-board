#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
mkdir -p "$OUT"

python3 - "$ROOT" "$OUT" <<'PY'
import pathlib
import sys
import zipfile

root = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2]) / "evidence-note-board-gnome50-phase2.zip"
source = root / "extension"
files = ("metadata.json", "extension.js", "boardView.js",
         "canvasMath.js", "noteService.js", "doubleClickTracker.js",
         "noteHitTest.js", "noteContent.js", "geometry.js", "pinMath.js", "stringMath.js", "stylesheet.css")
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(source / name, arcname=name)
print(f"Đã tạo: {output}")
PY
