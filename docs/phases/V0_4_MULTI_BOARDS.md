# v0.4.0 — Multiple boards

## User interaction
Open the existing Settings button (gear) on the desktop. Under **BOARDS**:
- In the **BOARDS** header, click the compact **Thêm board** button to create and immediately select another board.
- New boards reuse the smallest free positive `board #N` label, starting from `board #1`. Renaming or deleting a numbered board frees its label; other board names and stable IDs do not change. The pre-upgrade board keeps its original name and notes.
- Click a board row to show its contents. The filled dot shows which board is active.
- Click the pencil icon next to a board, edit its name and click **Lưu**.
- Click the trash icon next to any board to request deletion. Read the confirmation panel, then choose **Xóa board** or **Hủy**. Deletion permanently removes that board's notes, image assets, pins and red strings. The last remaining board cannot be deleted.
- Deleting the active board automatically selects the oldest remaining board. Deleting an inactive board does not reload the current notes.
- Settings still contains HUD and red-string visibility controls. Clicking outside the popup or pressing the gear button closes it; there is no separate Close row.
- Selected text uses a dark burgundy highlight and white letters to make selections visible on cream-colored notes and the board-name editor.

No board is implicitly deleted. Existing notes, images, pins and strings are preserved unless you explicitly confirm deletion.

## Data and upgrade
Existing schema v1 files are upgraded transactionally to schema v2 when the backend starts.
Migration 0002 creates `board_state`, retaining the original `default` board and all linked records. The active board ID is persisted in SQLite so selection survives logout and backend restart. The legacy `next_board_number` column remains for schema compatibility and is conservatively updated for older binaries, but it no longer controls automatic names.
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
2. Confirm all existing content is intact; create board #1 (when unused), rename it, then create again and confirm the freed #1 is reused. Confirm existing board names do not change.
3. Confirm different notes, image textures, strings and camera state on each board.
4. Delete an inactive board and verify the current board remains visible. Delete the active board and confirm the application selects another board; confirm that the last remaining board cannot be deleted.
5. Restart the user service and logout/login: last selected board persists, and deleted boards do not reappear.
6. Check CPU/RSS with 10, 100 and 500 notes, including image-heavy boards, before and after board switches.
