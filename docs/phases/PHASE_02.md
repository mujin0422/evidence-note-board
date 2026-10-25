# Phase 02 — Text Notes & SQLite Persistence

**Trạng thái:** source đã viết, cần Rust CI và xác minh trên Fedora GNOME Classic 50.5. Không tuyên bố đạt nghiệm thu khi thiếu các bằng chứng.

## Mục tiêu theo tài liệu gốc

- Text notes: tạo, sửa (Unicode + multiline), xóa, kéo.
- SQLite embedded, schema + migration, dữ liệu lưu XDG.
- Restore notes và camera sau khi đăng nhập.
- Rust backend tách GNOME compositor, session D-Bus async.
- Không triển khai image notes, pinned strings, rich text, RPM.

## Bàn giao trong branch Phase 2

| Thành phần | Kết quả ở mức source |
|---|---|
| `backend/src/db.rs` | SQLite initialize/migration v1, CRUD text notes, view state, tests |
| `backend/src/main.rs` | D-Bus session name, validates text/coords/zoom, exposes methods |
| `extension/noteService.js` | Async Gio.DBusProxy, mutation queue |
| `extension/boardView.js` | Double-click create, title/body editor, drag position, delete 2-step, restore |
| `scripts/install-backend-dev.sh` | Cargo release + user systemd installation |
| `packaging/evidence-note-board.service` | User-local service, restart on failure |
| `docs/` | README, architecture, development, installation, testing, phase 01/02 |

## Manual acceptance checklist

- [ ] P2-01: `cargo test` và CI thành công trên commit cuối.
- [ ] P2-02: `systemctl --user status evidence-note-board.service` = active; `busctl introspect` hiển thị ListNotes/CreateNote/UpdateNote/MoveNote/DeleteNote/GetView/SaveView.
- [ ] P2-03: lần đầu chạy tự sinh `evidence.db` ở XDG data, `PRAGMA user_version=1`, foreign_keys ON.
- [ ] P2-04: double-click vùng trống tạo một note; **không** tạo note khi nhấp đôi lên editor.
- [ ] P2-05: sửa title và nội dung nhiều dòng tiếng Việt; chờ 1 giây rồi disable/re-enable; dữ liệu còn.
- [ ] P2-06: drag tiêu đề note, nhả nút và mở lại extension; vị trí không thay đổi.
- [ ] P2-07: Ctrl+wheel zoom và middle-drag pan, logout/login rồi camera khôi phục.
- [ ] P2-08: nhấn nút × một lần hiện xác nhận, lần thứ hai mới xóa; reload không xuất hiện lại.
- [ ] P2-09: mất backend => báo offline/không tạo dữ liệu giả, restart rồi re-enable khôi phục.
- [ ] P2-10: nhiều lần enable/disable không nhân đôi cards hoặc lưu sai, không kẹt pointer.
- [ ] P2-11: top bar/panel/window bình thường hoạt động, Unicode/IME tiếng Việt trên GNOME Classic 50.5.
- [ ] P2-12: tắt service và backup/restore db an toàn, uninstall không xóa data.

## Rủi ro và những phần chưa được xác minh

- **Phase 1 dependency:** private `_backgroundGroup` phải hoạt động trên GNOME Classic 50.5 trước khi có thể nghiệm thu UI.
- `Clutter.Text` focus/IME/multiline thực tế, quyền bắt sự kiện của world actors và grab, shell UI focus.
- D-Bus reconnect sau khi service crash hiện cần disable/re-enable extension.
- Async save vẫn có thể chưa hoàn tất nếu logout quá nhanh; chưa có journal pending/replay/Undo.
- Chưa có kiểm thử GNOME/compositor tự động; cần biên bản chạy thiết bị thật.
- Chưa có image/pins/string; schema là chuẩn bị trước, không phải những tính năng đã hoàn thành.
- Chưa có RPM, release artifacts hoặc bench 100/500 note.

## Định nghĩa Done

**Chỉ hoàn thành Phase 2 khi** CI build Rust pass + DB round-trip test pass + test D-Bus trong phiên người dùng + toàn bộ P2-02..P2-12 được kiểm chứng trên Fedora GNOME Classic 50.5 Wayland. Lỗi cần đưa vào PR sửa mới, không ép đánh dấu hoàn thành.

## Khắc phục sự cố — không thể nhấp đúp tạo note (PR sửa lỗi)

**Báo lỗi thực tế:** Fedora GNOME Classic 50.5 hiển thị board ở zoom 25%, nhưng nhấp đúp không tạo ghi chú.

**Nguyên nhân được xác định trong source:** `boardView.js` gọi `Clutter.Event.get_click_count()` không có trong API Mutter Clutter hiện đại. Việc gọi có thể ném lỗi trước khi gửi D-Bus CreateNote. Đọc API `Clutter.Event`: https://gnome.pages.gitlab.gnome.org/mutter/clutter/union.Event.html.

**Bản sửa:** thay bằng `DoubleClickTracker` theo khoảng thời gian/vị trí và bổ sung nút `+ GHI CHÚ` để test độc lập với double-click. Tạo note hiển thị trạng thái đang tạo/thành công/thất bại. Sự kiện trên note hiện có không được tạo thêm note.

**Bộ kiểm thử bắt buộc tại máy GNOME Classic 50.5:**

- [ ] Nhấn `+ GHI CHÚ`, note mới xuất hiện gần giữa màn hình ở zoom 25%; SQLite tồn tại bản ghi sau re-enable.
- [ ] Nhấp đúp vào một vùng trống tạo **đúng một** note.
- [ ] Nhấp đúp vào editor/note khác hoặc nút thêm không vô tình tạo note.
- [ ] Click chậm, click ở hai vị trí cách xa nhau, click đơn không tạo note.
- [ ] Di chuyển note và sửa tiếng Việt đa dòng, lưu và khôi phục sau logout/login.
- [ ] Backend ngừng hoạt động thì nút thêm báo offline, không tạo ghi chú giả; không crash GNOME Shell.
- [ ] Thử ở 25%, 100%, 300% và kiểm tra hiển thị của note.

**Kết luận:** Đã sửa mã và thêm unit test; chưa đánh dấu đã PASS khi chưa kiểm tra lại desktop trên máy người dùng.
