"""Phase 2 regression checks. These are static, not Fedora GUI tests."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
code = (root / "extension/boardView.js").read_text(encoding="utf-8")
css = (root / "extension/stylesheet.css").read_text(encoding="utf-8")

assert "isEmptyBoardPoint(" in code
assert "event.get_source() === this._root" not in code
assert "activatable: false" in code
assert "single_line_mode: false" in code
assert "line_wrap: true" in code
assert "body.grab_key_focus();" in code
assert "background-color: transparent;" in css
assert ".evidence-edit-title:focus" in css
assert "border-image: none;" in css
print("Phase 2 editor regression: OK (static only)")
