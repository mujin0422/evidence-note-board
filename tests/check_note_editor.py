"""Phase 2 body-only editor source checks (not a GNOME compositor test)."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
code = (root / "extension/boardView.js").read_text(encoding="utf-8")
css = (root / "extension/stylesheet.css").read_text(encoding="utf-8")
helper = (root / "extension/noteContent.js").read_text(encoding="utf-8")

assert "new St.Entry(" not in code, "Removed title editor must not return"
assert "item.title" not in code, "Saving cannot depend on a title field"
assert "this._service.createNote('', ''," in code
assert "this._service.updateNote(id, '', content)" in code
assert "bodyTextForNote(note)" in code and "hasLegacyTitle(note)" in code
assert "this._notes.set(note.id, {note, actor: paper, body})" in code
assert "cursor_visible: true" in code
assert "single_line_mode: false" in code
assert "activatable: false" in code
assert "editable: true" in code and "reactive: true" in code
assert "line_wrap: true" in code
assert "global.stage.set_key_focus(body)" in code
assert "evidence-edit-title" not in css
assert "background-color: #e9d898;" in css.lower()
assert "return content ? " in helper
print("Phase 2 body-only editor source checks: OK (not GNOME UI test)")
