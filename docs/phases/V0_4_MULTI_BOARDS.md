# v0.4.0 — Multiple boards

## User interaction
Open the existing Settings button (gear) on the desktop. Under **BOARDS**:
- Click **+ Tạo board** to create and immediately select another board.
- New boards are named `board #2`, `board #3`, and so on. The pre-upgrade board is retained with its original name and existing notes.
- Click a board row to show its contents. The filled dot shows which board is active.
- Click **✎** next to a board, edit its name and click **Lưu**.
- Settings still contains HUD and red-string visibility controls.

No board is implicitly deleted. Existing notes, images, pins and strings are preserved.

## Data and upgrade
Existing schema v1 files are upgraded transactionally to schema v2 when the backend starts.
Migration 0002 creates `board_state`, retaining the original `default` board and all linked records. The active board ID and next default board number are persisted in SQLite, so the selected board survives logout and backend restart.
Notes and camera state remain scoped by `board_id`. Operations targeting a note on another board are rejected.

Before updating, back up the user data with the existing `scripts/backup-board.py` utility. Upgrade does not overwrite the database or copy notes between boards. Rolling back the application to v0.3.0 is **not** supported on a migrated database (schema v2); restore a pre-upgrade backup to downgrade.

## Resource strategy
- `ListBoards` transfers only board names and note counts, not note bodies or image bytes.
- `ListNotes` and `ListConnections` fetch **only the active board** using existing SQLite indexes.
- When switching, queued note/camera edits flush before the new board is committed.
- Previous board's note/pin actors and rich text editor references are destroyed, so inactive boards do not remain rendered in GNOME Shell.
- Up to eight active-board notes are materialized per idle iteration to reduce frame-time spikes.
- Existing bounded-resolution asynchronous image texture loading remains in use.
- No background refresh, polling or periodic database scans were added.

Memory usage still scales with note count on the **active board**. Viewport-based virtualization may be added later if individual boards grow very large.

## Verification
```bash
python3 tests/check_multi_board.py
cargo test --manifest-path backend/Cargo.toml --locked
node --check extension/ui/boardView.js
node --check extension/services/noteService.js
python3 scripts/check-release-version.py 0.4.0 v0.4.0
```

These tests do not prove actual GNOME 50 Wayland rendering. Manual acceptance on Fedora 44 / GNOME Shell 50:
1. Upgrade from v0.3.0 with notes, images, strings and a custom camera position.
2. Confirm all existing content is intact; create board #2, name it, switch both ways.
3. Confirm different notes, image textures, strings and camera state on each board.
4. Restart the user service and logout/login: last selected board persists.
5. Check CPU/RSS with 10, 100 and 500 notes, including image-heavy boards, before and after board switches.
