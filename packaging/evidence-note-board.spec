%global uuid evidence-note-board@mujin0422.github.io

Name:           evidence-note-board
Version:        0.2.0
Release:        1%{?dist}
Summary:        Local-first evidence board for GNOME Shell

License:        MIT
URL:            https://github.com/mujin0422/evidence-note-board
Source0:        %{url}/archive/refs/tags/v%{version}/%{name}-%{version}.tar.gz

BuildRequires:  cargo-rpm-macros
BuildRequires:  rust >= 1.85
BuildRequires:  cargo
BuildRequires:  gcc
BuildRequires:  pkgconfig(sqlite3)
BuildRequires:  systemd-rpm-macros
BuildRequires:  nodejs
BuildRequires:  python3

Requires:       gnome-shell >= 50
Requires:       gnome-shell < 51
%{?systemd_requires}

%description
Evidence Note Board is a native GNOME Shell evidence board with local text and
image notes, pins, red-string connections, and SQLite persistence. A Rust user
service keeps database and filesystem work outside the compositor and exposes
an asynchronous session D-Bus API to the extension.

%generate_buildrequires
pushd backend
%cargo_generate_buildrequires -n
popd

%prep
%autosetup -n %{name}-%{version}

%build
pushd backend
# Disable the developer-only bundled-sqlite default feature. Fedora builds
# against pkgconfig(sqlite3), so security fixes come from the system package.
%cargo_build -n
popd

%install
pushd backend
%cargo_install -n
popd

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
pushd backend
%cargo_test -n
popd
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
%doc README.md extension/README.md docs/ARCHITECTURE.md docs/INSTALLATION.md
%{_bindir}/evidence-note-boardd
%{_bindir}/evidence-note-board-backup
%{_userunitdir}/evidence-note-board.service
%{_datadir}/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service
%{_datadir}/gnome-shell/extensions/%{uuid}/

%changelog
* Mon Oct 26 2026 mujin0422 - 0.2.0-1
- Initial Fedora RPM packaging
