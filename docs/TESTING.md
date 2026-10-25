# TESTING — Kế hoạch nghiệm thu theo phase

Đừng coi `Build OK` là `GNOME UI OK`. Có ba lớp kiểm thử độc lập:

1. **Static / unit:** Node syntax, camera tests, Python SQLite migration, Rust `cargo test`.
2. **Service integration:** chạy user service thật trong user bus, `busctl introspect`, tạo/sửa/xóa qua D-Bus, đóng và mở lại service để đọc SQLite.
3. **Desktop on-device:** Fedora GNOME Classic 50.5 Wayland; toàn bộ UI, fullscreen/Overview/IME và tương tác.

## Phase 1

- [docs/phases/PHASE_01.md](phases/PHASE_01.md)
- [docs/PHASE1_TEST_PLAN.md](PHASE1_TEST_PLAN.md)

Chưa có kết quả tương tác compositor thực tế trong repo. Nếu GNOME Classic không nhận sự kiện/stacking, Phase 2 UI cũng không thể đạt.

## Phase 2

- [docs/phases/PHASE_02.md](phases/PHASE_02.md)
- Backend: `cargo test --manifest-path backend/Cargo.toml`.
- SQLite: kiểm tra migration/user_version, insert/query, Unicode, update, delete, reopen.
- Integration: kiểm tra hệ thống D-Bus + quyền user service.
- Manual: click đúp tạo note; nhập văn bản multiline tiếng Việt; kéo; zoom, pan; delete 2-click; disable/re-enable; logout/login; offline error; data retention.
- Performance: kiểm tra 10/100 note trên máy thật; không khẳng định FPS khi chưa đo.

**Hiện trạng:** source đã commit; còn thiếu biên bản kiểm thử trực tiếp Fedora GNOME Classic 50.5. Nếu CI chưa báo thành công thì cũng chưa thể khẳng định build Rust.

## Mẫu báo cáo

```text
Ngày / người thử:
Commit / PR:
Fedora / GNOME Shell / session:
CPU-GPU / số màn hình:
User service: running / failed
CI commit status:
Phase 1: pass / fail / blocked
Phase 2:
  Create:
  Edit + Unicode multiline:
  Move:
  Delete confirmation:
  Zoom and pan persisted:
  Re-enable:
  Re-login:
  Backend restart:
  Privacy/security:
Log / screenshot / reproduction steps:
Kết luận:
```

## Regression: nhấp đúp tạo note trên GNOME Classic 50.5

Theo phản hồi thực tế, PoC hiển thị board nhưng không thể tạo note bằng double-click. Đã bổ sung kiểm thử tự động cho `DoubleClickTracker` và nút `+ GHI CHÚ` làm phương án thao tác trực tiếp. Sau khi cài lại extension từ branch fix, thử cả hai cách tạo note, kiểm tra database sau restart và ghi log lỗi nếu có.

Các test thuần JavaScript không chứng minh tính tương thích pointer picking và input focus của GNOME Classic; cần người dùng xác nhận. Xem danh sách riêng tại [PHASE_02](phases/PHASE_02.md).

## Regression GNOME 50 — màu chữ / ghi chú lưu nhưng không render

- [ ] Mã chạy hiển thị HUD có `P2.1`; `gnome-extensions info` nhận metadata version 3.
- [ ] Khi nhấn nút tạo hoặc double click, HUD cho biết `ĐÃ LƯU & HIỂN THỊ`, card xuất hiện.
- [ ] Text editor nhận click và có thể nhập Unicode tiếng Việt nhiều dòng.
- [ ] Backend D-Bus `ListNotes` trả về các note được tạo; không có note ẩn do lỗi render.
- [ ] Restart extension và đăng nhập lại vẫn hiện đúng note.
- [ ] Trường hợp lỗi rendering hiện `ĐÃ LƯU NHƯNG LỖI HIỂN THỊ`, không bị nhầm với lỗi lưu.
- [ ] Kiểm tra full journal (bao gồm dòng lỗi gốc) thay vì grep riêng tên extension.

Bộ test `python3 tests/check_gnome50_api.py` ngăn tái sử dụng `Clutter.Color` đã bị loại bỏ trong GNOME 50. Đây chỉ là kiểm tra tĩnh, không thay thế nghiệm thu GNOME Classic.

## P2.2 — Kiểm thử double-click và editor trên giấy

Dùng `node --test tests/noteHitTest.test.js tests/doubleClickTracker.test.js`
để kiểm thử lựa chọn vùng trống; `python3 tests/check_note_editor.py`
kiểm tra các thuộc tính của Clutter.Text và CSS (static only).
Tại Fedora GNOME Classic 50.5, kiểm tra Enter tạo ba dòng độc lập,
focus không làm đổi màu giấy, và double-click vùng trống ở zoom 25%/100%.
Xác minh D-Bus ListNotes lưu \u005c\u005cn/newline thực tế sau khi reload;
xem [PHASE_02](phases/PHASE_02.md).

## P2.4 — Regression body-only editor

- `node --test tests/noteContent.test.js`: không mất text/title lịch sử,
  giữ dấu xuống dòng và Unicode.
- `python3 tests/check_note_editor.py`: không còn title St.Entry,
  Clutter.Text có multiline/focus, lưu title rỗng qua API cũ.
- Fedora GNOME Classic 50.5 thực tế: tạo từ nút và double-click, focus
  vào giấy, Enter tạo ba dòng, không có viền đỏ, logout/login giữ nguyên;
  note cũ với title đã nhập vẫn hiển thị và lưu lại.
- Rust backend và SQLite schema không đổi, không xóa hoặc reset dữ liệu.
