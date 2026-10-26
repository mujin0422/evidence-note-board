#!/usr/bin/env python3
"""Validate a shippable RPM spec, offline source build and CI delivery."""
from pathlib import Path
import importlib.util
import re
import sys
import tomllib

ROOT=Path(__file__).resolve().parents[1]
with (ROOT/"backend/Cargo.toml").open("rb") as f:
    cargo=tomllib.load(f)
spec=(ROOT/"packaging/evidence-note-board.spec").read_text()
unit=(ROOT/"packaging/evidence-note-board-rpm.service").read_text()
dbus=(ROOT/"packaging/io.github.mujin0422.EvidenceNoteBoard-rpm.service").read_text()
dev=(ROOT/"packaging/evidence-note-board.service").read_text()
script=(ROOT/"scripts/build-rpm.sh").read_text()
ci=(ROOT/".github/workflows/ci.yml").read_text()
release=(ROOT/".github/workflows/release.yml").read_text()
version=cargo["package"]["version"]

def contains(text,*parts):
    for part in parts:
        assert part in text,part

contains(spec,f"Version:        {version}","License:        MIT",
    "%license LICENSE","Source0:        %{name}-%{version}.tar.gz",
    "BuildRequires:  pkgconfig(sqlite3)","Requires:       zenity",
    "Requires:       gnome-shell >= 50","Requires:       gnome-shell < 51",
    "cargo build --manifest-path backend/Cargo.toml --release --locked --offline --no-default-features",
    "cargo test --manifest-path backend/Cargo.toml --locked --offline --no-default-features",
    "%{_userunitdir}/evidence-note-board.service",
    "%{_datadir}/gnome-shell/extensions/%{uuid}/",
    "%systemd_user_post evidence-note-board.service",
    "%systemd_user_preun evidence-note-board.service",
    "%systemd_user_postun_with_restart evidence-note-board.service")
assert "cargo_generate_buildrequires" not in spec
assert "cargo-rpm-macros" not in spec
assert cargo["package"]["license"]=="MIT"
assert cargo["features"]["default"]==["bundled-sqlite"]
contains((ROOT/"LICENSE").read_text(),"MIT License")
contains(unit,"ExecStart=/usr/bin/evidence-note-boardd")
contains(dbus,"Exec=/usr/bin/evidence-note-boardd")
contains(dev,"ExecStart=%h/.local/bin/evidence-note-boardd")
contains(script,"git archive --format=tar HEAD","cargo vendor --locked",
    "rpmbuild -ba","scripts/verify-release-artifacts.py",
    "SHA256SUMS","scripts/build-extension.sh")
contains(ci,"container:","fedora:44","scripts/build-rpm.sh","actions/upload-artifact@")
contains(release,"tags:","scripts/check-release-version.py",
    "scripts/build-rpm.sh","gh release create",
    "contents: write","--verify-tag","SHA256SUMS")
assert 'password=' not in release.lower()
assert (ROOT/".github/workflows/release.yml").exists()
module=importlib.util.spec_from_file_location("release_version",ROOT/"scripts/check-release-version.py")
spec_module=module
loader=spec_module.loader
assert loader is not None
m=importlib.util.module_from_spec(spec_module)
sys.modules["release_version"]=m
loader.exec_module(m)
m.check(version,"v"+version)
try:
    m.check(version,"v999.0.0")
except ValueError:
    pass
else:
    raise AssertionError("tag/version mismatch accepted")
print("RPM spec, source vendor, release metadata and CI contracts: OK")
