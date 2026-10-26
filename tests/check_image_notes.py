"""Static checks only: the GNOME compositor is NOT loaded in CI."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
frontend = (root / "extension/boardView.js").read_text(encoding="utf-8")
service = (root / "extension/noteService.js").read_text(encoding="utf-8")
backend = (root / "backend/src/db.rs").read_text(encoding="utf-8")
assets = (root / "backend/src/assets.rs").read_text(encoding="utf-8")
assert "ImportImageAsync" in service
assert "Gio.Subprocess.new(" in frontend
assert "St.TextureCache.get_default()" in frontend
assert "texture.load_file_async(" in frontend
assert "Clutter.ContentGravity.RESIZE_ASPECT" in frontend
assert "new St.Icon(" not in frontend[frontend.index("    _renderImageNote("):frontend.index("    _press(event)")]
assert "new Gio.FileIcon" not in frontend
assert "if (note.type === 'image')" in frontend
assert "this._imagePicker?.force_exit();" in frontend
assert "MAX_BYTES" in assets and "MAX_PIXELS" in assets
assert "image::guess_format" in assets
assert "fs::remove_file(path)" in backend
assert "CREATE TABLE IF NOT EXISTS assets" in (
    root / "db/migrations/0001_init.sql").read_text(encoding="utf-8")
print("Image note static checks: OK (not GNOME UI test)")
