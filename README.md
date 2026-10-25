# Evidence Note Board

**Dự án native Linux dành cho Fedora GNOME Classic 50.5 trên Wayland.**

Ứng dụng hướng tới một bảng điều tra (evidence board) màu đen than ngay tại desktop, sau các cửa sổ thông thường. Giai đoạn hiện tại chỉ là **Phase 1 — Proof of Concept**, chưa phải phiên bản hoàn chỉnh.

## Có gì trong Phase 1?

- GNOME Shell Extension tạo actor màu `#111111` trong background group của Shell.
- Hai thẻ mẫu để quan sát zoom/pan (không phải ghi chú thật).
- `Ctrl + Mouse Wheel`: zoom tại vị trí con trỏ (25%–300%).
- `Middle Mouse Drag`: di chuyển camera trên bảng.
- Bật/tắt bằng GNOME Extensions; các actor và pointer grab được giải phóng khi disable.
- Kiểm thử toán học canvas, kiểm tra tĩnh và đóng gói ZIP qua GitHub Actions.

**Giới hạn:** Mã đang sử dụng `Main.layoutManager._backgroundGroup`, một API nội bộ của GNOME Shell. Chưa xác nhận input, stacking, dock hoặc GNOME Classic 50.5 trên máy Fedora thật. Không có backend, SQLite đang chạy, note thật, ảnh hay dây đỏ.

## Cài đặt thử

```bash
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git switch dev
bash scripts/install-dev.sh
```

Khi kiểm tra một PR chưa merge, chuyển sang branch của PR thay vì `dev` trước khi cài đặt. Nếu GNOME chưa nhận extension mới, đăng xuất/đăng nhập; sau đó:

```bash
gnome-extensions enable evidence-note-board@mujin0422.github.io
gnome-extensions info evidence-note-board@mujin0422.github.io
```

Khôi phục desktop:

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
```

Hướng dẫn chi tiết: [INSTALLATION](docs/INSTALLATION.md), [TESTING](docs/TESTING.md).

## Kiểm tra mã nguồn

```bash
node --check extension/extension.js
node --check extension/boardView.js
node --test tests/canvasMath.test.js
python3 tests/check_migration.py
bash scripts/build-extension.sh
python3 tests/check_extension.py
```

Các lệnh này **không** xác minh giao diện GNOME Wayland.

## Tài liệu

- [ARCHITECTURE](docs/ARCHITECTURE.md): so sánh phương án, rủi ro API nội bộ, thiết kế tương lai.
- [DEVELOPMENT](docs/DEVELOPMENT.md): cấu trúc code, cách phát triển và Git workflow.
- [TESTING](docs/TESTING.md): tiêu chí nghiệm thu GNOME Classic 50.5.
- [INSTALLATION](docs/INSTALLATION.md): cài và gỡ PoC.
- [PHASE1_TEST_PLAN](docs/PHASE1_TEST_PLAN.md): checklist ngắn.

## Lộ trình

1. **Phase 1:** chứng minh desktop layer + tương tác, yêu cầu test thật.
2. **Phase 2:** Rust service, SQLite, tạo/sửa/xóa và khôi phục text note.
3. **Phase 3:** image notes và giao diện giấy cũ.
4. **Phase 4:** ghim và dây đỏ liên kết.
5. **Phase 5–6:** ổn định, RPM và release.

Không đưa Electron, cửa sổ always-on-top hay cloud vào kiến trúc desktop board.
