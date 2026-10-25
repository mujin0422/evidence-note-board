# Evidence Note Board

Ứng dụng Linux desktop native theo phong cách bảng điều tra, phát triển cho **Fedora GNOME Classic 50.5 / Wayland**. Dữ liệu lưu **cục bộ**; không có tài khoản, cloud hay Electron.

> **Trạng thái:** Phase 2 đang triển khai trên nhánh tính năng, chưa được nghiệm thu trên GNOME thực tế. Không xem CI xanh là xác nhận giao diện hoạt động.

## Tiến độ theo phase

| Phase | Phạm vi | Thực trạng |
|---|---|---|
| [01 — Desktop PoC](docs/phases/PHASE_01.md) | Board charcoal, Ctrl+Wheel zoom, middle-drag pan | Có source + CI; **chưa xác minh** GNOME Classic thực tế |
| [02 — Text notes & SQLite](docs/phases/PHASE_02.md) | Rust user service, D-Bus async, text CRUD, kéo note, khôi phục camera và note | **Đã viết source**, chờ build/CI + nghiệm thu Fedora |
| 03 | Image notes, nhập ảnh, giấy vintage | Chưa bắt đầu |
| 04 | Pin & red strings | Chưa bắt đầu |
| 05 | Robustness, multi-monitor, settings | Chưa bắt đầu |
| 06 | RPM, releases | Chưa bắt đầu |

## Chức năng của source Phase 2

- Double-click vào **khoảng trống board**: tạo text note trong SQLite.
- Sửa title (một dòng) và body (nhiều dòng, Unicode); tự lưu theo debounce.
- Kéo bằng thanh tiêu đề; di chuyển và lưu vị trí note.
- Xóa note: nhấn `×` rồi xác nhận `Xóa?`.
- Zoom bằng `Ctrl + Wheel`, pan bằng `Middle Mouse Drag`; lưu camera.
- Backend dùng Rust + rusqlite và user session D-Bus; `evidence.db` ở `$XDG_DATA_HOME/evidence-note-board/` (mặc định `~/.local/share/`).
- Khôi phục nội dung sau khi tắt/mở lại extension nếu backend đang chạy.

Không có ảnh, dây đỏ, Undo, resize, multiple boards hay RPM trong Phase 2. Phase 2 vẫn phụ thuộc việc Phase 1 đặt actor đúng desktop layer, vốn chưa được kiểm chứng trên GNOME Classic 50.5 thực tế.

## Thử từ branch / PR

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git fetch origin
git switch --track origin/feat/phase2-text-notes-persistence
bash scripts/install-backend-dev.sh
bash scripts/install-dev.sh
```

Cần Fedora GNOME Shell 50.x / Wayland, Rust/Cargo, systemd user và GNOME Extensions CLI. Nếu extension chưa được GNOME phát hiện hãy đăng xuất/đăng nhập lại, sau đó:

```bash
gnome-extensions enable evidence-note-board@mujin0422.github.io
systemctl --user status evidence-note-board.service
```

**Không chạy GUI hoặc backend bằng sudo.** Chi tiết an toàn, cách gỡ và sao lưu: [INSTALLATION](docs/INSTALLATION.md).

## Kiểm thử

```bash
cargo test --manifest-path backend/Cargo.toml
node --test tests/canvasMath.test.js
python3 tests/check_migration.py
bash scripts/build-extension.sh
python3 tests/check_extension.py
```

Xem [TESTING](docs/TESTING.md) và [Phase 2 test checklist](docs/phases/PHASE_02.md).

## Tài liệu

- [ARCHITECTURE](docs/ARCHITECTURE.md) — sơ đồ, D-Bus contract, persistence, rủi ro.
- [DEVELOPMENT](docs/DEVELOPMENT.md) — module, Git workflow từ `dev`, kiểm tra.
- [INSTALLATION](docs/INSTALLATION.md) — cài backend + extension, vận hành.
- [TESTING](docs/TESTING.md) — phân biệt automatic và on-device.
- [PHASE_01](docs/phases/PHASE_01.md) — kết quả/giới hạn của phase trước.
- [PHASE_02](docs/phases/PHASE_02.md) — deliverables, acceptance, danh sách chưa xác minh.

## Sửa lỗi tạo note trên desktop (GNOME Classic 50.5)

Nếu board hiện lên nhưng double-click không tạo được note, hãy dùng bản sửa `fix/phase2-double-click-create-note`. Bản sửa loại bỏ lời gọi `event.get_click_count()` không có trong Clutter.Event hiện đại, theo dõi hai lần nhấn chuột bằng timestamp/tọa độ, đồng thời thêm nút `+ GHI CHÚ` ở góc trái để thử tạo note trực tiếp. Ở zoom 25%, note mặc định sẽ trông rất nhỏ; zoom lên 100% để đọc.

Sau khi cập nhật extension, hãy đăng xuất/đăng nhập vào phiên Wayland để nạp lại mã trước khi kiểm tra. Backend Rust hiện tại không phải thay đổi cho lỗi này. Xem [Phase 02](docs/phases/PHASE_02.md).
