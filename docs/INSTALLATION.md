# INSTALLATION — Thử nghiệm trên Fedora GNOME Classic 50.5

> Đây là bản thử nghiệm GNOME Shell Extension, **không phải RPM hoàn chỉnh**.

## 1. Kiểm tra máy

```bash
gnome-shell --version
echo "$XDG_SESSION_TYPE"
echo "$XDG_CURRENT_DESKTOP"
gnome-extensions list --enabled
```

Yêu cầu `gnome-shell --version` là dòng `GNOME Shell 50.x` và `XDG_SESSION_TYPE=wayland`. Kiểm tra bạn đã chọn phiên **GNOME Classic** trên màn hình đăng nhập. Lưu danh sách extension đang bật để tiện đối chiếu nếu có xung đột.

## 2. Checkout đúng PR

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git fetch origin
git switch -c feat/gnome-classic50-phase1-hardening --track origin/feat/gnome-classic50-phase1-hardening
```

Khi PR đã merge vào `dev`, có thể dùng `git switch dev && git pull --ff-only origin dev` thay bước trên.

## 3. Cài ở user scope

```bash
bash scripts/install-dev.sh
```

Script chỉ chép file sau khi xác nhận GNOME 50.x + Wayland và **không tự bật extension**. Khi cài mới trên Wayland, đăng xuất/đăng nhập nếu GNOME chưa liệt kê extension:

```bash
gnome-extensions enable evidence-note-board@mujin0422.github.io
gnome-extensions info evidence-note-board@mujin0422.github.io
```

Nếu chưa hoạt động sau enable, thử đăng xuất rồi đăng nhập lại. Xem [TESTING](TESTING.md) để biết các tình huống cần xác nhận.

## 4. Disable và gỡ

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/evidence-note-board@mujin0422.github.io"
```

Chỉ xóa thư mục extension PoC sau khi disable. Bản này không tạo database hoặc dữ liệu note.

Nếu bị lỗi GNOME Shell, sử dụng GNOME Extensions để disable, hoặc chuyển sang TTY và loại bỏ thư mục extension sau khi đăng xuất; không cần chạy GNOME Shell bằng root. Ghi lại log qua `journalctl --user -b | grep -i evidence-note-board`.
