"""Static checks for border gestures and removed Phase 3 controls.

CI cannot prove GNOME compositor hit-testing: verify on Fedora Wayland.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = (root / "extension/ui/boardView.js").read_text(encoding="utf-8")
helper = (root / "extension/geometry/noteGeometry.js").read_text(encoding="utf-8")
service = (root / "extension/services/noteService.js").read_text(encoding="utf-8")
db = (root / "backend/src/db.rs").read_text(encoding="utf-8")
dbus = (root / "backend/src/main.rs").read_text(encoding="utf-8")
installer = (root / "scripts/install-dev.sh").read_text(encoding="utf-8")
bundle = (root / "scripts/build-extension.sh").read_text(encoding="utf-8")

for fragment in (
    "gestureAt(", "transform_stage_point(", "pointerAngle(",
    "angleDelta(", "normalizeAngle(", "get_pixel_size()",
    "resizedImage(", "resizedTextWidth(", "_connectPaperGestures(",
    "updateGeometry(", "Clutter.RotateAxis.Z_AXIS",
    "St.TextureCache.get_default()", "texture.load_file_async(",
    "Clutter.ContentGravity.RESIZE_ASPECT",
):
    assert fragment in js, fragment

for fragment in ("_dropButton", "_openDropWindow", "_dropProcess", "_duplicatePhoto",
                 "duplicateImage(", "new Gio.FileIcon(",
                 "_rotatePhoto(", "_startResize("):
    assert fragment not in js, fragment
assert "new St.Icon(" not in js[js.index("    _renderImageNote("):js.index("    _press(event)")]
assert "DuplicateImage" not in service
assert "duplicate_image" not in db and "duplicate_image" not in dbus
assert "image-drop-target.py" not in bundle
assert "rm -f \"$TARGET/image-drop-target.py\"" in installer
assert "export function gestureAt(" in helper
assert "PHOTO_H_MARGIN" in helper and "PHOTO_V_MARGIN" in helper
print("Phase 3 border-gesture and removal checks: OK (not GNOME UI acceptance)")
