"""Phase-6 manifest/version/checksum guards; no GitHub release required."""
from pathlib import Path
import importlib.util
import json
import sys
import tempfile
import zipfile
import tomllib

root=Path(__file__).resolve().parents[1]
version=tomllib.loads((root/"backend/Cargo.toml").read_text())["package"]["version"]
paths=[
    ("check_version","scripts/check-release-version.py"),
    ("verify_artifacts","scripts/verify-release-artifacts.py"),
]
modules={}
for name,path in paths:
    spec=importlib.util.spec_from_file_location(name,root/path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    modules[name]=module
modules["check_version"].check(version,"v"+version)
for bad in ("v"+version+"-rc1","v99.9.9",""):
    try:
        modules["check_version"].check(version,bad)
    except ValueError:
        pass
    else:
        raise AssertionError("Accepted invalid tag "+bad)
with tempfile.TemporaryDirectory() as temp:
    folder=Path(temp)
    rpm=folder/f"evidence-note-board-{version}-1.fc44.x86_64.rpm"
    srpm=folder/f"evidence-note-board-{version}-1.fc44.src.rpm"
    zip_file=folder/f"evidence-note-board-{version}-gnome50.zip"
    rpm.write_bytes(b"fake test payload")  # Manifest validation, NOT RPM parsing.
    srpm.write_bytes(b"fake test payload")
    with zipfile.ZipFile(zip_file,"w") as z:
        z.writestr("extension.js","")
        z.writestr("metadata.json",json.dumps({"shell-version":["50"]}))
    assert len(modules["verify_artifacts"].verify(version,folder))==3
    zip_file.unlink()
    try:
        modules["verify_artifacts"].verify(version,folder)
    except ValueError:
        pass
    else:
        raise AssertionError("Missing GNOME extension ZIP was accepted")
print("Release versions, tag checks and artifact manifests: OK")
