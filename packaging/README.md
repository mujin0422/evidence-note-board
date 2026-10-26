# Fedora 44 RPM packaging

Phase 6 builds a real **binary RPM**, **source RPM** and versioned GNOME
extension ZIP from the same committed Git tree. Supported runtime:
**Fedora 44, GNOME Shell 50.x, Wayland (GNOME Classic tested by owner)**.

## Build from source on Fedora 44

```bash
sudo dnf install git rust cargo gcc sqlite-devel pkgconf-pkg-config \
  rpm-build rpmdevtools systemd-rpm-macros nodejs python3 \
  tar gzip coreutils findutils cpio
git clone https://github.com/mujin0422/evidence-note-board.git
cd evidence-note-board
git switch dev  # after Phase 6 PR has merged
bash scripts/build-rpm.sh
bash scripts/check-built-rpm.sh dist
(cd dist && sha256sum -c SHA256SUMS)
```

The build script creates an isolated SRPM work tree using `git archive HEAD`.
It copies all Rust crates at **locked** versions into `vendor/` via
`cargo vendor --locked`; these checksummed sources are included only in the
source RPM. Cargo uses `--offline --locked --no-default-features` during
rpmbuild, linking **system SQLite**. Crate downloads are required only
during the source-vendoring step, never at RPM build time.

Artifacts are deposited in `dist/`:
- `evidence-note-board-0.2.0-1.fc44.x86_64.rpm` (filename may vary with dist)
- `evidence-note-board-0.2.0-1.fc44.src.rpm`
- `evidence-note-board-0.2.0-gnome50.zip`
- `SHA256SUMS`

The RPM installs the Rust backend in `/usr/bin`, GNOME extension under
`/usr/share/gnome-shell/extensions/<uuid>/`, systemd **user** unit under
`/usr/lib/systemd/user/`, D-Bus activator under
`/usr/share/dbus-1/services/`, plus a backup CLI. It includes runtime
`zenity` for importing images. No root process is run for the board.

The spec uses standard systemd RPM user scriptlets; **installing an RPM
does not automatically enable an extension for an existing GNOME user**.
See [INSTALLATION](../docs/INSTALLATION.md).

## Upgrade from development installation

The old `scripts/setup-dev.sh` installs its own copies in `~/.local`
and `~/.config/systemd/user`. **Those paths can override system RPM files.**
Before switching, first back up the database and image assets, then
manually disable extension, stop service, remove old local extension,
user unit, D-Bus service entry and local binary (not user data).
Precise commands are in [INSTALLATION](../docs/INSTALLATION.md).

**Never delete `~/.local/share/evidence-note-board/` when uninstalling.**
Also preserve `~/.config/evidence-note-board/settings.json`.

## CI / release

- `.github/workflows/ci.yml`: JavaScript/Python/Rust CI and **real Fedora 44
  RPM build + metadata and checksums inspection** on each PR/push.
- `.github/workflows/release.yml`: accepts intentional stable tag `vX.Y.Z`,
  validates tag == Cargo/RPM versions, runs the same offline Fedora package
  build/tests, generates release notes and checksums, then publishes Release.
- Workflow permissions are read-only except the release job with
  `contents: write`; actions are pinned by commit SHA.
- Artifacts are **not GPG-signed RPMs**. Download over GitHub HTTPS and
  compare `SHA256SUMS`. A signed COPR publishing flow is not configured
  without credentials and separate packaging review.

## Caveats

- Fedora 44/GNOME 50 only; **no guarantee on Fedora 43/45, KDE, X11**.
- CI containers verify compiled RPM + payload, not GNOME desktop behavior.
- Installation/upgrade/uninstall tests in a real user session remain a
  manual release acceptance gate. See [PHASE_06](../docs/phases/PHASE_06.md).
