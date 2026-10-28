# Evidence Note Board

**Evidence Note Board** là bảng ghi chú kiểu *evidence board* chạy trực tiếp trên desktop, dành cho **Fedora 44 + GNOME Shell 50 + Wayland**. Ứng dụng cho phép ghim ghi chú văn bản, ảnh, kết nối chúng bằng dây đỏ, phóng to/thu nhỏ khung nhìn và quản lý **nhiều board**. Dữ liệu được lưu cục bộ bằng **SQLite**; không cần tài khoản hoặc đồng bộ đám mây.

> **Phiên bản:** nhánh `dev` đang phát triển **v0.4.0**. Bản phát hành ổn định gần nhất là **v0.3.0**. Để kiểm tra bản phát hành hiện có và tải RPM, xem [GitHub Releases](https://github.com/mujin0422/evidence-note-board/releases). Không nhầm mã nguồn `dev` với một bản phát hành chính thức.

## 1. Phím tắt và thao tác sử dụng

Các phím tắt sau được đối chiếu với mã nguồn GNOME Extension hiện tại. **Nhấp đúp** là nhấp chuột trái hai lần liên tiếp.

| Phím / thao tác | Chức năng |
| --- | --- |
| **Nhấp đúp chuột trái** tại vùng board trống | Tạo note văn bản tại vị trí nhấp. |
| **Ctrl + nhấp đúp chuột trái** tại vùng board trống | Mở hộp chọn ảnh, rồi nhập ảnh vào board. Hỗ trợ PNG, JPEG, WebP; cần `zenity`. |
| **Ctrl + lăn chuột** | Phóng to / thu nhỏ board quanh vị trí con trỏ. |
| **Giữ chuột trái và kéo** tại vùng board trống | Di chuyển khung nhìn (pan). Không phải kéo bằng nút chuột giữa. |
| **Ctrl + B** khi đang chỉnh sửa note văn bản | Bật/tắt chữ **đậm** trên đoạn văn bản đang chọn. |
| **Shift + nhấp vào ghim** của một note, sau đó **nhấp ghim** note khác | Nối hai note bằng dây đỏ. Có thể giữ Shift rồi kéo từ ghim nguồn đến ghim đích. |
| **Esc** trong khi đang kéo/chọn điểm nối dây đỏ | Hủy thao tác nối dây đỏ đang thực hiện. |
| **Nhấp chuột phải trên vùng văn bản** | Mở menu đổi màu giấy, chữ đỏ thẫm (khi có vùng chọn) và chèn nhãn CEFR. |
| **Nhấp chuột phải vào ghim** | Mở menu tháo dây đỏ hoặc xóa note (có bước xác nhận). |
| **Giữ chuột trái trên chữ khoảng 330 ms rồi kéo** | Kéo cả tờ note; kéo nhanh thông thường dùng để chọn văn bản. |
| **Kéo mép / vùng điều khiển của note hoặc ảnh** | Di chuyển, thay đổi kích thước hoặc xoay tùy vùng tương tác. |

**Lưu ý:** các tổ hợp trên áp dụng khi con trỏ đang tương tác với Evidence Note Board. Không có phím tắt toàn cục để chuyển board hay lưu thủ công; nội dung note được tự lưu. Tính năng rê chuột giữa để pan không được hỗ trợ.

## 2. Quản lý board trong Settings

Nhấn nút **bánh răng (Settings)** nằm gần HUD ở góc trên bên trái desktop:

1. **Thêm board:** nhấn nút cùng hàng tiêu đề **BOARDS**. Tên tự động lần lượt là `board #2`, `board #3`, …
2. **Chọn board:** nhấn vào tên trong danh sách; dấu **●** đánh dấu board đang hiển thị. Mỗi board có note, ảnh, dây đỏ và trạng thái zoom/pan riêng.
3. **Đổi tên:** nhấn icon **bút chì**, nhập tên mới, chọn **Lưu**.
4. **Xóa:** nhấn icon **thùng rác**, đọc thông báo và xác nhận. Xóa board là **xóa vĩnh viễn** toàn bộ note, ảnh và dây đỏ thuộc board đó. Không thể xóa board cuối cùng.
5. **HUD / Dây đỏ:** bật/tắt phần hiển thị tương ứng. Nhấn **Đóng** để đóng menu.

Ứng dụng ghi nhớ board đang chọn qua lần khởi động lại. Khi chuyển board, GNOME chỉ dựng các note của board hiện tại; note và ảnh ở board không hoạt động không được giữ dưới dạng actor đang hiển thị.

## 3. Cài bản phát triển trên Fedora

Yêu cầu: **Fedora 44**, **GNOME Shell 50**, phiên đăng nhập **Wayland**, cùng Rust/Cargo, Python 3 và `zenity`. Nếu chưa có các công cụ cần thiết:

```bash
sudo dnf install rust cargo python3 zenity git
```

Với bản clone mới:

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git switch dev
bash scripts/setup-dev.sh
```

Với bản đã clone:

```bash
cd ~/Code/Project/EvidenceNoteBoard
git switch dev
git pull --ff-only origin dev
python3 scripts/backup-board.py backup
bash scripts/setup-dev.sh
```

`setup-dev.sh` build Rust backend, cài user service systemd/D-Bus và copy GNOME Extension vào thư mục của người dùng. **Đăng xuất và đăng nhập lại** để GNOME Shell nạp các thay đổi JavaScript/CSS; sau đó, nếu cần:

```bash
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Không chạy `setup-dev.sh` bằng `sudo`. Không trộn bản cài phát triển trong home với bản RPM hệ thống; xem [hướng dẫn cài đặt và chuyển đổi](docs/INSTALLATION.md) nếu đang dùng RPM.

## 4. Lưu trữ, sao lưu và khôi phục

- SQLite: `~/.local/share/evidence-note-board/evidence.db`.
- Ảnh được quản lý: `~/.local/share/evidence-note-board/assets/`.
- Cấu hình: `~/.config/evidence-note-board/settings.json`.
- Những đường dẫn trên tuân theo biến môi trường XDG nếu bạn cấu hình khác mặc định.

Tạo bản sao lưu được kiểm tra tính toàn vẹn:

```bash
python3 scripts/backup-board.py backup
```

Lệnh sẽ in đường dẫn snapshot để lưu lại. Xác minh snapshot bằng:

```bash
python3 scripts/backup-board.py verify /duong/dan/toi/snapshot
```

**Quan trọng khi nâng cấp từ v0.3.0 lên v0.4.0:** dữ liệu được chuyển từ schema SQLite v1 sang v2. Muốn quay lại ứng dụng cũ sau khi đã nâng schema, cần khôi phục bản backup trước nâng cấp. Chỉ dùng thao tác `restore` khi đã vô hiệu extension và dừng user service, theo [hướng dẫn cài đặt](docs/INSTALLATION.md).

## 5. Kiểm thử và chẩn đoán

```bash
# Kiểm tra database, quản lý board và nguồn GNOME
python3 tests/check_multi_board.py

# Unit tests của Rust/SQLite
cargo test --manifest-path backend/Cargo.toml --locked

# Kiểm tra cú pháp extension
node --check extension/ui/boardView.js
node --check extension/services/noteService.js

# Kiểm tra phiên bản khi chuẩn bị release
python3 scripts/check-release-version.py 0.4.0 v0.4.0
```

Xem trạng thái backend và log lỗi:

```bash
systemctl --user status evidence-note-board.service
journalctl --user -u evidence-note-board.service -b -n 100 --no-pager
gnome-extensions info evidence-note-board@mujin0422.github.io
```

Các kiểm thử tự động không thay thế việc xác nhận giao diện trên phiên Fedora GNOME Wayland thực tế.

## 6. Kiến trúc và giới hạn

- **Frontend:** GNOME Shell Extension (GJS, St/Clutter), hiển thị trực tiếp trên lớp nền desktop.
- **Backend:** Rust user service cung cấp D-Bus API, xử lý SQLite và ảnh.
- **Tối ưu:** chỉ tải note của board đang chọn, dựng note theo các đợt nhỏ khi desktop rảnh, giới hạn kích thước decode ảnh và giảm hoạt động vẽ dây đỏ không cần thiết.
- **Giới hạn hiện tại:** ưu tiên bố cục một màn hình; tiêu thụ RAM vẫn phụ thuộc vào số note/ảnh trên **board đang mở**, chưa triển khai virtualization theo viewport.

Tài liệu bổ sung: [Kiến trúc](docs/ARCHITECTURE.md) · [Hướng dẫn cài đặt](docs/INSTALLATION.md) · [Multi-board v0.4.0](docs/phases/V0_4_MULTI_BOARDS.md) · [Tạo bản Fedora RPM](packaging/README.md).
