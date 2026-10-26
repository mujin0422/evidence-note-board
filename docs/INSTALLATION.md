# INSTALLATION — Fedora GNOME Classic 50.5 / Wayland

## Cài từ RPM

Repository đã có spec Fedora tại
[`packaging/evidence-note-board.spec`](../packaging/evidence-note-board.spec).
Xem [`packaging/README.md`](../packaging/README.md) để tạo source archive,
cài build dependencies và build bằng `rpmbuild` hoặc `mock`. RPM cài backend,
GNOME extension, systemd user unit và D-Bus activation entry vào `/usr`; dữ
liệu người dùng vẫn nằm trong thư mục XDG của từng tài khoản.

Các mục bên dưới dành cho **development build từ source** và cài vào
`~/.local`.

## Cách cài được khuyến nghị: một lần và tự chạy sau login

```bash
cd ~/Code/Project/EvidenceNoteBoard
git fetch origin
git switch --track origin/fix/backend-autostart-and-reconnect
bash scripts/setup-dev.sh
```

Sau khi GNOME Wayland nạp lại extension, backend sẽ tự chạy nhờ
`systemd --user`, có D-Bus activation dự phòng và tự reconnect.
Bạn không cần chạy thủ công `daemon-reload`, `enable`,
`restart` nữa. Xem [AUTOSTART](AUTOSTART.md) để xác minh tự chạy.

---

**Lưu ý:** Đây là luồng build development từ source, không phải thao tác cài
RPM. Đừng thử trên desktop quan trọng khi chưa có backup/sẵn phương án disable
extension.

## 1. Kiểm tra môi trường

```bash
gnome-shell --version
echo "$XDG_SESSION_TYPE"
echo "$XDG_CURRENT_DESKTOP"
```

Mục tiêu `GNOME Shell 50.5`, `wayland`, session **GNOME Classic**. Cài công cụ phát triển khi thiếu: `sudo dnf install rust cargo gcc git gnome-extensions-app` (tên gói có thể thay đổi; kiểm tra với `dnf search`). Không dùng root để chạy service.

## 2. Checkout branch cho phát triển từng phase

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git fetch origin
git switch dev  # hoặc chuyển tới feature branch đang thử nghiệm
```

Sau khi PR được **bạn** merge, thay branch ở trên bằng `dev`.

## 3. Build và cài backend Rust

```bash
bash scripts/install-backend-dev.sh
systemctl --user status evidence-note-board.service
busctl --user introspect io.github.mujin0422.EvidenceNoteBoard /io/github/mujin0422/EvidenceNoteBoard
```

Script chạy Cargo release build, cài binary `~/.local/bin/evidence-note-boardd`, user unit `~/.config/systemd/user/evidence-note-board.service`, bật bằng `systemctl --user enable --now`. Backend chỉ chạy sau khi **user session** đăng nhập, không chạy trước màn hình đăng nhập.

Dữ liệu được tạo tự động ở `$XDG_DATA_HOME/evidence-note-board/evidence.db`, mặc định `~/.local/share/evidence-note-board/evidence.db`. Không tạo database trong source tree.

## 4. Cài GNOME Extension

```bash
bash scripts/install-dev.sh
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Nếu extension không được GNOME nhận ra hoặc có mã mới, đăng xuất và đăng nhập lại rồi enable. Trên Wayland không khuyến khích restart GNOME Shell in-place. Click đúp vùng board trống để thêm note. Xem [Phase 2](phases/PHASE_02.md).

## 5. Debug

```bash
systemctl --user status evidence-note-board.service
journalctl --user -u evidence-note-board.service -b --no-pager
journalctl --user -b | grep -i 'evidence-note-board'
```

Nếu thông báo `BACKEND OFFLINE`: xem trạng thái systemd service. Với bản autostart mới, extension phải tự kết nối lại khi D-Bus xuất hiện. Không log thông tin cá nhân/nội dung note.

## 6. Sao lưu, gỡ

Để tạo backup nhất quán, dừng service trước khi sao chép DB, kể cả file `-wal`/`-shm` nếu có:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user stop evidence-note-board.service
mkdir -p "$HOME/evidence-note-board-backup"
cp -a "${XDG_DATA_HOME:-$HOME/.local/share}/evidence-note-board/." "$HOME/evidence-note-board-backup/"
systemctl --user start evidence-note-board.service
```

Sau khi đảm bảo đã lưu backup, muốn gỡ ứng dụng:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user disable --now evidence-note-board.service
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/evidence-note-board@mujin0422.github.io"
rm -f "$HOME/.config/systemd/user/evidence-note-board.service"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service"
rm -f "$HOME/.local/bin/evidence-note-boardd"
systemctl --user daemon-reload
```

**Không xóa thư mục dữ liệu** khi uninstall. Nếu cần restore, tắt service trước rồi copy database từ backup về vị trí XDG data directory.
