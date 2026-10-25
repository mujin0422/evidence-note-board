# Evidence Note Board

A **native Fedora GNOME Wayland desktop evidence board** project. The goal is a local-first noir corkboard with text/image notes, pins and red-string connections.

> **Status: Phase 1 technical proof of concept.** Only the experimental GNOME Shell background board, zoom/pan and disposable example cards are implemented. There is **no SQLite backend, persistent note editing or image import yet**. The background placement and input handling **must be verified on an actual Fedora 44 GNOME 50 Wayland session** before Phase 1 is accepted.

## Target

- Fedora Workstation 44 / GNOME Shell 50 / Wayland.
- Runs as a GNOME Shell Extension, not as a fake wallpaper window.
- On-screen dark board; illustrative cards only (not saved).
- Ctrl + mouse wheel: zoom at cursor (25–300%).
- Middle mouse drag: pan the canvas.

## Run the PoC

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
bash scripts/install-dev.sh
```

On a running GNOME session, follow the install script's instructions. For a new extension on Wayland, **log out and log in** if GNOME does not discover it; then enable it with:

```bash
gnome-extensions enable evidence-note-board@mujin0422.github.io
gnome-extensions info evidence-note-board@mujin0422.github.io
```

Open a regular window (Firefox or Terminal) and verify the board remains behind it. Test zoom/pan on an uncovered part of the desktop. If anything goes wrong:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
journalctl --user -b | grep -i 'evidence-note-board'
```

To uninstall the local development extension:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/evidence-note-board@mujin0422.github.io"
```

No sudo required. The example board does not create or change your notes or wallpaper settings.

## Verify static checks

```bash
node --check extension/extension.js
node --test tests/canvasMath.test.js
python3 tests/check_migration.py
bash scripts/build-extension.sh
```

These tests **cannot** prove compositor input/stacking behavior. Follow [the on-device test plan](docs/PHASE1_TEST_PLAN.md) for manual acceptance.

## Architecture / project structure

- `extension/` — GNOME Shell integration and canvas PoC.
- `db/migrations/` — proposed SQLite schema for Phase 2; not yet wired to a backend.
- `scripts/` — local extension installation and ZIP packaging.
- `tests/` — coordinate math and schema static tests.
- `docs/ARCHITECTURE.md` — feasibility assessment and architectural decision.
- `docs/PHASE1_TEST_PLAN.md` — GNOME Wayland manual validation.

## Roadmap

1. **PoC**: background actor and scroll/pointer interactions on real Fedora GNOME Wayland.
2. **Notes**: Rust daemon, SQLite migrations, create/edit/delete, drag and restore.
3. **Images and vintage styling**: import assets into XDG data directory.
4. **Connections**: pin geometry, red strings and persisted graph edges.
5. **Reliability**: multi-monitor, performance, settings and user session lifecycle.
6. **Distribution**: Fedora RPM, release build and installation tests.

See [architecture](docs/ARCHITECTURE.md). None of phases 2–6 is claimed complete.

## Safety

GNOME Shell extensions execute inside the compositor. Test this branch in a nested GNOME session first when possible; keep a terminal ready to disable the extension. No telemetry or remote runtime code.
