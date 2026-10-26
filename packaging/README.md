# RPM packaging

Thư mục này chứa hai nhóm service file:

- `evidence-note-board.service` và
  `io.github.mujin0422.EvidenceNoteBoard.service.in`: cài development vào
  `~/.local/`; không đưa vào binary RPM.
- `evidence-note-board-rpm.service` và
  `io.github.mujin0422.EvidenceNoteBoard-rpm.service`: cài system-wide vào
  `/usr`; được `evidence-note-board.spec` sử dụng.

## Nội dung binary RPM

RPM chỉ cài:

- Rust backend vào `/usr/bin/evidence-note-boardd`;
- backup CLI vào `/usr/bin/evidence-note-board-backup`;
- GNOME extension vào `/usr/share/gnome-shell/extensions/`;
- systemd user unit vào `/usr/lib/systemd/user/`;
- D-Bus activation entry vào `/usr/share/dbus-1/services/`;
- license và tài liệu người dùng.

Test, script development, cache Cargo, ZIP trong `dist/` và tài liệu phase không
nằm trong `%files`.

## Tạo source archive local

Commit toàn bộ thay đổi trước, bao gồm `backend/Cargo.lock`, rồi chạy:

```bash
version=0.2.0
mkdir -p "$HOME/rpmbuild/SOURCES"
git archive --format=tar.gz \
  --prefix="evidence-note-board-${version}/" \
  -o "$HOME/rpmbuild/SOURCES/evidence-note-board-${version}.tar.gz" \
  HEAD
```

## Cài build dependencies và build

```bash
sudo dnf install rpm-build rpmdevtools dnf-plugins-core rust-packaging \
  sqlite-devel nodejs python3
sudo dnf builddep packaging/evidence-note-board.spec
rpmbuild -ba packaging/evidence-note-board.spec
```

Spec sử dụng Fedora Cargo macros với `-n` (`--no-default-features`) để backend
liên kết system SQLite thay vì feature `bundled-sqlite` dùng cho development.
Dynamic BuildRequires sẽ báo rõ crate Rust nào còn thiếu trong repository của
Fedora. Nên chạy build cuối trong `mock` trước khi phát hành.

CI chạy `python3 tests/check_rpm_packaging.py` để phát hiện sai lệch giữa spec,
phiên bản Cargo, license và đường dẫn service. Đây là kiểm tra tĩnh; nó không
thay thế lần build RPM thật bằng `rpmbuild` hoặc `mock`.
