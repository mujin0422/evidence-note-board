# Phase 05 — Production Integration

**Status:** implementation in Draft PR; desktop multi-monitor/recovery acceptance
pending Fedora GNOME Classic 50.5 Wayland testing.

Phase 5 scope comes from `evidence-note-board.md` section 16:
**Autostart, Multi-monitor handling, Error recovery, Settings,
Performance optimizations.** RPM/CI release automation is Phase 6.

## Implemented

1. **Autostart**: existing user systemd `Type=dbus`, `WantedBy=default.target`,
   D-Bus activation and extension name-owner watcher from PR #12. No
   duplicate daemon or root login requirements.
2. **Multi-monitor**: use `Main.layoutManager.monitors` plus
   `primaryIndex` to position HUD/+Note/+Image/Settings on primary
   monitor, not absolute stage (0,0). Stage-sized board/strings update
   on `monitors-changed`; global canvas coordinates preserved.
   New notes from toolbar import at primary monitor center. Hot-unplug
   fallback to first valid monitor or stage bounds.
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
- [ ] 1 monitor: toolbar and all controls clickable, normal desktop
      stacking/Overview preserved
- [ ] Two monitors, primary LEFT then RIGHT: toolbar moves to the correct
      primary, notes created on primary, global canvas and strings intact
- [ ] Disconnect/reconnect secondary monitor: no crash, board visible
      and strings still attached to pins
- [ ] HiDPI / mixed scaling: note hitboxes, menu positions, text
      cursor and string endpoints remain aligned
- [ ] GNOME Shell restart/service crash: service reconnects; existing
      text, pictures and strings are not duplicated or deleted
- [ ] Stop/restart backend while typing then continue: unsaved text
      eventually appears in SQLite (no silent data loss)
- [ ] ⚙ toggles persist after logout/login; settings file is owner-only
- [ ] 10/100/500 note + 1,000 connection scenarios: measure FPS, CPU idle
      and RAM on actual Fedora; no unverified 60 FPS claims
- [ ] Backup/verify/restore with a disposable test dataset (avoid using
      irreplaceable note data on first restore attempt)
- [ ] No JS ERROR, frozen Shell, or broken focus/overview when opening
      Firefox/Terminal on both displays

## Run

```bash
git fetch origin
git switch --track origin/feat/phase5-production-integration
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

- GNOME Classic actual multi-monitor/mixed DPI support requires local
  testing, regardless of Node unit tests.
- Offline dirty buffer is volatile while GNOME Shell process is alive;
  guaranteed crash recovery of unsaved editing requires future journal
  or save-on-type design.
- CPU synthetic geometry benchmark is not a GPU/frame benchmark.
- Multi-monitor independent board layouts, true infinite canvas and
  distribution RPM remain outside this PR.
