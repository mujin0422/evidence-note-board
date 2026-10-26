"""Phase 5 compact Settings and hold-drag regression checks (source-level).
Only Fedora GNOME/Wayland can validate actual compositor pointer behavior.
"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/"extension/boardView.js").read_text(encoding="utf-8")
css=(root/"extension/stylesheet.css").read_text(encoding="utf-8")
assert "this._hud.get_preferred_height(-1)" in js
assert "this._settingsButton.set_size(height,height)" in js
assert "this._settingsButton.set_position(left,top)" in js
assert "this._hud.set_position(left+height+gap,top)" in js
assert "action('Zoom 100%'" not in js
assert "action(`Zoom:" not in js
assert "const [,naturalHeight]=menu.get_preferred_height(popupWidth)" in js
assert "menu.set_size(212,198)" not in js
assert "const popupHeight=menu.height||naturalHeight||120" in js
assert "menu.set_position(" in js
assert "this._startTextHold(event,note)" in js
assert "_beginNoteDrag(note,x,y)" in js
assert "Clutter.EventType.BUTTON_RELEASE" in js
assert "this._cancelTextHold()" in js
assert "Clutter.ModifierType.BUTTON1_MASK" in js
assert "this._startNoteDrag(event,note)" in js
assert "this._startNoteDrag(event, note)" in js
assert "this._beginGrab()" not in js[
    js.index("    _startNoteDrag("):js.index("    _startPaperGesture(")]
assert "isEmptyBoardPoint(" in js
assert "this._world.set_position(0,0)" in js
assert "new Pango.AttrList()" in js
assert "Clutter.KEY_b" in js
assert "this._cancelTextHold();\n        this._cancelString();" in js
assert ".evidence-settings-button {" in css
print("Compact HUD menu and hold-drag contracts: PASS (GNOME UI untested)")
