%global uuid evidence-note-board@mujin0422.github.io

Name:           evidence-note-board
Version:        0.3.0
Release:        1%{?dist}
Summary:        Local-first evidence board for GNOME Shell

License:        MIT
URL:            https://github.com/mujin0422/evidence-note-board
# The Phase 6 build script creates this reproducible source bundle with
# locked, checksum-verified vendored crates. No network access during rpmbuild.
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  rust >= 1.85
BuildRequires:  cargo
BuildRequires:  gcc
BuildRequires:  pkgconfig(sqlite3)
BuildRequires:  systemd-rpm-macros
BuildRequires:  nodejs
BuildRequires:  python3
BuildRequires:  tar
BuildRequires:  gzip

Requires:       gnome-shell >= 50
Requires:       gnome-shell < 51
Requires:       zenity
Requires:       python3
%{?systemd_requires}

%description
Evidence Note Board is a native GNOME Shell evidence board with local text
and image notes, pins, red strings and SQLite storage. Its Rust user service
keeps filesystem and persistence work outside the GNOME Shell compositor.

%prep
%autosetup -n %{name}-%{version}

%build
# Vendor sources and Cargo.lock are supplied by the SRPM. Use system SQLite
# instead of bundled SQLite; never download crates while building the RPM.
cargo build --manifest-path backend/Cargo.toml --release --locked --offline --no-default-features

%install
install -D -m 0755 backend/target/release/evidence-note-boardd \
    %{buildroot}%{_bindir}/evidence-note-boardd

extension_dir=%{buildroot}%{_datadir}/gnome-shell/extensions/%{uuid}
install -d "$extension_dir"
install -m 0644 extension/extension.js extension/metadata.json \
    extension/stylesheet.css "$extension_dir/"
cp -a extension/core extension/geometry extension/input extension/model \
    extension/services extension/ui "$extension_dir/"

install -D -m 0644 packaging/evidence-note-board-rpm.service \
    %{buildroot}%{_userunitdir}/evidence-note-board.service
install -D -m 0644 \
    packaging/io.github.mujin0422.EvidenceNoteBoard-rpm.service \
    %{buildroot}%{_datadir}/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service
install -D -m 0755 scripts/backup-board.py \
    %{buildroot}%{_bindir}/evidence-note-board-backup

%check
cargo test --manifest-path backend/Cargo.toml --locked --offline --no-default-features --all-targets
node --test tests/*.test.js
bash scripts/build-extension.sh
for check in tests/check_*.py; do
    python3 "$check"
done
python3 -m unittest discover -s tests -p 'test_backup.py'
bash -n scripts/*.sh

%post
%systemd_user_post evidence-note-board.service

%preun
%systemd_user_preun evidence-note-board.service

%postun
%systemd_user_postun_with_restart evidence-note-board.service

%files
%license LICENSE
# Avoid two README.md basenames sharing the same RPM doc destination.
%doc README.md docs/ARCHITECTURE.md docs/INSTALLATION.md
%{_bindir}/evidence-note-boardd
%{_bindir}/evidence-note-board-backup
%{_userunitdir}/evidence-note-board.service
%{_datadir}/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service
%{_datadir}/gnome-shell/extensions/%{uuid}/

%changelog
* Tue Oct 27 2026 mujin0422 - 0.3.0-1
- Add paper colors and reversible dark-red text formatting
- Add inline single-character CEFR badges
- Restore compact automatic text-note sizing

* Mon Oct 26 2026 mujin0422 - 0.2.1-1
- Restore focus to empty notes and keep Clutter.Text's hit area allocated

* Mon Oct 26 2026 mujin0422 - 0.2.0-1
- Fedora 44 GNOME Shell 50 package, offline build and runtime dependencies
