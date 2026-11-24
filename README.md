# Evidence Note Board

**Evidence Note Board** is a local-first evidence board that lives on the GNOME desktop. Arrange editable text notes and photographs, pin them together with red strings, and organize your work across multiple boards. The interface is a GNOME Shell extension backed by a Rust user service and SQLite; no account or cloud connection is required.

## Release status and compatibility

| | Status |
| --- | --- |
| **Latest published release** | [v0.4.0](https://github.com/mujin0422/evidence-note-board/releases/tag/v0.4.0) |
| **Current `dev` source** | Post-v0.4.0 development: includes [PR #40](https://github.com/mujin0422/evidence-note-board/pull/40), editable captions under image notes |
| **Target desktop** | Fedora 44, GNOME Shell 50.x, Wayland (including the documented GNOME Classic Wayland setup) |
| **Release package** | Fedora 44 `x86_64` RPM; a source RPM and GNOME Shell 50 extension ZIP are also published |

**Important:** The published **v0.4.0** package does **not** include the image-caption feature merged into `dev` after that release. Installing from `dev` lets you test that feature, but is not the same as installing the latest stable release. The Cargo/RPM manifests still identify the development source as `0.4.0`; no newer release has been published.

## Features

- **Multiple independent boards:** create, rename, switch between, and delete boards from the Settings popover. Each board keeps its own notes, images, red strings, and zoom/pan state.
- **Editable text notes:** type directly on the paper, select text, apply bold formatting and dark-red text, change paper color, and insert inline CEFR labels.
- **Photo notes:** import PNG, JPEG, or WebP images through a native Zenity file chooser. Images retain their aspect ratios when resized.
- **Image captions (`dev` only):** edit a single-line caption below a photo on its Polaroid-style card. Captions are limited to 120 characters and saved automatically.
- **Pinned connections:** link note pins with red strings and remove connections through the pin controls.
- **Desktop canvas:** pan the board, zoom around the pointer, drag, resize, or rotate notes.
- **Automatic local persistence:** SQLite stores boards, note content and geometry, image references, connections, and camera state. Imported image files are managed separately in the user data directory.

No cloud sync, online account, or multi-device collaboration is implemented.

## Keyboard shortcuts and mouse controls

These controls reflect the current `dev` GNOME Extension. A *double-click* means two consecutive clicks of the left mouse button.

| Action | Result |
| --- | --- |
| Double-click an empty part of the board | Create a text note. |
| **Ctrl + double-click** an empty part of the board | Open the image picker and import a photo. Requires `zenity`. |
| **Ctrl + mouse wheel** | Zoom the board around the cursor (supported zoom range: 25%–300%). |
| Hold and drag the **left mouse button** on empty board space | Pan the board. Middle-button panning is not implemented. |
| Select text in a note, then press **Ctrl + B** | Toggle bold on the selected text. |
| Right-click text inside a note | Open formatting options, including paper color, dark-red text, and CEFR labels. |
| Drag-select text | Select text; the selection uses a contrasting highlight and text color. |
| Hold on note text for approximately **330 ms**, then drag | Move the note rather than select text. |
| Drag a note's border / resize area | Move or resize the note; drag the top-left corner to rotate it. |
| **Shift + click** a pin, then click another note's pin | Connect the two pins with a red string. Shift-dragging between pins is also supported. |
| **Esc** during a connection gesture | Cancel the in-progress connection. |
| Right-click a pin | Open the pin menu to remove connections or request note deletion. |
| Click the caption area beneath an image (**`dev` only**) | Add or edit the photo's caption; it auto-saves after a short delay. |

Text and caption changes are debounced (approximately 500 ms). There is no global keyboard shortcut for switching boards and no manual Save button.

## Managing boards

Click the **gear** next to the on-screen status display to open Settings.

1. Select **“Thêm board”** (*Add board*) in the **BOARDS** header to create a board. The generated name is the smallest unused positive `board #N`, starting with `board #1`.
2. Click a board name to switch. A filled dot marks the active board.
3. Click the **pencil** icon, edit the name, and select **“Lưu”** (*Save*).
4. Click the **trash** icon to open a confirmation dialog. Deleting a board permanently removes its notes, photos, and connections; **the last remaining board cannot be deleted**.
5. Use the HUD and red-string visibility controls to customize the display. Click outside the popover or click the gear again to close it.

Renaming or deleting `board #2`, for example, makes `#2` available for the next new board if it is the lowest unused number. Other boards are **not** renumbered. The original pre-multi-board `Evidence Board` keeps its name and contents.

The active board is remembered between sessions. Inactive boards' notes and image actors are not kept on screen.

## Installation

### Option A — Published Fedora RPM (v0.4.0)

1. Download **`evidence-note-board-0.4.0-1.fc44.x86_64.rpm`** and **`SHA256SUMS`** from the [v0.4.0 release](https://github.com/mujin0422/evidence-note-board/releases/tag/v0.4.0). Keep the two files in the same directory.
2. Verify the checksum for the binary RPM and install it:

```bash
cd ~/Downloads
grep 'evidence-note-board-0.4.0-1.fc44.x86_64.rpm' SHA256SUMS | sha256sum -c -
sudo dnf install ./evidence-note-board-0.4.0-1.fc44.x86_64.rpm
```

3. Enable the **user** backend service and GNOME extension:

```bash
systemctl --user daemon-reload
systemctl --user enable --now evidence-note-board.service
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Log out and back in to load the GNOME extension. If GNOME cannot find the newly installed extension, log out and back in first, then run `gnome-extensions enable` again.

The system RPM and a user-local developer installation can shadow one another. If you previously used `scripts/setup-dev.sh`, follow the **development-to-RPM migration** procedure in [docs/INSTALLATION.md](docs/INSTALLATION.md) before installing the RPM. Do **not** delete your SQLite database or `assets/` directory.

### Option B — Current development source (includes image captions)

Install prerequisites on Fedora 44:

```bash
sudo dnf install git rust cargo python3 zenity
```

For a fresh checkout:

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git switch dev
bash scripts/setup-dev.sh
```

For an existing development checkout:

```bash
cd /path/to/evidence-note-board
git switch dev
git pull --ff-only origin dev
python3 scripts/backup-board.py backup
bash scripts/setup-dev.sh
```

The setup script builds and installs the Rust backend under the current user's home directory, enables/restarts its systemd user service, and installs the GNOME extension. **Do not run it with `sudo`.** Log out and back in to reload updated GNOME JavaScript and CSS.

Development installation must not be mixed with the system RPM installation unless you deliberately switch between them using the documented migration procedure.

## Data, backup, and recovery

By default, the application stores:

| Location | Purpose |
| --- | --- |
| `~/.local/share/evidence-note-board/evidence.db` | SQLite board, note, caption, connection, and camera records |
| `~/.local/share/evidence-note-board/assets/` | Managed imported images |
| `~/.config/evidence-note-board/settings.json` | Display preferences |

These locations use the relevant XDG environment directory when overridden.

Create and verify a snapshot from the source checkout:

```bash
python3 scripts/backup-board.py backup
python3 scripts/backup-board.py verify /path/to/snapshot
```

The backup command prints the actual snapshot path. A published RPM also installs the `evidence-note-board-backup` utility.

**Database compatibility:** Upgrading a v0.3.0 database to v0.4.0 upgrades the SQLite schema from v1 to v2 without removing existing notes. Restoring a **pre-upgrade backup** is required to downgrade to a backend that only understands schema v1. The post-v0.4.0 image-caption feature uses an existing column and does not require another database migration.

Restoring a backup is a separate, explicit operation. Disable the extension and stop the user service first, then follow the script's `restore --confirm` procedure. A normal uninstall does not intentionally remove user note/image data.

## Testing and troubleshooting

Tests and syntax checks for a source checkout:

```bash
python3 tests/check_multi_board.py
python3 tests/check_image_notes.py
cargo test --manifest-path backend/Cargo.toml --locked

# Requires Node.js for JavaScript syntax checks:
node --check extension/ui/boardView.js
node --check extension/services/noteService.js
```

Check the running service and extension:

```bash
gnome-shell --version
echo "$XDG_SESSION_TYPE"
systemctl --user status evidence-note-board.service
gnome-extensions info evidence-note-board@mujin0422.github.io
journalctl --user -u evidence-note-board.service -b -n 100 --no-pager
```

The automated checks cover source logic, Rust/SQLite behavior, and packaging; **real input handling and visual behavior must still be checked on Fedora GNOME Shell/Wayland**.

## Architecture and current limitations

- **GNOME Shell extension:** JavaScript/GJS with St/Clutter, integrated with GNOME Shell's background actor group. This uses a GNOME private API and is sensitive to Shell version changes.
- **Rust backend:** a per-user systemd service exposing asynchronous D-Bus methods for persistence, images, and settings.
- **SQLite:** local data with foreign-key relationships and an indexed active-board note query.
- **Resource-conscious rendering:** only the selected board is hydrated; note actors are built in small idle batches, and image textures are decoded near their displayed size.

The interface is primarily designed for a **single screen**, and it does not yet virtualize off-screen items within a large active board. Memory usage can therefore still grow with the note and image count on the board currently open.

## License

MIT — see [LICENSE](LICENSE).
