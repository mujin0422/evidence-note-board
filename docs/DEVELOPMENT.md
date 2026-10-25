# DEVELOPMENT — Quy trình code theo phase

## Branch workflow

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/short-description
```

Mỗi phase một hoặc nhiều PR vào `dev`, commit Conventional Commits, **không** push trực tiếp `main`/`dev`, **không** tự merge. PR Phase 1 đã merge vào dev; Phase 2 phát triển từ dev. Cần ghi chính xác mức kiểm chứng từng phase trong PR.

## Cấu trúc source

```text
backend/
  Cargo.toml                  # Rust crates: zbus, rusqlite, serde, uuid
  src/db.rs                   # SQLite migration, CRUD, view state, tests
  src/main.rs                 # D-Bus session service, validation
extension/
  metadata.json              # GNOME Shell 50 major
  extension.js               # enable/disable lifecycle
  boardView.js               # camera, pointer interaction, note editor
  noteService.js             # async D-Bus client; mutation queue
  canvasMath.js              # pure JS camera math
  stylesheet.css             # charcoal and paper cards
db/migrations/0001_init.sql   # migration v1
packaging/evidence-note-board.service
scripts/
  install-backend-dev.sh
  install-dev.sh
  build-extension.sh
tests/
  canvasMath.test.js
  check_extension.py
  check_migration.py
docs/phases/
  PHASE_01.md
  PHASE_02.md
```

## Local static/unit checks

```bash
cargo test --manifest-path backend/Cargo.toml
cargo fmt --manifest-path backend/Cargo.toml --check
node --check extension/boardView.js
node --check extension/noteService.js
node --test tests/canvasMath.test.js
python3 tests/check_migration.py
bash -n scripts/*.sh
bash scripts/build-extension.sh
python3 tests/check_extension.py
```

Khuyến nghị `cargo clippy --manifest-path backend/Cargo.toml --all-targets`. Không chạy GJS compositor API trong Node vì GI/Clutter không có trên Node.

## Thử end-to-end

```bash
bash scripts/install-backend-dev.sh
bash scripts/install-dev.sh
systemctl --user status evidence-note-board.service
busctl --user introspect io.github.mujin0422.EvidenceNoteBoard /io/github/mujin0422/EvidenceNoteBoard
gnome-extensions enable evidence-note-board@mujin0422.github.io
```

Thử theo docs/phases/PHASE_02.md. Để kiểm tra persistence: tạo note, sửa, kéo, rồi disable/re-enable extension, logout/login và kiểm tra text/camera còn nguyên. Tách riêng kết quả `cargo test`, `GitHub CI` và nghiệm thu trực tiếp trên Fedora.

## Quy tắc triển khai

Không truy cập SQLite từ GNOME Shell main thread. Không ghi database mỗi pixel kéo chuột. Không giả lập giao diện với persistence giả. Không ghi nội dung note vào logs. Không dùng sudo chạy binary hoặc extension. Không hứa hỗ trợ GNOME Classic nếu chưa test compositor thật.
