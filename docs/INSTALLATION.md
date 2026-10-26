# INSTALLATION — Evidence Note Board (Fedora 44)

**Supported:** Fedora 44 + GNOME Shell 50.x + GNOME Classic on Wayland.
This is a native GNOME extension plus a **user** systemd/D-Bus backend.
There is no standalone Settings window or desktop launcher, so no .desktop
entry is needed. Never use sudo to run the app or edit the user database.

## 1. Download, verify and install the RPM

After a verified stable GitHub Release is published, visit
[GitHub Releases](https://github.com/mujin0422/evidence-note-board/releases).
Download the `x86_64.rpm` and `SHA256SUMS` from the **same release**.

```bash
cd ~/Downloads
sha256sum -c SHA256SUMS  # requires all listed artifacts in this folder
sudo dnf install ./evidence-note-board-0.2.0-*.x86_64.rpm  # stable v0.2.0
```

If you downloaded only the binary RPM, verify its one line using
`grep 'x86_64.rpm' SHA256SUMS | sha256sum -c -`.

GNOME system extensions are installed in `/usr/share/gnome-shell/extensions`
but are **disabled by default**; RPM install alone does not enable them.

```bash
systemctl --user daemon-reload
systemctl --user enable --now evidence-note-board.service
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Log out and log back into **GNOME Classic Wayland** to reload GNOME Shell.
The backend runs as your user at login. To check:

```bash
systemctl --user is-enabled evidence-note-board.service
systemctl --user status evidence-note-board.service
gnome-extensions info evidence-note-board@mujin0422.github.io
```

## 2. Migrating from `scripts/setup-dev.sh` (important for existing testers)

**Back up first** while the old backend is still running:

```bash
cd ~/Code/Project/EvidenceNoteBoard
python3 scripts/backup-board.py backup
```

Stop the development service and remove only its **installed code** copies
before installing the RPM. This is a conscious one-time switch:

```bash
UUID=evidence-note-board@mujin0422.github.io
gnome-extensions disable "$UUID" || true
systemctl --user disable --now evidence-note-board.service || true
rm -f "$HOME/.config/systemd/user/evidence-note-board.service"
rm -f "$HOME/.local/share/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service"
rm -f "$HOME/.local/bin/evidence-note-boardd"
rm -rf "$HOME/.local/share/gnome-shell/extensions/$UUID"
systemctl --user daemon-reload
```

Then run RPM install/enable commands from section 1 and re-login.
**Do not remove any of these user data paths:**
- `~/.local/share/evidence-note-board/evidence.db` (notes, camera, pins, links)
- `~/.local/share/evidence-note-board/assets/` (imported images)
- `~/.config/evidence-note-board/settings.json` (user preferences)

On systems with custom XDG_DATA_HOME, substitute that root for `~/.local/share`
in the migration commands.

## 3. Update, uninstall and restore

Upgrade with `sudo dnf upgrade ./new-evidence-note-board.rpm`, then
log out/in if the extension JS modules changed. Keep user data.

Uninstall the RPM (as root through DNF), while the actual application
continues to be per-user:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io || true
systemctl --user disable --now evidence-note-board.service || true
sudo dnf remove evidence-note-board
systemctl --user daemon-reload
```

RPM only removes system-installed code, **never SQLite data or user images**.
For a verified backup restore, disable extension, stop user service and
run `evidence-note-board-backup restore /path/to/snapshot --confirm`
before restarting service; see `scripts/backup-board.py --help` for details.

## 4. Troubleshooting

```bash
gnome-shell --version
echo "$XDG_SESSION_TYPE"
rpm -qi evidence-note-board
rpm -ql evidence-note-board
journalctl --user -u evidence-note-board.service -b --no-pager
busctl --user introspect io.github.mujin0422.EvidenceNoteBoard \
  /io/github/mujin0422/EvidenceNoteBoard
```

If `gnome-extensions enable` reports not found, log out and in, then
repeat. Verify no local development copy shadows the system extension.
If the file dialog does not appear, check `rpm -q zenity`.
Do not troubleshoot by deleting the database.

## Release status and tag recovery

A successful build and local RPM installation do not guarantee the GitHub
Release is visible. Check `Actions → Fedora 44 Release` and the public
Releases tab. If the tagged release workflow fails in its Git safety
check, **do not force-push the tag**. After the workflow-only fix merges
to default branch `dev`, open **Actions → Fedora 44 Release → Run workflow**,
select **dev** and enter existing tag `v0.2.0`. The build still uses
the original v0.2.0 source tree.

## v0.2.1 empty-note focus hotfix (testing, not yet published)

For Fedora testers already using the system RPM, test the hotfix
**without installing a parallel `~/.local` developer extension**:

```bash
cd ~/Code/Project/EvidenceNoteBoard
git fetch origin
git switch --track origin/fix/post-release-empty-note-editor-focus
bash scripts/build-rpm.sh
bash scripts/check-built-rpm.sh dist
(cd dist && sha256sum -c SHA256SUMS)
sudo dnf upgrade ./dist/evidence-note-board-0.2.1-1.fc44.x86_64.rpm
```

Log out and log back into GNOME Classic Wayland. Confirm the RPM shows
`0.2.1-1.fc44` and extension metadata version `19`. Create a note,
leave it empty, click elsewhere, and then click its interior to type.
Repeat after logout/login and verify the board, photos and pins persist.
Test Ctrl+B, dragging a note, dragging the board and zooming.

No database schema changes, and `dnf upgrade` preserves user data.
Do not tag v0.2.1 or claim it is published until manual Fedora acceptance
and all GitHub CI checks have completed successfully.
