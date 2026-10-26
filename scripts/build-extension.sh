#!/usr/bin/env bash
# Package the exact runtime files expected by GNOME Shell into dist/.
# This script performs no installation and is safe to run in CI.
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
files = (
    "metadata.json", "extension.js", "stylesheet.css",
    "ui/boardView.js",
    "services/noteService.js",
    "input/doubleClickTracker.js", "input/holdDrag.js", "input/noteHitTest.js",
    "model/noteContent.js", "model/richText.js",
    "geometry/canvasMath.js", "geometry/boardBounds.js", "geometry/imageSizing.js",
    "geometry/noteGeometry.js", "geometry/pinMath.js", "geometry/stringMath.js",
    "core/runtimePolicy.js",
)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(source / name, arcname=name)
print(f"Đã tạo: {output}")
PY
