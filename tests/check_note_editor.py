"""Phase 2 body-only editor source checks (not a GNOME compositor test)."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
code = (root / "extension/ui/boardView.js").read_text(encoding="utf-8")
css = (root / "extension/stylesheet.css").read_text(encoding="utf-8")
rich = (root / "extension/model/richText.js").read_text(encoding="utf-8")

assert "new St.Entry(" not in code, "Removed title editor must not return"
assert "item.title" not in code, "Saving cannot depend on a title field"
assert "this._service.createNote('', ''," in code
assert "this._service.updateNote(id, '', content)" in code
assert "richTextForNote(note)" in code and "hasLegacyTitle(note)" in code
assert "this._notes.set(note.id, item)" in code
assert "cursor_visible: true" in code
assert "single_line_mode: false" in code
assert "activatable: false" in code
assert "editable: true" in code and "reactive: true" in code
assert "line_wrap: true" in code
assert "global.stage.set_key_focus(body)" in code
assert "evidence-edit-title" not in css
assert "background-color: #e9d898;" in css.lower()
assert "const prefix=doc.text?title+'\\n':title" in rich
print("Phase 2 body-only editor source checks: OK (not GNOME UI test)")

# Regression for zero-length text: the editor must not collapse and must
# refocus even when GNOME picks the board instead of the paper.
for token in (
    "x_expand: true,", "y_expand: true,",
    "x_align: Clutter.ActorAlign.FILL",
    "y_align: Clutter.ActorAlign.FILL",
    "_focusEmptyTextAt(stageX,stageY)",
    "this._focusEmptyTextAt(x,y)",
    "if (!note) {",
    "note=this._focusEmptyTextAt(x,y);",
    "isEmptyTextEditorHit(note,body.get_text(),x,y,",
    "if (event.get_source()!==body)",
):
    assert token in code,token
assert "isEmptyTextEditorHit" in (root/"extension/input/noteHitTest.js").read_text()
