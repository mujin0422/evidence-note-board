# Phase 1: Fedora GNOME 50 Wayland acceptance

**Status: NOT YET VERIFIED ON DEVICE.** Passing Node/Python tests is not a substitute for this checklist.

## Preconditions

1. Fedora Workstation 44, GNOME Shell 50, Wayland (`echo "$XDG_SESSION_TYPE"` must say `wayland`).
2. Confirm `gnome-shell --version` reports major version 50.
3. Back up any local GNOME extension settings if important. Have a terminal ready.
4. Install using `bash scripts/install-dev.sh`, log out/in if extension isn't detected, and enable it.

## Manual acceptance

- [ ] Extension reports enabled in `gnome-extensions info evidence-note-board@mujin0422.github.io`.
- [ ] Desktop wallpaper is replaced with a charcoal board and two example cards.
- [ ] The GNOME top bar, overview and desktop application windows are unaffected.
- [ ] Firefox/Terminal appears in front of board; no always-on-top overlay.
- [ ] Mouse wheel without Ctrl doesn't zoom.
- [ ] Ctrl + mouse wheel zooms anchored to cursor; status shows 25–300%.
- [ ] Middle mouse drag pans the board; no permanent pointer grab.
- [ ] Monitor resize or hotplug doesn't crash the shell.
- [ ] Enter/leave Overview, switch workspaces and lock/unlock session without corruption.
- [ ] Disabling extension restores original wallpaper background.
- [ ] After disabling, `journalctl --user -b` contains no new evidence-board errors.

## Debugging

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
journalctl --user -b | grep -i 'evidence-note-board'
```

Prefer a nested session for first boot: install `mutter-devkit` and run `dbus-run-session gnome-shell --devkit --wayland` on GNOME 50. **Not** a guarantee of full isolation. If you change extension code, a Wayland Shell process must be restarted (normally log out and back in).

## Pass gate

Only mark Phase 1 complete after actual screen recording/screenshots and a report noting Fedora/GNOME version, GPU, session type, input behavior and any exceptions. Otherwise the feature remains **unverified**.
