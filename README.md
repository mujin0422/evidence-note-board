# Evidence Note Board

Local-first native evidence board for **Fedora 44 / GNOME Shell 50 / Wayland**.
Text notes with Ctrl+B bold, imported photos, vintage pins, red-string
connections, large zoomable board and drag-to-pan viewport, stored in SQLite.

## Installation (Phase 6)

The Fedora RPM bundles the Rust backend, GNOME extension, D-Bus user-service
activation and backup CLI. Released assets are published only after an
intentional validated `vX.Y.Z` tag.

- [Installation and migration](docs/INSTALLATION.md) — RPM install, enable
  extension, transition from development, upgrade and uninstall.
- [Build RPM from source](packaging/README.md) — locked Cargo vendors,
  Fedora 44 rpmbuild, source RPM and SHA-256 verification.
- [Phase 6 acceptance checklist](docs/phases/PHASE_06.md) — explicit
  distinction between CI, Fedora GNOME session and official Release.

**Current Phase 6 is a Draft PR, not yet a public release.** Existing data
under `~/.local/share/evidence-note-board` must never be deleted by
installation or removal.

## Build locally

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git switch feat/phase6-fedora-rpm-release
bash scripts/build-rpm.sh
bash scripts/check-built-rpm.sh dist
(cd dist && sha256sum -c SHA256SUMS)
```

For a development-only Fedora install, run `bash scripts/setup-dev.sh`.
Do not combine developer-installed user files with the global RPM copy.
Read [INSTALLATION](docs/INSTALLATION.md) before switching.
