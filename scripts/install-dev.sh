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
    echo "Lỗi: bản PoC cần phiên Wayland đang đăng nhập (XDG_SESSION_TYPE=wayland)." >&2
    exit 1
fi

mkdir -p "$TARGET"
for name in metadata.json extension.js boardView.js canvasMath.js stylesheet.css; do
    install -m 0644 "$ROOT/extension/$name" "$TARGET/$name"
done

echo "Đã chép extension tới: $TARGET"
echo "Chưa tự bật extension để bảo vệ phiên làm việc."
echo "Nếu extension chưa xuất hiện, đăng xuất và đăng nhập lại."
echo "Sau đó chạy: gnome-extensions enable $UUID"
echo "Phục hồi: gnome-extensions disable $UUID"
