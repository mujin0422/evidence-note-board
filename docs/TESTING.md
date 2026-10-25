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
