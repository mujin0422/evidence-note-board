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
assert "cursor_visible: false" in code
assert "notify::key-focus" in code
assert "CARET_BLINK_MS = 530" in code
assert "body.set_cursor_visible(!body.get_cursor_visible())" in code
assert "global.stage.set_key_focus(null)" in code
assert "_blurEditorOnOutsidePress(event)" in code
assert "_stopCaretBlink();" in code
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
    "layout_manager:new Clutter.FixedLayout()",
    "body.set_position(TEXT_HORIZONTAL_PADDING,TEXT_VERTICAL_PADDING)",
    "note.height-TEXT_VERTICAL_CHROME",
    "_focusEmptyTextAt(stageX,stageY)",
    "this._focusEmptyTextAt(x,y)",
    "isEmptyTextEditorHit(note,body.get_text(),x,y,",
    "if (event.get_source()!==body)",
):
    assert token in code,token
assert "isEmptyTextEditorHit" in (root/"extension/input/noteHitTest.js").read_text()

# Caret is focus-scoped: blur on blank board, Settings, other app, note
# deletion or disable; any note can regain keyboard focus on click.
for token in (
    "CARET_BLINK_MS = 530",
    "notify::key-focus",
    "global.stage.get_key_focus()",
    "body.set_cursor_visible(!body.get_cursor_visible())",
    "global.stage.set_key_focus(null)",
    "_blurEditorOnOutsidePress(event)",
    "isTextEditorHit(note,x,y,this._view.zoom)",
    "this._stopCaretBlink();",
    "this._settingsButton?.contains(source)",
):
    assert token in code,token
