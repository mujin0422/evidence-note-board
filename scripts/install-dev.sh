#!/usr/bin/env bash
# Copy GNOME extension sources into the current user's extension directory.
# GNOME Shell may still require logout/login before it loads changed modules.
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

files=(
    metadata.json extension.js stylesheet.css
    ui/boardView.js
    services/noteService.js
    input/doubleClickTracker.js input/holdDrag.js input/noteHitTest.js
    model/noteContent.js model/richText.js
    geometry/canvasMath.js geometry/boardBounds.js geometry/imageSizing.js geometry/noteGeometry.js
    geometry/pinMath.js geometry/stringMath.js
    core/runtimePolicy.js
)
for name in "${files[@]}"; do
    install -D -m 0644 "$ROOT/extension/$name" "$TARGET/$name"
done

# Remove flat-layout modules and an old drag/drop helper retired by newer builds.
rm -f "$TARGET"/{boardView,canvasMath,noteService,doubleClickTracker,noteHitTest,noteContent,geometry,pinMath,stringMath,productionMath,boardBounds,richText,holdDrag}.js
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
