# Phase 05 — Production Integration

**Status:** Phase 5 implementation merged; follow-up fix scopes desktop support
to a single screen. Runtime recovery and performance still require Fedora testing.

Phase 5 originally listed autostart, multi-monitor, error recovery,
Settings and performance. **Multi-monitor support has been explicitly removed
from the product scope at the user's request.** The application now targets
one Fedora GNOME Classic screen. RPM/release automation remains Phase 6.

## Implemented

1. **Autostart**: existing user systemd `Type=dbus`, `WantedBy=default.target`,
   D-Bus activation and extension name-owner watcher from PR #12. No
   duplicate daemon or root login requirements.
2. **Single-screen layout**: HUD/+Note/+Image/Settings always use
   fixed top-left stage coordinates. New notes/photos from toolbar appear
   at the center of the active stage. Stage resize still updates the
   background and the Cairo string layer. No monitor detection, primary
   monitor selection, hot-plug handling or mixed-DPI behavior is promised.
3. **Error recovery**: exponential reconnect retry 600ms up to 15s;
   backend's D-Bus owner watcher remains authoritative. In-memory dirty
   note contents and view are kept when the service vanishes; when it
   returns, the last text and camera are re-sent asynchronously, and
   the persisted DB objects aren't cleared/recreated.
   No guarantee that unflushed text survives a GNOME Shell process
   crash or power loss; see acceptance criteria.
4. **Settings**: compact ⚙ menu for HUD on/off, red strings on/off,
   zoom step (1.1/1.25) and reset zoom. Typed D-Bus
   `GetSettings/SaveSettings`; Rust writes
   `~/.config/evidence-note-board/settings.json` atomically, user
   permissions 0600. An invalid settings file is kept and defaults used.
   SQLite schema v1 stays unchanged. No settings GUI process/large sidebar.
5. **Performance**: coalesce red-string redraws into at most one request
   every ~16ms while interacting; cull strings fully offscreen (85px
   sag margin) prior to Cairo draw; keep serialized, event-end DB writes.
   Repaint limiter is a scheduling mechanism, NOT measured 60 FPS.
6. **Backup and recovery**: `scripts/backup-board.py` uses SQLite's
   online backup API, copies referenced assets and verifies DB integrity,
   foreign keys and SHA256. Explicit restore requires `--confirm`,
   refuses while the user service is active and preserves old DB/WAL/
   assets under `restore-rollback/`. No network dependency.

## Acceptance checklist (Fedora GNOME Classic 50.5 Wayland)

- [ ] Login automatically starts the user service; notes/assets/strings
      return without manual `systemctl restart`
- [ ] One monitor: toolbar and all controls clickable; normal desktop
      stacking/Overview preserved, screen resolution changes work
- [ ] Single-monitor scaling: note hitboxes, menu, cursor and string
      endpoints remain aligned
- [ ] GNOME Shell restart/service crash: service reconnects; existing
      text, pictures and strings are not duplicated or deleted
- [ ] Stop/restart backend while typing then continue: unsaved text
      eventually appears in SQLite (no silent data loss)
- [ ] ⚙ toggles persist after logout/login; settings file is owner-only
- [ ] 10/100/500 note + 1,000 connection scenarios: measure FPS, CPU idle
      and RAM on actual Fedora; no unverified 60 FPS claims
- [ ] Backup/verify/restore with a disposable test dataset (avoid using
      irreplaceable note data on first restore attempt)
- [ ] No JS ERROR, frozen Shell, or broken focus/Overview when opening
      Firefox/Terminal on the same display

## Run

```bash
git fetch origin
git switch -c fix/phase5-single-screen-install-output --track origin/fix/phase5-single-screen-install-output
bash scripts/setup-dev.sh
# Logout/login GNOME Wayland once to reload extension source.
```

### Backup and recovery (safe commands)

```bash
python3 scripts/backup-board.py backup
python3 scripts/backup-board.py verify ~/.local/share/evidence-note-board/backups/<folder>
```

Restore is **explicit and destructive to live state**; it preserves an
automatic rollback but needs a confirmed backup and a stopped user
service. Disable the extension first, then stop service and run:
```bash
gnome-extensions disable evidence-note-board@mujin0422.github.io
systemctl --user stop evidence-note-board.service
python3 scripts/backup-board.py restore /path/to/snapshot --confirm
systemctl --user start evidence-note-board.service
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

## Not yet verified

- Multi-monitor/mixed-DPI support is intentionally out of scope.
  Single-screen GNOME UI interactions still require Fedora testing.
- Offline dirty buffer is volatile while GNOME Shell process is alive;
  guaranteed crash recovery of unsaved editing requires future journal
  or save-on-type design.
- CPU synthetic geometry benchmark is not a GPU/frame benchmark.
- Multiple displays, independent boards, true infinite canvas and
  distribution RPM are outside this product's current scope.

## 26/10/2026 — Single-screen scope adjustment & installer output

Following on-device installation feedback:
- `cargo build --release` finished successfully. The only Rust warning was
  unused `Path` in `settings.rs`; removed the unused import.
- `setup-dev.sh` already starts and enables the backend. Updated
  `install-dev.sh` to check the user service and only suggest setup when
  it is not active, rather than always printing a misleading prerequisite.
- Removed `primaryMonitor`, `toolbarLayout`, the `monitors-changed`
  listener and monitor-specific UI tests. `singleScreenLayout` uses
  stage dimensions and fixed top-left controls; notes/photos are created
  at stage center.
- No changes to `evidence.db`, image assets, red strings or saved settings.
  After installing updated GNOME JS on Wayland, logout/login once.


## 26/10/2026 — Gesture-driven, bounded board (Draft PR)

Theo yêu cầu mới, Phase 5 giới hạn vào **một board trên một màn hình**:

1. Double-click vùng trống → tạo giấy chữ.
2. Ctrl + double-click vùng trống → mở Zenity file chooser nhập ảnh.
   Bộ đếm nhấp đúp phân biệt phím Ctrl để tránh trộn hai thao tác.
3. Bỏ hai nút tạo nội dung. Giữ chuột trái và kéo pin hoặc vùng mép
   giấy/ảnh để di chuyển. Vùng giữa note chữ vẫn dành cho editor.
4. Bỏ panning chuột giữa và mọi offset camera pan. Saved view cũ có
   panX/panY được chuẩn hóa về 0 khi tải; vẫn cho Ctrl+Wheel zoom
   nhưng chặn zoom-in nếu note/pin sẽ ra ngoài viewport.
5. Giới hạn bounding box thực của giấy **sau khi xoay** và của pin
   trong viewport cho thao tác kéo, resize, tự tăng chiều cao,
   tạo mới và khôi phục note cũ. Nếu note cũ quá lớn, co hình
   giấy để giữ trong board; không thay đổi nội dung text/asset.
6. Settings chỉ còn HUD, dây đỏ, **Zoom 100%** và Đóng; loại lựa chọn
   tốc độ zoom. Không sửa schema settings cũ; giữ tương thích backend.
7. Không dùng multi-monitor, không thay đổi Rust SQLite data format.

### Nghiệm thu trên Fedora Wayland

- [ ] Double-click vùng trống → đúng 1 text note
- [ ] Ctrl+double-click vùng trống → cửa sổ chọn ảnh → đúng 1 ảnh
- [ ] Nhấn Ctrl một lần và nhấn thường một lần không tạo nhầm
- [ ] Không còn nút + GHI CHÚ/+ ẢNH hoặc pan bằng chuột giữa
- [ ] Giữ pin/mép giấy rồi kéo các góc; không vượt board và thả ngay
- [ ] Resize note, ảnh dọc/ngang; xoay ảnh với các góc khác nhau;
      cạnh giấy và pin luôn nhìn thấy
- [ ] Note có hàng trăm dòng không mất chữ; giấy bị giới hạn chiều cao
      trong board khi quá dài
- [ ] Ctrl+Wheel zoom-in không đẩy note khỏi màn hình; nút Settings
      Zoom 100% khôi phục mọi giấy/ảnh trong board
- [ ] Restart/logout/login: giấy/ảnh và red strings còn, vị trí
      ngoài màn hình từ database cũ được đưa lại an toàn
- [ ] D-Bus service tự chạy; không có JS ERROR và không cản ứng dụng khác

**Giới hạn:** việc giữ toàn bộ nội dung note rất dài hiển thị đồng thời
trên một màn hình có kích thước cố định là không thể; bản này giữ toàn
bộ text trong SQLite và chặn chiều cao giấy ở mép board. Zoom >100%
có thể bị chặn khi board chứa các note gần biên.


## 26/10/2026 — Settings cạnh HUD + Ctrl+B trong note

- Thay nút Settings có ký tự bánh răng nhỏ bằng vector icon GNOME
  \`preferences-system-symbolic\` 22px, hitbox tối thiểu 40 × 38 px,
  border tương phản. Nút neo 8px **bên phải chiều rộng thực HUD**,
  giữ trong màn hình và vẫn dùng được khi HUD bị tắt.
- Bôi đen chữ trong Clutter.Text và Ctrl+B để bật/tắt Pango bold theo
  range đang chọn. Tất cả xử lý UTF-8 bytes/Pango và Unicode code-point
  index được tách ra kiểm thử bằng Node.
- Lưu document phiên bản rich-text 1 vào cột \`notes.content\` hiện có
  (thuần text cũ không đổi). Hỗ trợ cùng note trộn chữ đậm/thường,
  chèn/xóa, nhan đề cũ và khôi phục sau logout/login.
- Không thêm database migration, toolbar editor, backend mới hoặc
  dependence mạng. GJS runtime/Pango cần nghiệm thu Fedora Wayland.

### Checklist
- [ ] Nút bánh răng lớn rõ, ngang cùng HUD và tự chạy theo chiều dài HUD
- [ ] Tắt HUD không làm mất nút Settings, bật HUD vẫn sát bên
- [ ] Bôi đen chữ/emoji tiếng Việt Ctrl+B bật đậm, Ctrl+B lần hai bỏ
- [ ] Gõ thêm/chèn/xóa chữ trước và sau đoạn đậm không vỡ định dạng
- [ ] Sau logout/login văn bản thường/đậm còn nguyên, không thấy JSON
- [ ] Pin, red strings, ảnh và camera không bị tác động

## 26/10/2026 — Fix Settings popup + drag-by-hold

Người dùng nghiệm thu Ctrl+B thành công nhưng yêu cầu:
- Settings có cạnh `width=height=naturalHeight(HUD)` và nằm
  bên **trái**, HUD được đẩy sang phải 7px. Nút Settings vẫn nhìn
  thấy khi HUD ẩn, icon symbolic và độ tương phản giữ nguyên.
- Popup chỉ giữ ba nút `HUD`, `Dây đỏ`, `Đóng`;
  bỏ `Zoom 100%`. Lấy chiều cao tự nhiên từ `St.BoxLayout`, không
  dùng chiều cao 198px nên không tạo vùng trống.
- Drag note bằng giữ chuột: pin và mép giấy vẫn kéo ngay khi rê,
  vùng editor hỗ trợ giữ tại chỗ 330ms rồi rê để kéo cả note.
  Nếu rê trước khi đủ 330ms, đó là thao tác chọn văn bản thường;
  **Ctrl+B**, nhập, copy/paste vẫn hoạt động. Bắt phím nhả từ Stage,
  không giữ pointer grab khi kéo.
- Mọi tọa độ của note và ảnh vẫn được giới hạn theo board như PR #20.
  Không thêm schema DB hay thay đổi định dạng rich text.

**Kiểm thử trên Fedora:** icon vuông cao bằng HUD, popup không dư
khoảng trống, ẩn/bật HUD, giữ giấy để kéo và thả, drag pin, chọn
chữ Ctrl+B, logout/login không mất dữ liệu.

## 26/10/2026 — Zoom BOARD thay vì ép toàn bộ note vào SCREEN

Theo phản hồi người dùng, zoom bị dừng khi note nằm xa nhau vì
`maxZoomThatFits()` ép tất cả note luôn nằm trên một màn hình.

**Sửa:**
- Board hữu hạn trong WORLD coordinates, tối thiểu 8000×6000 đơn vị;
  tăng kích thước nếu màn hình lớn để đủ phủ viewport ở zoom tối thiểu 25%.
- `Ctrl+Wheel` dùng `zoomBoardAt()` từ `canvasMath.js`; neo
  tọa độ đang dưới con trỏ, hỗ trợ 25%–300% kể cả note ở xa.
- Camera panX/panY chỉ là offset **phát sinh từ việc zoom** và
  tự giới hạn ở mép board; **không** khôi phục thao tác chuột giữa pan.
- `confineNote()` chỉ kiểm tra kích thước board ở tỷ lệ world=1,
  không phụ thuộc stage.width/height hay zoom; không tự kéo/thu
  các note ngoài viewport vào màn hình. Dây đỏ/pin menu vẫn được
  tính từ world/screen transform camera.
- Khi reconnect và re-login, phục hồi đúng zoom/camera đã lưu;
  resize độ phân giải chỉ clamp camera, không đổi dữ liệu note.
- Không đụng SQLite schema hoặc Rust backend.

### Acceptance Fedora
- [ ] Note gần + note xa (cách nhau vài nghìn world units):
      vẫn Ctrl+Wheel zoom đến 100%, 200%, 300%.
- [ ] Trỏ vào một vùng board, Ctrl+Wheel phóng to mà điểm dưới
      con trỏ không bị nhảy.
- [ ] Note xa có thể nằm ngoài màn hình nhưng **không bị xóa hoặc
      sửa tọa độ**; zoom ra/đổi vùng zoom để xem lại.
- [ ] Không thể kéo note/ảnh/ghim vượt ra **ngoài board**.
- [ ] Menu pin, red strings, text editor Ctrl+B, thao tác kéo
      note và settings vẫn hoạt động, không có JS ERROR.
- [ ] Logout/login: zoom/camera và vị trí note/ảnh khôi phục đúng.

## 26/10/2026 — Hold-drag vùng trống để khám phá board

Sau khi nghiệm thu PR #23 (zoom board 25–300%, không ép note vào viewport),
triển khai thao tác **kéo viewport bằng chuột trái trên vùng trống**.

- Trên `_root.button-press-event`, sau khi loại trừ UI và hitbox note,
  nếu click đầu tiên chưa đủ tạo double-click thì đặt **pending board
  pan**. Nhấp thông thường không làm dịch chuyển.
- Bắt `global.stage.captured-event`: nếu vẫn giữ BUTTON1 và rê
  **>=6px**, kích hoạt kéo viewport. `dragBoardView()` chỉ thay đổi
  camera panX/panY, clamp trong kích thước board qua
  `clampBoardCamera()`; note, asset, pins, string DB không đổi.
- Khi nhả chuột trái, kết thúc ngay và lưu view; nếu mất release
  ngoài actor, motion tiếp theo không có BUTTON1 tự kết thúc.
- Double-click vẫn tạo note; Ctrl+double-click nhập ảnh; phím Ctrl+B,
  drag pin, long-press text, edit, resize và nối dây đỏ không bị chiếm
  gesture. Không re-enable middle-button pan.
- `Ctrl+Wheel` vẫn zoom theo con trỏ và hoạt động với các note xa nhau.

### Nghiệm thu Fedora Wayland

- [ ] Click vùng trống và thả: camera không nhúc nhích
- [ ] Giữ chuột trái, kéo vùng trống: thấy note/ảnh trượt theo màn hình,
      nhưng vị trí trong world board không đổi
- [ ] Thả ngay khi đang kéo: board dừng, không dính vào con trỏ
- [ ] Kéo sang các phía tới sát board: khung nhìn dừng ở mép board
- [ ] Kéo ở zoom 25%, 100%, 300%: chuyển động đồng nhất theo pixel chuột
- [ ] Double-click vùng trống: đúng một note; Ctrl+double-click: một ảnh
- [ ] Kéo pin/ảnh/note và Ctrl+B vẫn như cũ, không kéo viewport ngoài ý muốn
- [ ] Dây đỏ và pin menu di chuyển đúng theo khung nhìn
- [ ] Đăng xuất/đăng nhập lại: khung nhìn vẫn ở vùng đã kéo
- [ ] Không có JS ERROR hoặc tình trạng chuột bị grab

CI gồm unit tests `boardPan.test.js` và source contracts; chỉ Fedora
GNOME Classic/Wayland mới xác nhận được sự kiện chuột trong compositor.
