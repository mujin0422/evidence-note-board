"""Static contracts, not GNOME compositor tests."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/"extension/ui/boardView.js").read_text(encoding="utf-8")
styles=(root/"extension/stylesheet.css").read_text(encoding="utf-8")
rich=(root/"extension/model/richText.js").read_text(encoding="utf-8")
assert "icon_name: 'preferences-system-symbolic'" in js
assert "icon_size: 22" in js
assert "_positionSettingsButton()" in js
assert "this._hud.get_preferred_height(-1)" in js
assert "this._settingsButton.set_size(height,height)" in js
assert "this._settingsButton.set_position(left,top)" in js
assert "this._hud.set_position(left+height+gap,top)" in js
assert "evidence-settings-icon" in styles
assert "padding: 0;" in styles
assert "min-height: 0;" in styles
for value in (
    "Pango.attr_weight_new(Pango.Weight.BOLD)", "new Pango.AttrList()",
    "byteOffsetForCharacter(text,start)", "set_attributes(list)",
    "Clutter.KEY_b", "Clutter.KEY_B", "body.get_selection()",
    "richTextForNote(note)", "toggleBoldSpans(", "rebaseBoldSpans(",
    "encodeRichText(item.body.get_text(),item.boldSpans,",
    "this._scheduleNote(item.note.id)",
):
    assert value in js,value
assert "ENB_RICH_TEXT_V1" in rich
assert "model/richText.js" in (root/"scripts/install-dev.sh").read_text(encoding="utf-8")
assert '"model/richText.js"' in (root/"scripts/build-extension.sh").read_text(encoding="utf-8")
print("HUD settings icon / Ctrl+B rich-text static contracts: PASS (GNOME untested)")
