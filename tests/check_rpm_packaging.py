#!/usr/bin/env python3
"""Check invariants shared by the Fedora RPM spec and project metadata.

This intentionally performs only static checks, so it can run in CI without
installing Fedora's rpmbuild toolchain. A real `rpmbuild` or `mock` build is
still required before publishing a package.
"""

from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "packaging/evidence-note-board.spec"
RPM_UNIT = ROOT / "packaging/evidence-note-board-rpm.service"
RPM_DBUS = ROOT / "packaging/io.github.mujin0422.EvidenceNoteBoard-rpm.service"
DEV_UNIT = ROOT / "packaging/evidence-note-board.service"


def require(text: str, fragment: str, source: Path) -> None:
    """Raise a useful error when a packaging contract fragment is missing."""
    assert fragment in text, f"{source.relative_to(ROOT)} is missing: {fragment}"


def main() -> None:
    """Validate versions, paths, licensing, and system-library build policy."""
    cargo_path = ROOT / "backend/Cargo.toml"
    cargo = tomllib.loads(cargo_path.read_text(encoding="utf-8"))
    spec = SPEC.read_text(encoding="utf-8")
    rpm_unit = RPM_UNIT.read_text(encoding="utf-8")
    rpm_dbus = RPM_DBUS.read_text(encoding="utf-8")
    dev_unit = DEV_UNIT.read_text(encoding="utf-8")
    license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")

    package = cargo["package"]
    features = cargo["features"]
    version = package["version"]

    require(spec, f"Version:        {version}", SPEC)
    require(spec, "License:        MIT", SPEC)
    require(spec, "%license LICENSE", SPEC)
    assert package["license"] == "MIT", "backend/Cargo.toml must use MIT"
    require(license_text, "MIT License", ROOT / "LICENSE")

    assert features["default"] == ["bundled-sqlite"]
    assert features["bundled-sqlite"] == ["rusqlite/bundled"]
    require(spec, "BuildRequires:  pkgconfig(sqlite3)", SPEC)
    require(spec, "%cargo_generate_buildrequires -n", SPEC)
    require(spec, "%cargo_build -n", SPEC)
    require(spec, "%cargo_test -n", SPEC)
    require(spec, "%cargo_install -n", SPEC)

    require(spec, "%{_datadir}/gnome-shell/extensions/%{uuid}/", SPEC)
    require(spec, "%{_userunitdir}/evidence-note-board.service", SPEC)
    require(spec, "%{_datadir}/dbus-1/services/", SPEC)
    require(spec, "%systemd_user_post evidence-note-board.service", SPEC)

    require(rpm_unit, "ExecStart=/usr/bin/evidence-note-boardd", RPM_UNIT)
    require(rpm_dbus, "Exec=/usr/bin/evidence-note-boardd", RPM_DBUS)
    require(dev_unit, "ExecStart=%h/.local/bin/evidence-note-boardd", DEV_UNIT)
    assert "%h/.local" not in rpm_unit
    assert "%h/.local" not in rpm_dbus

    print("RPM packaging metadata: OK")


if __name__ == "__main__":
    main()
