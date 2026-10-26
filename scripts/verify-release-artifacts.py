#!/usr/bin/env python3
"""Validate binary RPM, source RPM and ZIP names/presence before uploading."""
import json
from pathlib import Path
import re
import sys
import zipfile

def verify(version: str, folder: Path) -> list[Path]:
    rpm=sorted(folder.glob(f"evidence-note-board-{version}-*.x86_64.rpm"))
    srpm=sorted(folder.glob(f"evidence-note-board-{version}-*.src.rpm"))
    zip_path=folder/f"evidence-note-board-{version}-gnome50.zip"
    if len(rpm)!=1 or len(srpm)!=1 or not zip_path.is_file():
        raise ValueError(f"Require exactly one RPM, one SRPM and one extension ZIP in {folder}")
    if not all(re.fullmatch(r"evidence-note-board-"+re.escape(version)+r"-1(?:\.[^.]+)?\.x86_64\.rpm",p.name) for p in rpm):
        raise ValueError(f"Unexpected binary RPM naming: {rpm}")
    with zipfile.ZipFile(zip_path) as archive:
        names=set(archive.namelist())
        if "metadata.json" not in names or "extension.js" not in names:
            raise ValueError("GNOME ZIP does not contain extension root files")
        metadata=json.loads(archive.read("metadata.json"))
        if metadata.get("shell-version")!=["50"]:
            raise ValueError("ZIP is not GNOME Shell 50 compatible")
    return rpm+srpm+[zip_path]

if __name__=="__main__":
    try:
        if len(sys.argv)!=3:
            raise ValueError("Usage: verify-release-artifacts.py VERSION dist_dir")
        paths=verify(sys.argv[1],Path(sys.argv[2]))
        print("Release artifacts: OK: "+", ".join(x.name for x in paths))
    except (OSError,ValueError,zipfile.BadZipFile) as error:
        print(f"Invalid release artifacts: {error}",file=sys.stderr)
        sys.exit(1)
