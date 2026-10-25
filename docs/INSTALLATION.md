# INSTALLATION — Fedora GNOME Classic 50.5 / Wayland

## Cài đặt & bật tự động — cách khuyến nghị

Từ branch PR chưa merge hoặc `dev` sau khi đã được merge:

```bash
git fetch origin
git switch --track origin/fix/backend-autostart-and-reconnect
bash scripts/setup-dev.sh
```

`setup-dev.sh` gọi script cài Rust backend, user systemd unit và D-Bus
activation, sau đó cài GNOME extension. Không cần chạy
`systemctl --user daemon-reload/enable/restart` bằng tay.
Không cần sudo để cài ứng dụng; chỉ `sudo dnf install rust cargo`
nếu thiếu công cụ build. Đăng xuất/đăng nhập lại GNOME Wayland nếu
extension chưa nhận code mới.

Xem [AUTOSTART](AUTOSTART.md) để biết cách hoạt động và kiểm tra.
Chi tiết phát triển từng Phase ở [PHASE_02](phases/PHASE_02.md)
và [PHASE_03](phases/PHASE_03.md).

## Debug

```bash
systemctl --user is-enabled evidence-note-board.service
systemctl --user is-active evidence-note-board.service
journalctl --user -u evidence-note-board.service -b -n 100 --no-pager
```

Dữ liệu trong `~/.local/share/evidence-note-board` không bị xoá khi
cài lại. Xem AUTOSTART để gỡ user unit, binary và D-Bus entry, nhưng
giữ nguyên database/asset.
