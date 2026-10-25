# Phase 03 — Image Notes và phong cách ảnh vintage

**Trạng thái:** Đang triển khai trên PR từ `dev`. Chưa xác minh trên
Fedora GNOME Classic 50.5 Wayland thực tế.

## Scope theo tài liệu dự án

Cho phép nhập PNG/JPEG/WebP, sao chép dữ liệu gốc về assets local-first,
hiển thị ảnh như bản in phòng tối/Polaroid trên board, di chuyển, xóa và
khôi phục khi đăng nhập. Mở rộng: resize, rotate, duplicate, clipboard,
drag-and-drop, xử lý trùng file và hiệu ứng vintage.

## Đã code ở bước đầu (cần CI / kiểm thử)

- Rust `assets.rs` kiểm tra định dạng bằng header thực, giải mã ảnh để
  loại bỏ file hỏng, giới hạn 16 MiB và 20 triệu pixel, SHA-256 checksum.
- Rust `db.rs` sao chép file vào `assets/UUID.ext`, lưu
  `notes(type=image)` và `assets` bằng SQLite transaction, lấy đường
  dẫn ảnh từ thư mục app, xóa asset khi xóa note.
- D-Bus `ImportImage(s path,d x,d y) -> s JSON note`.
- GJS nút `+ ẢNH` mở Zenity bất đồng bộ để người dùng chọn file, hiển thị
  ảnh cục bộ bằng `St.Icon`/`Gio.FileIcon`, cho phép kéo và xóa.
- Khung ảnh giấy trắng ngà có viền dưới dày hơn. Ảnh nguồn giữ nguyên.
- CI Rust test, JS syntax, Python static regression cho assets.

## Chưa hoàn thành trong Phase 3

- [ ] Test thực tế import PNG, JPEG, WebP trên GNOME Classic 50.5.
- [ ] Kiểm tra hiển thị đúng tỷ lệ, kéo, xóa và khôi phục sau login.
- [ ] Resize giữ aspect ratio và persist.
- [ ] Rotate nhẹ và persist.
- [ ] Duplicate image note (không mất nguồn).
- [ ] Drag & drop từ file manager trên Wayland nếu API thực sự hỗ trợ.
- [ ] Paste ảnh clipboard nếu compositor cho phép.
- [ ] UX khi file picker bị hủy, Zenity chưa cài hoặc ảnh quá giới hạn.
- [ ] Xử lý trùng hash và dọn asset mồ côi sau crash.
- [ ] Benchmark nhiều ảnh, giới hạn bộ nhớ GPU.

## Cài bản thử nghiệm (khác Phase 2: phải build lại backend)

```bash
sudo dnf install zenity
git fetch origin
git switch --track origin/feat/phase3-image-notes-core
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user stop evidence-note-board.service
bash scripts/install-backend-dev.sh
bash scripts/install-dev.sh
# Logout/Login Wayland, rồi:
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

`busctl --user introspect io.github.mujin0422.EvidenceNoteBoard
/io/github/mujin0422/EvidenceNoteBoard` phải liệt kê `ImportImage`.
Không xóa `evidence.db` khi cài lại.

## Safety/giới hạn

- Zenity là chương trình file chooser riêng, không phải Electron hoặc cửa
  sổ wallpaper overlay, chạy ở user scope và không block Shell.
- D-Bus method nhận đường dẫn absolute do user chọn, nhưng bus session
  không phải ACL ngăn app cùng user gọi path khác; không dùng để đọc file
  của người dùng tùy ý hoặc đưa nội dung dữ liệu vào log.
- Không chặn ứng dụng bình thường khi import. Gỡ extension phải cleanup
  subprocess chooser đang mở.
- CI **không** chứng minh bộ giải mã trên GPU hoặc event handling trên
  GNOME; chỉ chốt Phase 3 khi thử ở máy đích.

## Backend readiness ở Phase 3

Tính năng import ảnh dùng cùng Rust user D-Bus service. Bản vá autostart
sẽ tự khởi động backend khi đăng nhập và tự reconnect khi service restart,
tránh phải chạy lệnh `systemctl` trước khi nhấn `+ ẢNH`.
Dữ liệu image notes và assets cũ được giữ nguyên; cần kiểm thử trên
GNOME Classic 50.5 trước khi nghiệm thu. Xem [AUTOSTART](../AUTOSTART.md).

## Giai đoạn bổ sung — Resize, Rotate, Duplicate, kéo file ảnh

Đã thêm trong branch `feat/phase3-resize-rotate-duplicate-drop`:

- **Ảnh**: thao tác giữ/kéo ký hiệu `↘` trên thanh ảnh để đổi kích thước,
  tự giữ tỉ lệ chiều rộng/chiều cao; hai nút `↶/↷` xoay 15° và
  `⧉` nhân bản bản in, mỗi bản sở hữu asset riêng. Tọa độ, kích
  thước, góc xoay lưu SQLite qua `UpdateGeometry`.
- **Ghi chú chữ**: kéo `↔` trên thanh note để thay đổi **chỉ chiều rộng**;
  chiều cao note tự co giãn tối thiểu theo số dòng thực của Pango layout.
  Khi đổi chiều ngang, nội dung reflow và chiều cao được đo lại.
- **Kéo file từ Nautilus**: nút `⇩ THẢ ẢNH` mở cửa sổ nhỏ GTK4
  riêng biệt, hỗ trợ kéo 1–12 file ảnh từ Files/Nautilus vào. GTK
  cung cấp `Gdk.FileList` và gửi danh sách path qua stdout JSON cho
  GNOME Extension nhập bằng D-Bus. Tránh cố gắng dùng
  `Gtk.DropTarget` trên `Clutter.Actor`, không tương thích với
  Wayland drag offer cho client khác.
- Không có thay đổi phá vỡ DB schema hiện tại. Đường dẫn asset bản sao
  chỉ được lấy từ backend, không tạo URL mạng.
- Gói Fedora có thể cần `sudo dnf install gtk4 python3-gobject`
  bên cạnh `zenity`.

**Giới hạn có chủ ý:** hiện thả vào **cửa sổ nhận ảnh GTK**, không
thả trực tiếp lên wallpaper/board, vì GNOME Shell actor không phải
GdkSurface nhận GTK Wayland DND. Điều này vẫn là yêu cầu UX chưa hoàn tất
nếu cần thả trực tiếp vào mặt board. Clipboard cũng chưa làm.

### Kiểm tra trên Fedora GNOME Classic 50.5

- [ ] Bản lưu text dài làm giấy dãn xuống; xóa bớt chữ thì giấy co lại,
  không thấp hơn chiều cao mặc định.
- [ ] Resize chiều ngang note bằng `↔` và Enter nhiều dòng; chiều cao
  tự đổi tương ứng, dữ liệu còn sau logout.
- [ ] Resize ảnh bằng `↘`, aspect ratio không đổi, khôi phục sau login.
- [ ] Xoay ảnh bằng `↶` hoặc `↷`, góc xoay lưu/khôi phục.
- [ ] Nhân bản bằng `⧉`, xóa ảnh gốc không làm mất bản sao.
- [ ] Mở `⇩ THẢ ẢNH`, kéo PNG, JPEG, WebP từ Nautilus vào cửa sổ,
  nhiều ảnh được tạo trên board.
- [ ] Hủy/đóng cửa sổ, không có ảnh giả xuất hiện trên board.
- [ ] Zoom 25%/100% khi kéo resize; double-click/middle-pan không regress.
- [ ] Service tự khởi chạy và toàn bộ note + image assets không biến mất
  khi đăng xuất/đăng nhập lại.

**Chỉ đánh dấu Phase 3 hoàn thành sau khi kiểm thử trên máy**, không chỉ
sau CI. Nếu người dùng yêu cầu thả trực tiếp lên board, cần nghiên cứu
Wayland compositor drop bridge riêng; không giả lập hoặc tuyên bố đã hỗ trợ.
