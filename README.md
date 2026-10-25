# Evidence Note Board

## Cài một lần, tự chạy khi đăng nhập

```bash
git fetch origin
git switch --track origin/fix/backend-autostart-and-reconnect
bash scripts/setup-dev.sh
```

Backend Rust sẽ được `systemd --user` bật khi đăng nhập, có D-Bus
activation dự phòng, và GNOME Extension tự nối lại khi backend restart.
**Không cần chạy `systemctl --user restart` mỗi lần bật máy.**
Nếu GNOME Wayland chưa nhận mã extension mới, logout/login một lần.
Xem [AUTOSTART](docs/AUTOSTART.md) để kiểm tra và gỡ cài đặt.

Ứng dụng Linux desktop native theo phong cách bảng điều tra, phát triển cho **Fedora GNOME Classic 50.5 / Wayland**. Dữ liệu lưu **cục bộ**; không có tài khoản, cloud hay Electron.

> **Trạng thái:** Phase 2 đã nghiệm thu MVP trên Fedora GNOME Classic 50.5. Phase 3 đã có mã nguồn trong dev nhưng phần giao diện ảnh vẫn cần kiểm thử thực tế. CI không thay cho kiểm thử GNOME Shell.

## Tiến độ theo phase

| Phase | Phạm vi | Thực trạng |
|---|---|---|
| [01 — Desktop PoC](docs/phases/PHASE_01.md) | Board charcoal, Ctrl+Wheel zoom, middle-drag pan | Có source + CI; **chưa xác minh** GNOME Classic thực tế |
| [02 — Text notes & SQLite](docs/phases/PHASE_02.md) | Rust user service, D-Bus async, text CRUD, kéo note, khôi phục camera và note | **MVP nghiệm thu trên Fedora**, còn các stress/edge cases thuộc Phase 5 |
| [03 — Image notes](docs/phases/PHASE_03.md) | Import file PNG/JPEG/WebP qua Zenity, ảnh Polaroid và asset storage | **Đang triển khai** — chưa nghiệm thu Fedora |
| 04 | Pin & red strings | Chưa bắt đầu |
| 05 | Robustness, multi-monitor, settings | Chưa bắt đầu |
| 06 | RPM, releases | Chưa bắt đầu |

## Chức năng của source Phase 2

- Double-click vào **khoảng trống board**: tạo text note trong SQLite.
- Ghi chú chỉ có **một vùng nội dung nhiều dòng**, không ô tiêu đề, không viền hoặc nền nhập liệu khác màu giấy; tự lưu sau debounce.
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
git switch --track origin/feat/phase3-image-notes-core
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

## Bản sửa P2.1 — tạo note nhưng không xuất hiện trên GNOME 50

Mã cũ dùng `new Clutter.Color` trong text editor; GNOME 50 yêu cầu `Cogl.Color`. Bản sửa bổ sung status `P2.1`, phân biệt **đã lưu vào SQLite nhưng lỗi render** và lỗi D-Bus. Nếu bạn từng thử tạo ghi chú mà màn hình trống, có thể bản ghi đã nằm trong SQLite và sẽ xuất hiện sau khi cài extension đã sửa.

```bash
git fetch origin
git switch --track origin/fix/phase2-gnome50-note-rendering
gnome-extensions disable evidence-note-board@mujin0422.github.io
bash scripts/install-dev.sh
# Đăng xuất rồi đăng nhập lại trên GNOME Wayland trước khi bật:
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Xem [kiểm thử và phục hồi](docs/phases/PHASE_02.md) để kiểm tra dữ liệu bằng D-Bus, journal logs và xem trạng thái trên HUD.

## P2.2 — Double-click và nhập nhiều dòng trên giấy

Bản sửa `fix/phase2-multiline-editor-doubleclick` nhận diện double-click
bằng hit-testing tọa độ vùng trống thay vì so sánh `event.get_source()`
với một actor duy nhất. Editor body hỗ trợ Enter xuống dòng,
`St.Entry` tiêu đề trong suốt cả khi focus, không viền/bóng.
Không có thay đổi schema/backend. Cài lại qua `bash scripts/install-dev.sh`,
đăng xuất/đăng nhập để GNOME Wayland nạp module mới; xem
[docs/phases/PHASE_02.md](docs/phases/PHASE_02.md).

## P2.4 — Ghi chú chỉ có nội dung (không còn title)

Theo yêu cầu giao diện mới, mọi tờ giấy chỉ có phần ghim/kéo, nút xóa và
**một vùng nhập nội dung nhiều dòng trực tiếp trên nền giấy**, không còn
`St.Entry` tiêu đề. Nhấp vào giấy hoặc dùng nút thêm để nhập ngay.
Backend Rust/SQLite và D-Bus hiện tại giữ nguyên.

**Tương thích dữ liệu cũ:** title tự động `Ghi chú mới` sẽ không chiếm chỗ
trên giấy. Những title người dùng đã sửa sẽ được ghép vào đầu content
và được lưu lại bằng API `UpdateNote(id, '', content)` để không mất dữ liệu.
Xem [Phase 2](docs/phases/PHASE_02.md) và [Testing](docs/TESTING.md).

Nếu đang thử PR chưa merge, checkout `fix/phase2-body-only-notes`, chạy
`bash scripts/install-dev.sh`, đăng xuất/đăng nhập Wayland rồi bật lại
extension. Không cần xóa database hay build lại Rust.

## Phase 3 — nhập ảnh bản thử nghiệm

- Dùng nút **+ ẢNH** trên board để chọn file bằng `zenity` (GTK file picker).
- Chấp nhận PNG/JPEG/WebP tối đa 16 MiB, giới hạn 20 triệu điểm ảnh.
- Backend Rust kiểm tra nội dung thật của ảnh, sao chép file vào
  `~/.local/share/evidence-note-board/assets/` và lưu metadata trong
  SQLite. Ảnh nguồn không bị chỉnh sửa.
- Board hiển thị ảnh có khung giấy trắng ngà kiểu Polaroid, cho phép di chuyển
  và xóa (xóa cả bản sao asset), khôi phục khi bật lại extension.
- Cần cài `zenity` trên Fedora: `sudo dnf install zenity`.
- **Bản này chưa có** drag/drop từ file manager, paste clipboard, resize,
  rotate hoặc duplicate; các tính năng này nằm trong checklist Phase 3 chưa
  hoàn thành tại [PHASE_03](docs/phases/PHASE_03.md).

**Chú ý:** Phase 3 cần build và cài lại backend Rust, không chỉ extension.
```bash
git fetch origin
git switch --track origin/feat/phase3-image-notes-core
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user stop evidence-note-board.service
bash scripts/install-backend-dev.sh
bash scripts/install-dev.sh
# Đăng xuất/đăng nhập GNOME Wayland để nạp lại extension
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Không xóa cơ sở dữ liệu khi nâng cấp.
