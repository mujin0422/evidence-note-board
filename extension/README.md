# Cấu trúc GNOME Shell Extension

Thư mục này chứa phần giao diện chạy trực tiếp bên trong GNOME Shell. Extension
chịu trách nhiệm hiển thị board, nhận tương tác người dùng và gọi Rust backend
qua session D-Bus. Extension không truy cập SQLite hoặc ghi file dữ liệu trực
tiếp để tránh chặn compositor.

## Cây thư mục

```text
extension/
├── extension.js
├── metadata.json
├── stylesheet.css
├── ui/
│   └── boardView.js
├── services/
│   └── noteService.js
├── input/
│   ├── doubleClickTracker.js
│   ├── holdDrag.js
│   └── noteHitTest.js
├── model/
│   ├── noteContent.js
│   └── richText.js
├── geometry/
│   ├── boardBounds.js
│   ├── canvasMath.js
│   ├── imageSizing.js
│   ├── noteGeometry.js
│   ├── pinMath.js
│   └── stringMath.js
└── core/
    └── runtimePolicy.js
```

## File ở thư mục gốc

- `extension.js`: entrypoint GNOME Shell. `enable()` tạo `BoardView`; `disable()`
  hủy toàn bộ actor, signal, timer và D-Bus watcher.
- `metadata.json`: UUID, tên extension và phiên bản GNOME Shell được hỗ trợ.
- `stylesheet.css`: giao diện board, giấy note, editor, HUD, menu, pin và dây đỏ.

Ba file này phải nằm ở thư mục gốc của gói extension. Không chuyển chúng vào
thư mục con nếu chưa kiểm tra lại yêu cầu loader của GNOME Shell.

## Các module

### `ui/`

Chứa code phụ thuộc GNOME Shell/GJS và compositor.

- `boardView.js`: composition root của giao diện; tạo actor, kết nối input,
  đồng bộ camera/note, render pin và dây, đồng thời cleanup khi disable.

Không đưa SQLite hoặc xử lý file nặng vào đây. Logic thuần nên được tách sang
`geometry/`, `input/` hoặc `model/` để có thể test bằng Node.js.

### `services/`

Ranh giới giao tiếp với process bên ngoài.

- `noteService.js`: async D-Bus client gọi Rust backend. Các mutation được xếp
  hàng để autosave cũ không ghi đè thao tác mới.

### `input/`

Các helper thuần để phân loại thao tác chuột:

- `doubleClickTracker.js`: nhận diện double-click bằng thời gian và khoảng cách.
- `holdDrag.js`: phân biệt chọn text nhanh với giữ chuột để kéo note.
- `noteHitTest.js`: kiểm tra click có nằm trên note/control hay vùng board trống.

### `model/`

Chuyển đổi dữ liệu note mà không phụ thuộc GNOME API:

- `noteContent.js`: tương thích note cũ còn trường title.
- `richText.js`: encode/decode nội dung rich text và quản lý các đoạn in đậm.

### `geometry/`

Các phép tính thuần, không tạo actor và không gọi D-Bus:

- `canvasMath.js`: đổi tọa độ world/screen, zoom và pan camera.
- `boardBounds.js`: bounds của note và giới hạn note trong board hữu hạn.
- `imageSizing.js`: giới hạn pixel texture ảnh theo kích thước note và HiDPI.
- `noteGeometry.js`: resize, rotate và hit zone trên mép giấy.
- `pinMath.js`: vị trí pin theo kích thước và góc xoay của note.
- `stringMath.js`: điểm neo, đường cong dây đỏ và tìm pin gần con trỏ.

### `core/`

Policy dùng chung nhưng không thuộc model hoặc geometry:

- `runtimePolicy.js`: preference mặc định, layout một màn hình, kiểm tra đường
  dây có thể nhìn thấy và thời gian reconnect backend.

## Luồng hoạt động

```text
GNOME Shell
    ↓ enable()
extension.js
    ↓ mount()
ui/boardView.js
    ├── input/ + geometry/ + model/  (logic thuần)
    └── services/noteService.js
             ↓ session D-Bus
       Rust backend → SQLite + assets + settings
```

## Quy tắc khi thêm module

1. Chỉ `ui/` nên sở hữu GNOME actor, signal, timer hoặc stage grab.
2. Logic không phụ thuộc GJS nên là hàm thuần và có unit test Node.js.
3. Mọi ghi dữ liệu phải đi qua `services/noteService.js`; không truy cập SQLite
   từ GNOME Shell main thread.
4. Khi thêm file runtime, cập nhật cả `scripts/build-extension.sh`,
   `scripts/install-dev.sh`, `.github/workflows/ci.yml` và
   `tests/check_extension.py`.
5. Mọi resource được tạo khi `enable()`/`mount()` phải được giải phóng trong
   `disable()`/`destroy()`.

## Kiểm tra nhanh

Từ thư mục gốc repository:

```bash
while IFS= read -r file; do node --check "$file"; done \
  < <(find extension -name '*.js' -type f | sort)
node --test tests/*.test.js
bash scripts/build-extension.sh
python3 tests/check_extension.py
```

`README.md` này là tài liệu dành cho developer và không được đưa vào ZIP runtime.
