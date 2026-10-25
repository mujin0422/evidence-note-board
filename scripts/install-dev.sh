#!/usr/bin/env bash
set -euo pipefail

UUID="evidence-note-board@mujin0422.github.io"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

mkdir -p "$TARGET"
install -m 0644 "$REPO_ROOT/extension/metadata.json" "$TARGET/metadata.json"
install -m 0644 "$REPO_ROOT/extension/extension.js" "$TARGET/extension.js"
install -m 0644 "$REPO_ROOT/extension/canvasMath.js" "$TARGET/canvasMath.js"
install -m 0644 "$REPO_ROOT/extension/stylesheet.css" "$TARGET/stylesheet.css"

echo "Installed developer extension at: $TARGET"
echo "GNOME 50 is required. On Wayland, log out/in if the extension is new."
echo "Then run: gnome-extensions enable $UUID"
echo "Disable with: gnome-extensions disable $UUID"
