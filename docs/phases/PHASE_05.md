# Phase 05 — Production Integration

**Status:** Phase 5 implementation merged; follow-up fix scopes desktop support
to a single screen. Runtime recovery and performance still require Fedora testing.

Phase 5 originally listed autostart, multi-monitor, error recovery,
Settings and performance. **Multi-monitor support has been explicitly removed
from the product scope at the user's request.** The application now targets
one Fedora GNOME Classic screen. RPM/release automation remains Phase 6.

## Implemented

1. **Autostart**: existing user systemd `Type=dbus`, `WantedBy=default.target`,
   D-Bus activation and extension name-owner watcher from PR #12. No
   duplicate daemon or root login requirements.
2. **Single-screen layout**: HUD/+Note/+Image/Settings always use
   fixed top-left stage coordinates. New notes/photos from toolbar appear
   at the center of the active stage. Stage resize still updates the
   background and the Cairo string layer. No monitor detection, primary
   monitor selection, hot-plug handling or mixed-DPI behavior is promised.
3. **Error recovery**: exponential reconnect retry 600ms up to 15s;
   backend's D-Bus owner watcher remains authoritative. In-memory dirty
   note contents and view are kept when the service vanishes; when it
   returns, the last text and camera are re-sent asynchronously, and
   the persisted DB objects aren't cleared/recreated.
   No guarantee that unflushed text survives a GNOME Shell process
   crash or power loss; see acceptance criteria.
4. **Settings**: compact ⚙ menu for HUD on/off, red strings on/off,
   zoom step (1.1/1.25) and reset zoom. Typed D-Bus
   `GetSettings/SaveSettings`; Rust writes
   `~/.config/evidence-note-board/settings.json` atomically, user
   permissions 0600. An invalid settings file is kept and defaults used.
   SQLite schema v1 stays unchanged. No settings GUI process/large sidebar.
5. **Performance**: coalesce red-string redraws into at most one request
   every ~16ms while interacting; cull strings fully offscreen (85px
   sag margin) prior to Cairo draw; keep serialized, event-end DB writes.
   Repaint limiter is a scheduling mechanism, NOT measured 60 FPS.
6. **Backup and recovery**: `scripts/backup-board.py` uses SQLite's
   online backup API, copies referenced assets and verifies DB integrity,
   foreign keys and SHA256. Explicit restore requires `--confirm`,
   refuses while the user service is active and preserves old DB/WAL/
   assets under `restore-rollback/`. No network dependency.

## Acceptance checklist (Fedora GNOME Classic 50.5 Wayland)

- [ ] Login automatically starts the user service; notes/assets/strings
      return without manual `systemctl restart`
- [ ] One monitor: toolbar and all controls clickable; normal desktop
      stacking/Overview preserved, screen resolution changes work
- [ ] Single-monitor scaling: note hitboxes, menu, cursor and string
      endpoints remain aligned
- [ ] GNOME Shell restart/service crash: service reconnects; existing
      text, pictures and strings are not duplicated or deleted
- [ ] Stop/restart backend while typing then continue: unsaved text
      eventually appears in SQLite (no silent data loss)
- [ ] ⚙ toggles persist after logout/login; settings file is owner-only
- [ ] 10/100/500 note + 1,000 connection scenarios: measure FPS, CPU idle
      and RAM on actual Fedora; no unverified 60 FPS claims
- [ ] Backup/verify/restore with a disposable test dataset (avoid using
      irreplaceable note data on first restore attempt)
- [ ] No JS ERROR, frozen Shell, or broken focus/Overview when opening
      Firefox/Terminal on the same display

## Run

```bash
git fetch origin
git switch -c fix/phase5-single-screen-install-output --track origin/fix/phase5-single-screen-install-output
bash scripts/setup-dev.sh
# Logout/login GNOME Wayland once to reload extension source.
```

### Backup and recovery (safe commands)

```bash
python3 scripts/backup-board.py backup
python3 scripts/backup-board.py verify ~/.local/share/evidence-note-board/backups/<folder>
```

Restore is **explicit and destructive to live state**; it preserves an
automatic rollback but needs a confirmed backup and a stopped user
service. Disable the extension first, then stop service and run:
```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user stop evidence-note-board.service
python3 scripts/backup-board.py restore /path/to/snapshot --confirm
systemctl --user start evidence-note-board.service
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

## Not yet verified

- Multi-monitor/mixed-DPI support is intentionally out of scope.
  Single-screen GNOME UI interactions still require Fedora testing.
- Offline dirty buffer is volatile while GNOME Shell process is alive;
  guaranteed crash recovery of unsaved editing requires future journal
  or save-on-type design.
- CPU synthetic geometry benchmark is not a GPU/frame benchmark.
- Multiple displays, independent boards, true infinite canvas and
  distribution RPM are outside this product's current scope.

## 26/10/2026 — Single-screen scope adjustment & installer output

Following on-device installation feedback:
- `cargo build --release` finished successfully. The only Rust warning was
  unused `Path` in `settings.rs`; removed the unused import.
- `setup-dev.sh` already starts and enables the backend. Updated
  `install-dev.sh` to check the user service and only suggest setup when
  it is not active, rather than always printing a misleading prerequisite.
- Removed `primaryMonitor`, `toolbarLayout`, the `monitors-changed`
  listener and monitor-specific UI tests. `singleScreenLayout` uses
  stage dimensions and fixed top-left controls; notes/photos are created
  at stage center.
- No changes to `evidence.db`, image assets, red strings or saved settings.
  After installing updated GNOME JS on Wayland, logout/login once.
