# TESTING — Kiểm thử Phase 1

**Môi trường nghiệm thu:** Fedora GNOME Classic **50.5**, Wayland. **Kết quả thực tế: CHƯA KIỂM THỬ.** Không suy ra pass từ GitHub Actions.

## A. Kiểm tra tự động (cloud / local)

| Lớp kiểm thử | Lệnh | Giới hạn |
|---|---|---|
| Cú pháp JS | `node --check extension/{extension,boardView,canvasMath}.js` (chạy riêng từng file) | Không tải GI/Clutter |
| Camera | `node --test tests/canvasMath.test.js` | Chỉ kiểm tra toán học |
| Metadata / ZIP | `bash scripts/build-extension.sh && python3 tests/check_extension.py` | Không chạy GUI |
| Schema dự kiến | `python3 tests/check_migration.py` | Chưa có SQLite backend |
| Shell script | `bash -n scripts/install-dev.sh scripts/build-extension.sh` | Không chứng minh cài thành công |

## B. Kiểm thử thủ công có bằng chứng

Điền **PASS / FAIL / BLOCKED** và ghi tên máy, GPU, `gnome-shell --version`, `echo $XDG_SESSION_TYPE`, tên session `GNOME Classic`, ngày thử.

- [ ] B01: enable thành công, `gnome-extensions info` không báo ERROR.
- [ ] B02: board charcoal `#111111`, hai thẻ minh họa xuất hiện ở desktop trống.
- [ ] B03: Firefox và Terminal luôn hiển thị **trên** board, không bị board chặn thao tác.
- [ ] B04: top bar, bottom panel/dock GNOME Classic không bị che hoặc vô hiệu.
- [ ] B05: cuộn **không Ctrl** không zoom; `Ctrl + Wheel` zoom tại con trỏ 25%–300%.
- [ ] B06: giữ và kéo nút chuột giữa pan mượt; nhả chuột ngoài board vẫn kết thúc drag.
- [ ] B07: disable ngay giữa pan không kẹt pointer; re-enable không tạo actor nhân đôi.
- [ ] B08: Overview, workspace switch, lock/unlock, fullscreen không lỗi hoặc hiển thị sai.
- [ ] B09: đổi độ phân giải và kết nối/rút màn hình ngoài không crash Shell.
- [ ] B10: disable khôi phục background gốc; bật lại được; không báo lỗi mới trong logs.
- [ ] B11: thử cùng và không cùng các extension GNOME Classic đang bật (đặc biệt extension quản lý desktop/panel).

Mỗi trường hợp ghi screenshot/video (nếu có), log, trạng thái và bước tái hiện. **Không gộp PR chỉ vì các bài kiểm tra tĩnh pass** nếu mục tiêu là chứng minh khả thi trên desktop.

## C. Mẫu báo cáo

```text
Ngày:
Fedora:
GNOME Shell:
Session: GNOME Classic / Wayland
GPU / số màn hình:
Extension khác đang bật:
B01...B11: PASS/FAIL/BLOCKED
Bước tái hiện lỗi:
Log (đã loại bỏ dữ liệu riêng tư):
Ảnh/video:
Kết luận: Phase 1 accepted / needs fixes
```

## D. Khôi phục khi lỗi

```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
journalctl --user -b | grep -i 'evidence-note-board'
```

Nếu desktop bị treo đến mức không chạy được CLI, chuyển sang TTY (thường `Ctrl+Alt+F3`) nếu có, rồi tắt phiên GNOME và tạm di chuyển thư mục extension khỏi `~/.local/share/gnome-shell/extensions/`; đăng nhập lại. Không thay đổi source GNOME Shell hoặc Mutter để chữa lỗi PoC.
