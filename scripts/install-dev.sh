#!/usr/bin/env bash
set -euo pipefail

UUID="evidence-note-board@mujin0422.github.io"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "Lỗi: chưa tìm thấy gnome-shell. Cần Fedora GNOME 50." >&2
    exit 1
fi

SHELL_VERSION="$(gnome-shell --version)"
if [[ ! "$SHELL_VERSION" =~ GNOME[[:space:]]Shell[[:space:]]50(\.|$) ]]; then
    echo "Lỗi: chỉ hỗ trợ thử nghiệm GNOME Shell 50.x; máy này: $SHELL_VERSION" >&2
    exit 1
fi

if [[ "${XDG_SESSION_TYPE:-}" != "wayland" ]]; then
    echo "Lỗi: cần phiên Wayland đang đăng nhập." >&2
    exit 1
fi

mkdir -p "$TARGET"
for name in metadata.json extension.js boardView.js canvasMath.js noteService.js doubleClickTracker.js noteHitTest.js noteContent.js geometry.js pinMath.js stringMath.js productionMath.js stylesheet.css; do
    install -m 0644 "$ROOT/extension/$name" "$TARGET/$name"
done

# Remove helper left over from builds before drag-and-drop was retired.
rm -f "$TARGET/image-drop-target.py"

echo "Đã chép GNOME extension tại $TARGET"
if systemctl --user is-active --quiet evidence-note-board.service; then
    echo "✓ Backend đã hoạt động; không cần chạy lại install-backend-dev.sh."
else
    echo "⚠ Backend chưa chạy. Hãy dùng bash scripts/setup-dev.sh để cài và bật tự động."
fi
echo "Đăng xuất/đăng nhập lại nếu GNOME chưa tìm thấy extension mới."
echo "Bật: gnome-extensions enable $UUID"
echo "Tắt: gnome-extensions disable $UUID"
