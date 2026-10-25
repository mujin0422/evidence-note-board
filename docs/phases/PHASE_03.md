# Phase 03 — Image notes và thao tác trực tiếp trên giấy

**Trạng thái:** Đã triển khai phiên bản chỉnh sửa từ phản hồi thực tế của
người dùng, cần kiểm thử trên Fedora GNOME Classic 50.5 Wayland để nghiệm thu.

## Kết quả đã xác minh từ người dùng

- Nhập ảnh PNG/JPEG/WebP bằng **+ ẢNH** qua Zenity đã hoạt động.
- Phase 2 với text note, SQLite, tạo/kéo/xóa/khôi phục đã đạt MVP.

## Yêu cầu mới / implementation hiện tại

- **BỎ** drag/drop từ Files/Nautilus và cửa sổ GTK4 nhận ảnh.
  Xóa nút `⇩ THẢ ẢNH` và helper `image-drop-target.py`; script cài
  chủ động dọn helper còn sót từ phiên bản cũ.
- **BỎ** duplicate ảnh: không còn nút `⧉` hay API `DuplicateImage`.
  Các bản sao đã lưu trước đây vẫn được giữ lại (không xóa dữ liệu).
- **Ảnh không bị ép vuông:** thay `St.Icon + Gio.FileIcon` bằng
  `St.TextureCache.load_file_async`, ảnh được vẽ trong actor tỉ lệ tự do
  dùng `Clutter.ContentGravity.RESIZE_ASPECT`. Landscape vẫn landscape,
  portrait vẫn portrait. Resize tính theo **tỉ lệ ảnh bên trong**,
  không tính phần viền Polaroid (24 px ngang, 48 px dọc).
- **Không nút resize/rotate/drag:** bộ nhận diện thao tác trên
  `paper.transform_stage_point` hoạt động trong local space kể cả
  khi zoom và xoay, không cần toolbar. Còn nút `×` để xóa sau xác nhận.
- **Text note:** kéo **mép phải** để thay đổi độ rộng thủ công,
  chiều cao tự tính lại từ số dòng Pango và tối thiểu 185 px.
- **Image note:** kéo **mép phải hoặc góc dưới phải** để resize đồng tỷ lệ,
  kéo **góc trên trái** để xoay theo hướng chuột.
- **Cả text và image:** kéo **mép trên/trái/dưới** để di chuyển. Click
  vùng giữa note văn bản vẫn chỉnh sửa chữ nhiều dòng; click vùng giữa
  ảnh để di chuyển.
- **Lưu tự động:** thay đổi width/height/rotation qua D-Bus
  `UpdateGeometry`, vị trí qua `MoveNote`; SQLite schema giữ nguyên,
  không làm mất note/asset đã có.

## Kiểm thử bắt buộc trên Fedora

- [ ] Nhập 1 ảnh nằm ngang 1200×600: card/ảnh nằm ngang, không bị vuông.
- [ ] Nhập 1 ảnh dọc 600×1200: card/ảnh đứng dọc, không méo/cắt ảnh.
- [ ] Resize ảnh bằng mép phải/góc dưới phải ở zoom 25% và 100%; ratio giữ nguyên.
- [ ] Kéo góc trên trái và xoay ảnh theo chuột; góc xoay còn sau đăng nhập lại.
- [ ] Kéo mép trên và cạnh trái để di chuyển ảnh/note chữ.
- [ ] Kéo mép phải text note làm nội dung wrap; chiều cao đổi theo số dòng,
  Enter và gõ tiếng Việt không bị mất focus hay viền lạ.
- [ ] Nút + ẢNH vẫn mở file picker và nhập được hình.
- [ ] Không còn nút ⇩ THẢ ẢNH, ⧉, ↶, ↷, ↘, ↔ hoặc label kéo.
- [ ] Nút × vẫn xóa đúng note sau xác nhận; xóa/khôi phục dữ liệu đúng.
- [ ] Kích thước, góc xoay, vị trí, nội dung còn sau logout/login.
- [ ] Không ảnh hưởng double-click tạo note, Ctrl+Wheel zoom, middle pan.
- [ ] Không có lỗi GNOME Shell/JS ERROR trong journal sau tương tác.

## Trạng thái khác

Clipboard và stress/performance không nằm trong lần sửa UI này.
Nếu tất cả mục trên PASS trên Fedora, Phase 3 MVP mới có thể đánh dấu
nghiệm thu; CI Rust/Node/Python không thay thế nghiệm thu desktop.

## Cài và thử

```bash
cd ~/Code/Project/EvidenceNoteBoard
git fetch origin
git switch --track origin/fix/phase3-border-gestures-image-aspect
bash scripts/setup-dev.sh
```

Sau khi cài extension mới trên Wayland, đăng xuất/đăng nhập GNOME
Classic. Không xóa `evidence.db` hay thư mục `assets/`.
