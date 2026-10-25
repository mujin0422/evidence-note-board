# DEVELOPMENT — Hướng dẫn phát triển

## Mục tiêu

Phase 1 chỉ kiểm chứng khả năng vẽ board trên desktop GNOME Classic 50.5 Wayland và tương tác chuột. **Không** triển khai backend hoặc note thật.

## Yêu cầu

- Fedora GNOME Shell 50.x, ưu tiên GNOME Classic 50.5 + Wayland.
- Node.js 20+ để kiểm thử phép biến đổi canvas.
- Python 3 để kiểm tra package / migration SQL bản thiết kế.
- `gnome-extensions` CLI để quản lý extension.

## Git workflow

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/<short-description>
```

Commit theo Conventional Commits, mở PR **vào `dev`**. Không merge tự động, không đẩy trực tiếp lên `dev` hoặc `main`. Với code GNOME Shell, review API và kiểm thử thủ công trước khi đánh dấu Ready.

## Mô-đun

- `boardView.js`: chỉ chứa hoạt động compositor-facing của PoC.
- `canvasMath.js`: toán học camera tách biệt, không import `gi://`, chạy Node.
- `extension.js`: vòng đời extension tối giản.
- `stylesheet.css`: visual appearance.
- `metadata.json`: ghi duy nhất major 50; bản minor cần kiểm thử thực tế.

## Chạy kiểm tra

```bash
node --check extension/extension.js
node --check extension/boardView.js
node --check extension/canvasMath.js
node --test tests/canvasMath.test.js
python3 tests/check_migration.py
bash -n scripts/install-dev.sh scripts/build-extension.sh
bash scripts/build-extension.sh
python3 tests/check_extension.py
```

Các phép kiểm trên chỉ tìm lỗi cú pháp, phép toán, schema/package. Chúng không tải được GNOME Shell, không thể kiểm tra input stacking/dock trong compositor. GitHub Actions cung cấp ZIP thử nghiệm.

## Dev loop trên Fedora

1. Tạo branch từ `dev`, chạy các kiểm tra tĩnh.
2. Dùng `bash scripts/install-dev.sh` (phải đang trong Wayland GNOME 50).
3. Đăng xuất/đăng nhập nếu extension mới không được nhận.
4. Dùng `gnome-extensions enable evidence-note-board@mujin0422.github.io`.
5. Ghi nhận kết quả với checklist `docs/TESTING.md`.
6. Trước khi sửa tiếp, disable extension; cập nhật tập tin và đăng nhập lại nếu cần.
7. Nếu có lỗi compositor, dừng, disable, lưu lại log; không coi PoC đã pass.

Không chạy extension/GUI bằng sudo. Không sửa `global.window_group` theo cách chuyển thứ tự cửa sổ ứng dụng.
