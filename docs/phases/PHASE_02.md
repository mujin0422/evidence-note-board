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

## Sửa lỗi P2.1 — lưu thành công nhưng không thấy note (GNOME Classic 50.5)

**Báo cáo:** người dùng không thể thấy ghi chú mới cả khi nhấp đúp lẫn nhấn nút `+ GHI CHÚ`. Backend `evidence-note-board.service` đã báo `active (running)`. Log được lọc theo tên extension chỉ cho thấy stack trace cũ `_press(...):179`, không bao gồm dòng thông báo lỗi (do `grep` loại bỏ ngữ cảnh).

**Lỗi mã nguồn cụ thể:** `_renderNote()` dựng một `Clutter.Text` với `new Clutter.Color(...)`. Mutter đã loại bỏ `Clutter.Color` từ GNOME 47, thay bằng `Cogl.Color`. Trên GNOME 50, đây là rủi ro lỗi runtime khi backend đã tạo note thành công, khiến ứng dụng ghi sai trạng thái `LỖI LƯU`. Tài liệu API: https://gnome.pages.gitlab.gnome.org/mutter/clutter/property.Text.color.html.

**Bản sửa:** dùng `Cogl.Color.init_from_4f`, bật `reactive` cho editor; tách riêng lỗi D-Bus trước khi lưu và lỗi render sau khi đã lưu; tiếp tục restore các note khác nếu một card render lỗi. HUD có dấu `P2.1` để dễ nhận biết phiên bản mới, metadata extension version 3. Thêm static regression test `tests/check_gnome50_api.py`.

**Bắt buộc kiểm tra trên Fedora GNOME Classic 50.5:**

1. Đồng bộ branch/PR, disable extension, chạy lại `scripts/install-dev.sh`, **đăng xuất và đăng nhập** (Wayland không đảm bảo ES modules được nạp lại chỉ bằng disable/enable). Sau đó `gnome-extensions enable ...`.
2. Xác nhận HUD hiển thị `P2.1` và `gnome-extensions info` hiển thị phiên bản mới; nếu vẫn thấy dấu stack `_press:179` từ phiên cũ, kiểm tra timestamp các log.
3. Chạy `busctl --user call io.github.mujin0422.EvidenceNoteBoard /io/github/mujin0422/EvidenceNoteBoard io.github.mujin0422.EvidenceNoteBoard ListNotes` để kiểm tra database có note từ những lần thử trước.
4. Nhấn `+ GHI CHÚ`, xác minh hiện note vàng và nhập được text; nhấp đúp vùng trống để thêm note thứ hai.
5. Lưu note, disable/re-enable rồi đăng nhập lại, kiểm tra nội dung vẫn tồn tại.
6. Nếu lỗi, dùng `journalctl --user -b -o cat --no-pager | grep -B 4 -A 7 -E 'Evidence Note Board|boardView.js|TypeError|Gjs-CRITICAL'` để lấy **thông báo lỗi và stack**, thay vì chỉ grep tên extension.

**Trạng thái:** bản sửa được bổ sung vào source/CI; nghiệm thu desktop thật còn chờ phản hồi của người kiểm thử. Không đóng Phase 2 khi chưa PASS.

## P2.2 — Double-click vùng trống và editor nhiều dòng, không viền

**Đầu vào nghiệm thu thực tế:** người dùng Fedora GNOME Classic 50.5 đã xác nhận
nút `+ GHI CHÚ` hoạt động, chỉnh sửa nội dung thành công, và
`ListNotes` trả về 4 bản ghi UUID trong SQLite. Như vậy kết nối backend và
persistence qua nút bấm đã có bằng chứng ở mức thao tác máy thật. Tuy nhiên,
double-click chưa hoạt động và trải nghiệm editor chưa đúng yêu cầu.

**Phân tích:** bản trước chỉ xử lý hai lần nhấp khi
`event.get_source() === this._root` (hoặc `this._world`).
Clutter bubbling/event picking trong GNOME Classic có thể trả về actor khác;
kiểm tra định danh như vậy dễ bỏ sót sự kiện. Bản P2.2 dùng hit-testing
tọa độ canvas: loại trừ note hiện có, thanh trạng thái và nút tạo; sau đó
nhận diện hai primary presses gần nhau bằng timestamp/khoảng cách.

**Editor:** Clutter.Text dùng `activatable=false` để Enter chèn dấu xuống
dòng; `single_line_mode=false` và `line_wrap=true` để hiển thị nội dung
nhiều dòng. Khi click body, gọi `grab_key_focus()` để nhận bàn phím.
St.Entry dùng một màu chữ trên nền `transparent` ở cả normal/focus/hover,
bỏ border, border-image và box-shadow. Dữ liệu vẫn qua API
`UpdateNote` có sẵn, không chỉnh sửa schema.

**Kiểm thử sau khi cài extension P2.2:**

- [ ] Tại zoom 100% và 25%, double-click **vùng trống** tạo đúng một note.
- [ ] Double-click trong note cũ hoặc lên nút + không sinh note mới.
- [ ] Single-click, hai click cách xa nhau hoặc quá chậm không tạo note.
- [ ] Title và body không xuất hiện viền trắng/bóng khi focus hoặc hover.
- [ ] Body nhập được ba dòng bằng Enter; Unicode tiếng Việt giữ nguyên.
- [ ] Sau ít nhất một giây và disable/re-enable, toàn bộ dấu xuống dòng vẫn còn.
- [ ] Note còn nguyên sau logout/login và `ListNotes` chứa nội dung mới.
- [ ] Không bị treo Shell, không ảnh hưởng kéo note/pan hay nút + GHI CHÚ.

Bài test Node xác minh phép hit-test/toạ độ; Python kiểm tra các thuộc tính
editor. **Chưa xác nhận trên GNOME compositor thật cho đến khi người dùng
chạy lại và cung cấp kết quả.**
