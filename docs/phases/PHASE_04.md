# Phase 04 — Pin & Red Strings

**Trạng thái:** Phase 4.1 interactive pin trên PR chưa merge. Chưa nghiệm
thu GNOME Classic 50.5; dây đỏ sẽ là bước tiếp theo.

## Đầu ghim đỏ (thiết kế riêng)

Mỗi text note và ảnh có một pin nằm chính giữa mép trên, hơi nhô khỏi
tờ giấy, có chân kim, vòng kim loại, chụp nhựa đỏ, bóng đổ và vệt sáng.
Không dùng emoji hay PNG bên ngoài. Pin là St.Widget **tách riêng**
khỏi actor giấy để không bị cạnh resize hoặc Clutter.Text giữ sự kiện.

- **Giữ chuột trái lên pin, kéo:** di chuyển note/ảnh, lưu vị trí qua
  `MoveNote`. Không còn kéo giấy bằng cạnh hoặc bên trong.
- **Chuột phải lên pin:** mở menu riêng nằm dưới pin.
  Chọn `Xóa ghi chú` / `Xóa ảnh`, sau đó nhấn `Xác nhận xóa`.
  Nút `Hủy` đóng menu. Không còn nút × trên giấy.
- Khi backend DeleteNote thành công, cả pin và giấy được xóa trên UI.
  Xóa ảnh vẫn dọn file asset qua Rust. Nếu lỗi D-Bus, giữ nguyên note.
- Khi note thay đổi width/height/rotation, pin di chuyển theo tâm cạnh
  trên của hình đã xoay; chiều cao tự tăng của giấy chữ vẫn giữ.
- Toàn bộ dữ liệu cũ giữ nguyên: một pin tự động cho mỗi note (không cần
  migration SQL). Bảng pins/connections trong SQLite sẽ được tích hợp
  ở bước nối dây tiếp theo của Phase 4.

## Cài và kiểm tra trên Fedora

```bash
cd ~/Code/Project/EvidenceNoteBoard
git fetch origin
git switch --track origin/feat/phase4-interactive-pins
bash scripts/setup-dev.sh
```

Đăng xuất/đăng nhập lại GNOME Wayland để nạp code mới.

- [ ] Note/ảnh chỉ có một pin, nằm đúng chính giữa mép trên.
- [ ] Kéo pin tại zoom 25%, 100% di chuyển đúng, lưu sau logout/login.
- [ ] Resize chiều ngang text/ảnh và rotate ảnh, pin vẫn bám đúng chỗ.
- [ ] Nhập text multiline, resize viền phải và xoay góc trái vẫn hoạt động.
- [ ] Không thấy nút × trên giấy; nhấp phải pin thấy menu.
- [ ] Nhấn Xóa lần 1 chưa mất note, lần 2 mới xóa.
- [ ] Nhấn Hủy không xóa note; xóa ảnh dọn asset và không trở lại.
- [ ] Double-click board, zoom/pan, backend autostart không regress.
- [ ] Không xuất hiện JS ERROR trong journal.

## Phạm vi Phase 4 chưa triển khai

- [ ] Kéo dây đỏ nối hai pin.
- [ ] Lưu/khôi phục connections SQLite.
- [ ] Tự cập nhật hình dạng dây khi các pin di chuyển/xoay/resize.
- [ ] Tháo/xóa từng dây mà không xóa ghi chú.
- [ ] Kiểm thử nhiều liên kết (graph) và lỗi khôi phục.

**Không đóng toàn Phase 4** chỉ vì pin đã chạy hoặc CI xanh.

## Phase 4.2 — Fix pin drag, screen-menu & Red Strings

Đã triển khai trên branch `feat/phase4-pin-drag-red-strings`:

1. **Fix pin dính chuột:** pin không gọi `global.stage.grab()`
   nữa; stage `captured-event` bắt phím nhả **trước** khi pin chặn
   sự kiện. Chỉ cập nhật tọa độ khi giữ BUTTON1_MASK. Khi nhả,
   kết thúc kéo và persist MoveNote. Nếu nhả ngoài desktop,
   lần motion kế tiếp thiếu BUTTON1_MASK cũng tự kết thúc.
2. **Context menu sát pin:** menu nằm trong `_root` ở hệ tọa độ
   màn hình, neo dưới pin cách đúng **5 pixel màn hình** ở 25–300% zoom;
   có xử lý tránh tràn mép dưới/phải.
3. **Red string:** tạo `St.DrawingArea` Cairo phía sau note,
   đường Bézier đỏ với đường viền bóng tối; cập nhật vị trí theo
   pin khi kéo note, resize/rotate, pan/zoom.
4. **Nối dây:** giữ **Shift rồi nhấn ghim A**, rê con trỏ sang
   ghim B rồi **thả chuột trái lên ghim B**; hoặc Shift-click A,
   sau đó click ghim B. Preview dây đỏ đi theo trỏ chuột.
   Nhấn `Esc` để hủy kéo dây.
5. **Tháo dây:** chuột phải ghim A, chọn `Tháo dây đỏ #N` trong
   menu (mỗi lần tối đa 6 dây được liệt kê); không xóa note.
6. **SQLite:** tận dụng `pins`/`connections` trong schema v1.
   Khởi động backend tự backfill pin cho note cũ; mỗi note mới
   có pin DB; CREATE idempotent với hai chiều A→B/B→A;
   DELETE note tự xóa dây liên quan theo CASCADE.
   D-Bus mới: `ListConnections`, `CreateConnection`,
   `DeleteConnection`. Không nâng user_version hay xóa data.

### Kiểm thử người dùng trên Fedora Wayland

- [ ] Click pin không di chuyển note; giữ chuột trái và kéo mới di chuyển;
  nhả chuột ngay giữa pin hoặc ra ngoài pin phải dừng tức thì
- [ ] Không còn pin dính theo con trỏ sau khi thả; kiểm tra zoom 25%, 100%
- [ ] Nhấp phải pin menu cách pin khoảng 5 pixel màn hình ở 25%, 100%, 300%
- [ ] Xóa note qua menu 2 bước; bấm Hủy không xóa, ảnh xóa asset
- [ ] Shift kéo từ pin A đến B, có preview đỏ; nhả lên B tạo một dây
- [ ] Shift-click A rồi click pin B cũng tạo dây; dây A–B không trùng B–A
- [ ] Nhấn Esc trong lúc chọn đầu dây, preview biến mất
- [ ] Di chuyển, resize, rotate A/B, dây đi theo hai đầu pin
- [ ] Tháo một dây đỏ từ menu, hai note vẫn còn
- [ ] Xóa note nối nhiều dây, các dây liên quan biến mất
- [ ] Logout/login: mọi dây, note, ảnh và vị trí được khôi phục
- [ ] Ctrl+Wheel zoom, pan, text multiline không regress
- [ ] Không có JS ERROR hoặc Gjs-CRITICAL trong journal

**CI Node/Rust chỉ xác minh logic toán, DB, D-Bus và nguồn code;
chưa nghiệm thu GNOME compositor.**
