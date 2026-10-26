"""Static packaging checks only; does not load a GNOME compositor."""
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ext = ROOT / "extension"
meta = json.loads((ext / "metadata.json").read_text(encoding="utf-8"))

assert meta["uuid"] == "evidence-note-board@mujin0422.github.io"
assert meta["shell-version"] == ["50"]
assert meta["name"] == "Evidence Note Board"
assert "Experimental" not in meta["description"]
assert meta["version"] >= 18
assert "#111111" in (ext / "stylesheet.css").read_text(encoding="utf-8")

required = {
    "metadata.json", "extension.js", "stylesheet.css",
    "ui/boardView.js",
    "services/noteService.js",
    "input/doubleClickTracker.js", "input/holdDrag.js", "input/noteHitTest.js",
    "model/noteContent.js", "model/richText.js",
    "geometry/canvasMath.js", "geometry/boardBounds.js", "geometry/imageSizing.js",
    "geometry/noteGeometry.js", "geometry/pinMath.js", "geometry/stringMath.js",
    "core/runtimePolicy.js",
}
assert all((ext / path).is_file() for path in required)
with (ROOT / "backend/Cargo.toml").open("rb") as manifest:
    import tomllib
    version=tomllib.load(manifest)["package"]["version"]
zip_path = ROOT / f"dist/evidence-note-board-{version}-gnome50.zip"
if zip_path.exists():
    with zipfile.ZipFile(zip_path) as archive:
        assert set(archive.namelist()) == required
print("Extension static checks: OK; GNOME compositor not exercised")
