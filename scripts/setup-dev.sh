#!/usr/bin/env bash
# Convenience entry point for installing both backend and extension from source.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# One-time setup, or rerun after updating the repository.
# Backend installer enables and restarts the user service automatically.
bash "$ROOT/scripts/install-backend-dev.sh"
bash "$ROOT/scripts/install-dev.sh"

UUID="evidence-note-board@mujin0422.github.io"
if command -v gnome-extensions >/dev/null 2>&1; then
    if gnome-extensions info "$UUID" >/dev/null 2>&1; then
        gnome-extensions enable "$UUID" || {
            echo "GNOME chưa bật được extension. Đăng xuất/đăng nhập rồi chạy:"
            echo "gnome-extensions enable $UUID"
        }
    else
        echo "Cần đăng xuất/đăng nhập GNOME Wayland để extension mới được nhận."
    fi
fi

echo "✓ Đã thiết lập Evidence Note Board. Không cần chạy systemctl mỗi lần đăng nhập."
