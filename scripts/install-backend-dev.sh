#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v cargo >/dev/null || { echo "Cần Rust/Cargo. Cài bằng: sudo dnf install rust cargo" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "Không tìm thấy systemctl" >&2; exit 1; }

cargo build --manifest-path "$ROOT/backend/Cargo.toml" --release

install -d -m 0700 "$HOME/.local/bin"
install -d -m 0700 "$HOME/.config/systemd/user"
install -m 0755 "$ROOT/backend/target/release/evidence-note-boardd" "$HOME/.local/bin/evidence-note-boardd"
install -m 0644 "$ROOT/packaging/evidence-note-board.service" "$HOME/.config/systemd/user/evidence-note-board.service"

systemctl --user daemon-reload
systemctl --user enable --now evidence-note-board.service
systemctl --user --no-pager status evidence-note-board.service || true
echo "Dữ liệu nằm tại: ${XDG_DATA_HOME:-$HOME/.local/share}/evidence-note-board/evidence.db"
echo "Không xoá dữ liệu khi uninstall."
