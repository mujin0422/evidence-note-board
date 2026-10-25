"""Static packaging checks only; does not load a GNOME compositor."""
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ext = ROOT / "extension"
meta = json.loads((ext / "metadata.json").read_text(encoding="utf-8"))

assert meta["uuid"] == "evidence-note-board@mujin0422.github.io"
assert meta["shell-version"] == ["50"]
assert "#111111" in (ext / "stylesheet.css").read_text(encoding="utf-8")

required = {"metadata.json", "extension.js", "boardView.js",
            "canvasMath.js", "noteService.js", "doubleClickTracker.js",
            "noteHitTest.js", "noteContent.js", "geometry.js", "stylesheet.css", "image-drop-target.py"}
assert all((ext / path).is_file() for path in required)
zip_path = ROOT / "dist/evidence-note-board-gnome50-phase2.zip"
if zip_path.exists():
    with zipfile.ZipFile(zip_path) as archive:
        assert set(archive.namelist()) == required
print("Extension static checks: OK; GNOME compositor not exercised")
