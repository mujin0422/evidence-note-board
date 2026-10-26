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

## Phase 3 — Image note test plan

Xem [PHASE_03](phases/PHASE_03.md). Kiểm tra Rust test import/tồn tại sau
restart/xóa file asset + source untouched, Python static và kiểm thử
Fedora GNOME Classic 50.5 thực tế. Ảnh PNG/JPEG/WebP, đường dẫn có dấu
tiếng Việt, cancel chọn ảnh, asset size-limit, kéo/xóa/relogin; so sánh
note cũ Phase 2 không thay đổi.

## Phase 3 mới — kiểm tra loại bỏ các nút và giữ tỉ lệ ảnh

Bản sửa UI thay thế hướng dẫn Phase 3 thử nghiệm trước đây về `⇩ THẢ ẢNH`
và `⧉`. Sử dụng `node --test tests/geometry.test.js` để xác minh
nhận diện mép/góc và ratio ảnh; kiểm tra tĩnh
`python3 tests/check_phase3_interactions.py` để chắc chắn nút/contract
không quay lại. Theo checklist [PHASE_03](phases/PHASE_03.md), cần
nghiệm thu GNOME Shell thật sau khi cập nhật extension.

## Phase 4.1 — pin và thao tác xóa

`node --test tests/pinMath.test.js`: tính vị trí pin trên tâm mép
trên, giữ đúng khi resize/xoay. `python3 tests/check_phase4_pin.py`:
tránh còn nút ×, xác nhận 2 bước, nhấn phải mở menu, pin riêng và kiểm
tra đóng gói. Cần kiểm nghiệm trực tiếp GNOME Classic 50.5 Wayland.

## Phase 4.2

`tests/stringMath.test.js` kiểm tra menu 5 px, world→screen, dây
đi theo pin xoay và bắt pin đích ở các mức zoom.
`tests/check_phase4_strings.py` đảm bảo stage capture nhận release,
dữ liệu D-Bus CRUD, St.DrawingArea với cairo dispose và đóng gói.
Rust tests xác minh backfill, idempotent, cascade, restart persistence.
Cần kiểm thử trực tiếp GNOME Classic 50.5/Wayland.

## Phase 4.3 — hiển thị dây và cascade

Node stringMath kiểm tra vị trí dây theo pan và zoom; Python
check_phase4_wire_render.py kiểm tra lớp vẽ root dưới world, surface
bằng viewport và ràng buộc self/cascade. Rust test thử một hub có hai
dây cộng với dây độc lập, sau khi xóa hub phải giữ nguyên dây độc lập.
Nghiệm thu hiển thị bắt buộc thử GNOME Wayland thực tế.

## Phase 5 — production integration

- `node --test tests/productionMath.test.js`: bố cục một màn hình,
  vùng nhìn dây đỏ, retry backoff (không còn test primary/hot-plug).
- `python3 -m unittest discover -s tests -p 'test_backup.py'`:
  SQLite backup, integrity/checksum verify, refuse restore without
  confirmation, guarded rollback restore.
- `node scripts/benchmark-geometry.mjs`: CPU geometry synthetic
  10/100/500 notes with up to 1,000 edges; **not desktop FPS**.
- `python3 tests/check_phase5.py`: JS/backend/config wire-up checks.
- Fedora GNOME Classic 50.5 Wayland: use the checklist in
  [PHASE_05](phases/PHASE_05.md) for single-screen, crash recovery,
  Settings persistence and interactive performance.


## Phase 5 — Gesture bounds and editor safety

- \`tests/boardBounds.test.js\` kiểm tra giới hạn giấy xoay/pin, nhập
  ghi chú ngoài biên, zoom 25%, note dài không mất text.
- \`tests/doubleClickTracker.test.js\` kiểm tra hai mode Ctrl/plain
  không thể trộn lẫn trong cùng một double-click.
- \`tests/check_board_interactions.py\`: hợp đồng nguồn, đã bỏ
  pan/nút tạo, Settings chỉ Zoom 100%, đúng bộ cài extension.
- **Phải thử Fedora GNOME Classic Wayland**: pointer capture, editor,
  Ctrl+doubleclick, resize/rotate, dữ liệu đã có, DPI và logout/login.


## HUD-Adjacent Settings + Ctrl+B rich text

- \`tests/richText.test.js\` kiểm tra mã hóa có phiên bản, toggle in
  đậm, xử lý UTF-8 / Unicode, paste/insert/delete, note cũ có title và
  bảo toàn chuỗi khi payload hỏng.
- \`tests/check_rich_editor.py\` kiểm tra GNOME Clutter.Text/Pango
  attrs, vị trí icon bên HUD, pipeline lưu SQLite qua existing D-Bus,
  đóng gói \`richText.js\`.
- **Nghiệm thu Fedora GNOME Classic Wayland**: chọn chữ bằng chuột,
  Ctrl+B → chữ đậm → sửa/xóa/ký tự emoji → Ctrl+B bỏ đậm;
  chọn một đoạn khác, logout/login, chắc chắn định dạng khôi phục và
  không xuất hiện JSON thô. Ẩn HUD rồi bật lại bằng nút Settings;
  icon lớn rõ ở mọi trạng thái HUD. Kiểm tra không lỗi GJS.

## Phase 5 — Compact HUD + hold-to-drag

`tests/check_compact_hud_drag.py`: hình vuông Settings có kích thước
HUD và nằm bên trái, popup tự tính chiều cao, chỉ 3 nút; giữ/nhả
để kéo giấy từ trong editor, giữ nguyên Ctrl+B. GNOME St/Clutter
pointer/keyboard event xử lý **chỉ có thể nghiệm thu trên Fedora**.

Test tay: nhấn Settings cạnh HUD, nhìn popup 3 dòng không có vùng
trống; ẩn/bật lại HUD; giữ text 330ms rồi kéo; nhấn giữ pin, mép
giấy, ảnh rồi thả, note dừng ngay. Click-kéo nhanh trên text vẫn tô
đen và Ctrl+B. Lưu/khôi phục sau logout/login và kiểm tra dây đỏ.

## Board-space zoom regression

- `node --test tests/boardZoom.test.js`: board phủ màn hình ở
  zoom 25%; note xa giữ world-space tọa độ; camera cursor-anchor;
  cap 25–300% và clamp viewport **chỉ ở mép board**, không dựa vào
  bounding box note trên màn hình.
- `tests/check_board_interactions.py` xác minh nguồn JS không
  không còn ép zoom theo note xa nhất, vẫn hỗ trợ ảnh Ctrl+double-click
  và kéo note.
- GNOME Wayland: bắt buộc nghiệm thu camera khi scroll, text editor,
  pin menu, dây đỏ và persistence thực tế.

## Hold-and-drag empty board viewport

- `node --test tests/boardPan.test.js`: ngưỡng rê 6px, giữ zoom
  25–300%, pan theo pixel chuột, camera dừng ở mép board, note
  world-space không đổi, zoom theo vị trí con trỏ sau pan.
- `python3 tests/check_board_pan.py`: đảm bảo event routing trên
  Stage giữ ưu tiên note drag, text selection, double-click và release.
- Kiểm tra thực tế trên GNOME Wayland: xem checklist Phase 5.
