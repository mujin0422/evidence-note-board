"""Static source contract, not a GNOME Classic/Wayland pointer test."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/"extension/boardView.js").read_text(encoding="utf-8")
tracker=(root/"extension/doubleClickTracker.js").read_text(encoding="utf-8")
bounds=(root/"extension/boardBounds.js").read_text(encoding="utf-8")

assert "_chooseImage({x,y})" in source
assert "_createNoteAtScreen(x,y)" in source
assert "Clutter.ModifierType.CONTROL_MASK" in source
assert "this._doubleClick.register(event.get_time(),x,y,mode)" in source
assert "previous.mode === mode" in tracker
assert "this._createButton" not in source
assert "this._imageButton" not in source
assert "panBy(" not in source
assert "zoomBoardAt(this._view,{x,y}," in source
assert "this._world.set_position(this._view.panX,this._view.panY)" in source
assert "maxZoomThatFits(" not in source
assert "this._boardSize=boardDimensions(" in source
assert "confineNote(note,this._boardSize.width,this._boardSize.height,1)" in source
assert "event.get_button()!==1" in source
assert "BUTTON2_MASK" not in source
assert "_confineGeometry(note" in source and "_confineAllNotes(" in source
assert "maxZoomThatFits(" in source and "confineNote(" in source
assert "noteBounds(" in bounds and "pinPosition(" in bounds
assert "action('Zoom 100%'" not in source
assert "action(\`Zoom:" not in source
print("Single-board gesture and bounds contracts: PASS (source only)")
