#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT="evidence-note-board.service"
SERVICE="io.github.mujin0422.EvidenceNoteBoard"
OBJECT="/io/github/mujin0422/EvidenceNoteBoard"
DBUS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/dbus-1/services"
DBUS_ENTRY="$DBUS_DIR/$SERVICE.service"

command -v cargo >/dev/null || { echo "Cần Rust/Cargo: sudo dnf install rust cargo" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "Không tìm thấy systemctl" >&2; exit 1; }
command -v busctl >/dev/null || { echo "Không tìm thấy busctl" >&2; exit 1; }

# Build first; on compile failure leave the installed, running backend untouched.
cargo build --manifest-path "$ROOT/backend/Cargo.toml" --release

install -d -m 0700 "$HOME/.local/bin"
install -d -m 0700 "$HOME/.config/systemd/user"
install -d -m 0700 "$DBUS_DIR"

# A running ELF binary can fail to overwrite with ETXTBSY. Stop only after
# compilation succeeded; restart below and keep the existing SQLite data.
systemctl --user stop "$UNIT" 2>/dev/null || true

install -m 0755 "$ROOT/backend/target/release/evidence-note-boardd" "$HOME/.local/bin/evidence-note-boardd"
install -m 0644 "$ROOT/packaging/evidence-note-board.service" "$HOME/.config/systemd/user/$UNIT"

python3 "$ROOT/scripts/render-dbus-service.py" \
    "$ROOT/packaging/$SERVICE.service.in" \
    "$HOME/.local/bin/evidence-note-boardd" \
    "$DBUS_ENTRY"
chmod 0644 "$DBUS_ENTRY"

# Persist across logout/login and immediately run the just-installed binary.
systemctl --user daemon-reload
systemctl --user enable "$UNIT"
systemctl --user restart "$UNIT"
if ! systemctl --user is-active --quiet "$UNIT"; then
    systemctl --user --no-pager --full status "$UNIT" || true
    echo "Không thể khởi động Evidence Note Board backend" >&2
    exit 1
fi

# D-Bus must be ready before the installer reports success.
if ! busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" ListNotes >/dev/null; then
    echo "Backend đang chạy nhưng D-Bus chưa phản hồi. Kiểm tra journalctl --user -u $UNIT -b" >&2
    exit 1
fi

echo "✓ Backend đang chạy và được bật tự động khi đăng nhập."
echo "✓ D-Bus activation: $DBUS_ENTRY"
echo "✓ Dữ liệu được giữ tại ${XDG_DATA_HOME:-$HOME/.local/share}/evidence-note-board/evidence.db"
echo "Kiểm tra về sau: systemctl --user is-enabled $UNIT"
