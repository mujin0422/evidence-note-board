"""Phase 4 regression checks. GUI interactions require real GNOME Wayland."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
js = (ROOT / "extension/ui/boardView.js").read_text(encoding="utf-8")
css = (ROOT / "extension/stylesheet.css").read_text(encoding="utf-8")
assert "import {PIN_SIZE, pinPosition}" in js
assert "_installPin(note)" in js
assert "_togglePinMenu(note)" in js
assert "_deletePinnedNote(note)" in js
assert "this._service.deleteNote(id)" in js
assert "this._service?.deleteNote(note.id)" not in js
assert "new St.Button({label: '×'" not in js
assert "this._startNoteDrag(event, note)" in js
assert "return this._startNoteDrag(event,note); // Hold to drag, no pan." in js
assert "this._applyPosition(this._dragNote);" in js
assert "event.get_button() === 3" in js
assert "_deletingNotes.has(note.id)" in js
assert "Xác nhận xóa" in js and "label: 'Hủy'" in js
assert "item.pin?.destroy()" in js and "_closePinMenu()" in js
for style in ("evidence-pin-stem", "evidence-pin-shadow",
              "evidence-pin-metal", "evidence-pin-head",
              "evidence-pin-glint", "evidence-pin-menu"):
    assert style in css
assert '"geometry/pinMath.js"' in (ROOT / "scripts/build-extension.sh").read_text(encoding="utf-8")
print("Pin controls and deletion source checks: OK (not GNOME UI test)")
