"""Cross-layer D-Bus, draw and drag release regression (static, not compositor)."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/"extension/ui/boardView.js").read_text(encoding="utf-8")
service=(root/"extension/services/noteService.js").read_text(encoding="utf-8")
backend=(root/"backend/src/db.rs").read_text(encoding="utf-8")
dbus=(root/"backend/src/main.rs").read_text(encoding="utf-8")
for method in ("ListConnections", "CreateConnection", "DeleteConnection"):
    assert method in service
for method in ("list_connections", "create_connection", "delete_connection"):
    assert method in backend and method in dbus
assert "INSERT INTO pins" in backend
assert "JOIN pins" in backend
assert "FOREIGN KEY" in (root/"db/migrations/0001_init.sql").read_text(encoding="utf-8").upper() or (
    "ON DELETE CASCADE" in (root/"db/migrations/0001_init.sql").read_text(encoding="utf-8"))
for snippet in (
    "new St.DrawingArea(", "area.get_context()", "cr.$dispose()",
    "global.stage.connect('captured-event'", "Clutter.EventType.BUTTON_RELEASE",
    "Clutter.ModifierType.BUTTON1_MASK", "_releaseAsAborted()",
    "this._stringDraft", "_completeString(", "_cancelString()",
    "nearestTargetPin(", "this._stringsLayer?.queue_repaint()",
    "this._root.add_child(menu)", "menuNearPin(", "this._removeString(",
):
    assert snippet in js, snippet
assert "this._beginGrab()" not in js[js.index("    _startNoteDrag("):js.index("    _startPaperGesture(")]
assert '"geometry/stringMath.js"' in (root/"scripts/build-extension.sh").read_text(encoding="utf-8")
print("Red strings, capture-release and screen menu wiring: OK (static only)")
