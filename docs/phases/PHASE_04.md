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
