#!/usr/bin/env python3
"""Static guards for the app's idle CPU, RAM, and wakeup optimizations."""

from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[1]
VIEW = (ROOT / "extension/ui/boardView.js").read_text(encoding="utf-8")
MAIN = (ROOT / "backend/src/main.rs").read_text(encoding="utf-8")
CARGO = tomllib.loads((ROOT / "backend/Cargo.toml").read_text(encoding="utf-8"))
INSTALLER = (ROOT / "scripts/install-backend-dev.sh").read_text(encoding="utf-8")

# The always-on D-Bus daemon must not allocate Tokio's multi-thread pool.
assert '#[tokio::main(flavor = "current_thread")]' in MAIN
tokio_features = CARGO["dependencies"]["tokio"]["features"]
assert "rt" in tokio_features
assert "rt-multi-thread" not in tokio_features
assert 'install -s -m 0755 "$ROOT/backend/target/release/evidence-note-boardd"' in INSTALLER

# Never decode an imported photo at unrestricted source resolution in Shell.
image_section = VIEW[VIEW.index("    _renderImageNote("):VIEW.index("    _press(event)")]
assert "const photoWidth=" in image_section
assert "boundedImageDecodeSize(photoWidth,photoHeight,paintScale)" in image_section
assert "load_file_async(file, -1, -1" not in image_section
assert "_persistGeometry(item.note)" in VIEW
assert "this._applyPosition(this._dragNote)" in VIEW
assert "this._bodyNotes.get(event.get_source())" in VIEW

# High-frequency pan events must not relayout identical HUD text or repaint a
# hidden Cairo wire layer.
assert "if (text===this._statusText)" in VIEW
assert "_queueStrings(force=false)" in VIEW
assert "if (!force && !this._preferences.show_strings)" in VIEW
assert "this._queueStrings(true);" in VIEW

print("Idle CPU/RAM resource-efficiency contracts: OK (static only)")
