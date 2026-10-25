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
