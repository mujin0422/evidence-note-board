"""Empty-board gesture wiring: static checks, not a GNOME/Wayland UI test."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/"extension/ui/boardView.js").read_text(encoding="utf-8")
canvas=(root/"extension/geometry/canvasMath.js").read_text(encoding="utf-8")
assert "this._boardPan={start:{x,y},last:{x,y},active:false,changed:false}" in source
assert "isEmptyBoardPoint(this._view,{x,y},notes,uiRects)" in source
assert "this._doubleClick.register(event.get_time(),x,y,mode)" in source
assert "this._boardPan=null;" in source
assert "boardDragHasStarted(session.start,{x,y})" in source
assert "session.active=true;" in source
assert "this._doubleClick.reset();" in source
assert "Clutter.ModifierType.BUTTON1_MASK" in source
assert "dragBoardView(this._view,dx,dy," in source
assert "this._applyView();" in source
assert "this._scheduleView();" in source
assert "_endBoardPan()" in source
assert "const wasPanning=this._endBoardPan();" in source
assert "if (wasPanning)" in source
assert "this._persistView();" in source
assert "this._world.set_position(this._view.panX,this._view.panY)" in source
assert "this._startNoteDrag(event,note)" in source
assert "this._startNoteDrag(event, note)" in source
assert "_startTextHold(event,note)" in source
assert "Clutter.KEY_b" in source
assert "BUTTON2_MASK" not in source
assert "boardDragHasStarted" in canvas and "clampBoardCamera" in canvas
print("Board viewport hold-drag source contract: PASS (GNOME UI untested)")
