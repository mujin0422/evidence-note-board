# Backend autostart & D-Bus activation (Fedora GNOME Classic)

## Lý do phải sửa

Phiên bản trước chỉ thử kết nối backend **một lần** lúc extension được
enable. Khi user service chưa khởi động xong hoặc bị restart, board giữ
trạng thái `BACKEND OFFLINE` cho đến khi disable/enable thủ công.

`install-backend-dev.sh` cũ có `enable --now`, nhưng khi cập nhật binary
không chủ động restart tiến trình đang chạy. Bản mới tích hợp cả hai phía.

## Cách hoạt động

1. `systemd --user` khởi động `evidence-note-board.service` khi người
   dùng đăng nhập thông qua `WantedBy=default.target`.
2. Unit sử dụng `Type=dbus` và tên bus
   `io.github.mujin0422.EvidenceNoteBoard` để báo ready khi đã đăng ký.
3. D-Bus activation entry
   `~/.local/share/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service`
   chỉ định `SystemdService=evidence-note-board.service`. Khi có lời gọi
   D-Bus mà backend chưa chạy, bus sẽ yêu cầu systemd khởi động.
4. GNOME Extension theo dõi service bằng `Gio.bus_watch_name` với
   `AUTO_START`; khi service xuất hiện, nó load notes/camera, khi mất
   kết nối nó báo offline và tự nối lại khi service quay lại.
5. `Restart=on-failure` để thử hồi phục khi backend crash; không cần
   chạy backend bằng sudo hoặc đăng nhập root.

## Cài đặt 1 lần từ source

```bash
cd ~/Code/Project/EvidenceNoteBoard
git fetch origin
git switch --track origin/fix/backend-autostart-and-reconnect
bash scripts/setup-dev.sh
```

Nếu đang ở branch khác, `git switch -c ... --track ...` hoặc
`git switch ...` nếu branch đã tồn tại.

Script `setup-dev.sh` build backend, cài binary/user unit, cài D-Bus
activation entry, `daemon-reload`, `enable`, `restart`, xác thực
D-Bus `ListNotes`, cài extension và thử enable nếu GNOME đã nhận extension.
Khi nạp extension mới trên Wayland, đăng xuất/đăng nhập **một lần**.

**Sau đó không cần chạy bốn lệnh systemctl mỗi lần sử dụng.**

## Kiểm tra một lần

```bash
systemctl --user is-enabled evidence-note-board.service
systemctl --user is-active evidence-note-board.service
busctl --user call io.github.mujin0422.EvidenceNoteBoard \
  /io/github/mujin0422/EvidenceNoteBoard \
  io.github.mujin0422.EvidenceNoteBoard ListNotes
```

Kỳ vọng: `enabled`, `active` và kết quả JSON. Bạn có thể logout/login
để xác nhận service và note tự khôi phục.

Khi có lỗi:

```bash
journalctl --user -u evidence-note-board.service -b --no-pager -n 100
journalctl --user -b --no-pager | grep -i evidence-note-board
```

## Ranh giới kiểm thử

- CI chỉ kiểm tra file unit/activation, render đường dẫn, JS syntax và
  Rust DBus smoke test trong môi trường thử nghiệm.
- Chưa thể khẳng định **Fedora GNOME Classic 50.5** thực sự auto-start
  sau login hoặc reconnect sau crash cho đến khi chạy trên máy.
- Chế độ `AUTO_START` không có nghĩa backend chạy trước màn hình
  đăng nhập; chỉ chạy trong user session.
- Nếu đã cài thủ công service cũ, script sẽ thay thế và restart user service,
  **không xóa database**.
- Bản này không cấu hình linger; không chạy khi user đã logout.

## Gỡ cài đặt

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user disable --now evidence-note-board.service
rm -f "$HOME/.config/systemd/user/evidence-note-board.service"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service"
rm -f "$HOME/.local/bin/evidence-note-boardd"
systemctl --user daemon-reload
```

Chỉ gỡ service và app, **không xóa** `evidence.db` hoặc `assets/`.
