"""Static UI checks for phase 3 interactions (not desktop end-to-end)."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = (root / "extension/boardView.js").read_text(encoding="utf-8")
backend = (root / "backend/src/db.rs").read_text(encoding="utf-8")
dbus = (root / "backend/src/main.rs").read_text(encoding="utf-8")
gtk_drop = (root / "extension/image-drop-target.py").read_text(encoding="utf-8")
required = [
    "resizedTextWidth(", "resizedImage(", "requiredPaperHeight(",
    "_syncTextHeight(note)", "get_pixel_size()", "_startResize(event, note)",
    "_rotatePhoto(note,", "_duplicatePhoto(note)", "updateGeometry(",
    "duplicateImage(", "Clutter.RotateAxis.Z_AXIS",
    "_openDropWindow()", "JSON.parse(stdout)",
]
for fragment in required:
    assert fragment in js, fragment
assert "update_geometry" in backend and "duplicate_image" in backend
assert "validate_geometry" in dbus
assert "Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)" in gtk_drop
assert "json.dumps(paths, ensure_ascii=False)" in gtk_drop
print("Phase 3 source interaction checks: OK (GNOME/GTK UI untested)")
