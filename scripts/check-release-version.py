#!/usr/bin/env python3
"""Fail release builds if tag, Cargo, RPM, extension or version is inconsistent."""
import json
from pathlib import Path
import re
import sys
import tomllib

ROOT=Path(__file__).resolve().parents[1]
def check(version: str, tag: str | None = None) -> None:
    if not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}",version):
        raise ValueError("Version must be stable semantic version X.Y.Z")
    with (ROOT/"backend/Cargo.toml").open("rb") as file:
        cargo=tomllib.load(file)
    if cargo["package"]["version"]!=version:
        raise ValueError("backend/Cargo.toml version mismatch")
    spec=(ROOT/"packaging/evidence-note-board.spec").read_text()
    if not re.search(r"^Version:\s+"+re.escape(version)+r"\s*$",spec,re.M):
        raise ValueError("RPM spec version mismatch")
    meta=json.loads((ROOT/"extension/metadata.json").read_text())
    if meta["uuid"]!="evidence-note-board@mujin0422.github.io":
        raise ValueError("Extension UUID mismatch")
    if meta["shell-version"]!=["50"]:
        raise ValueError("Only GNOME Shell 50 is targeted by this release")
    if tag is not None and tag!="v"+version:
        raise ValueError("Git tag must equal v"+version)
if __name__=="__main__":
    try:
        if len(sys.argv) not in (2,3):
            raise ValueError("Usage: check-release-version.py X.Y.Z [vX.Y.Z]")
        check(sys.argv[1],sys.argv[2] if len(sys.argv)==3 else None)
        print("Release version/metadata: OK")
    except ValueError as error:
        print(f"Release version invalid: {error}",file=sys.stderr)
        sys.exit(1)
