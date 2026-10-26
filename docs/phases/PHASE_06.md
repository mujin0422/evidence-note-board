# Phase 06 — Fedora Distribution & Release

**Implementation:** in `feat/phase6-fedora-rpm-release` Draft PR.
**Not yet released:** no `v0.2.0` tag or public GitHub Release is
created by this PR. RPM on actual GNOME Classic desktop needs testing.

## Deliverables

- [x] Fedora 44 system-wide GNOME extension and `evidence-note-boardd`
      user-service RPM spec, MIT license and runtime Zenity dependency
- [x] Source RPM includes offline vendored Cargo crates pinned by
      committed `Cargo.lock` and links system SQLite
- [x] `scripts/build-rpm.sh` builds RPM + SRPM + GNOME 50 ZIP
- [x] Version consistency check `vX.Y.Z` across Cargo and RPM spec
- [x] Automated checksum `SHA256SUMS` and binary/ZIP payload validation
- [x] GitHub Actions PR CI builds **real Fedora 44 RPM** rather than only
      checking spec text; publishes candidate artifact for manual inspection
- [x] Tag-gated GitHub Release workflow with constrained GitHub token
      permissions; release notes and upload of RPM, SRPM, ZIP, checksums
- [x] Installation, upgrade, uninstall and dev→RPM migration instructions
- [x] `scripts/backup-board.py` kept for non-destructive user backups
- [ ] CI real Fedora RPM job green on final PR SHA
- [ ] Verified installation on Fedora 44 GNOME Classic 50.x Wayland
- [ ] Verified existing dev installation does not override system files
- [ ] Verified upgrade and uninstall preserve existing SQLite and assets
- [ ] User intentionally creates `v0.2.0` tag, GitHub Release contains files
- [ ] Optional: signed packages / COPR only after appropriate credentials,
      separate review and distribution policy

## Release operator procedure

Do **not** publish before all checks above are complete.

1. Merge Phase 6 PR into `dev` after reviewing CI/artifacts.
2. Download CI artifact; run `sha256sum -c SHA256SUMS`, inspect RPM.
3. Back up user data, remove only old user-local installed development
   code, install RPM on Fedora 44, enable user service and GNOME extension.
4. Validate text/Unicode/Ctrl+B, images, drag, 25–300% zoom, connections,
   camera persistence, service autostart, backup/restore.
5. Test DNF remove/upgrade on a disposable user profile; confirm
   `evidence.db` and `assets` untouched.
6. Create tag on the exact tested merged commit:
   ```bash
   git fetch origin
   git switch dev
   git pull --ff-only origin dev
   git tag -a v0.2.0 -m "Evidence Note Board v0.2.0"
   git push origin v0.2.0
   ```
7. GitHub Actions release workflow validates tag, builds Fedora artifacts,
   checks hashes and publishes the GitHub Release. Inspect download links.

### Definitions of evidence

- **CI green**: unit/integration/source and RPM build in Fedora container.
- **Actual Fedora desktop accepted**: owner installed and used RPM, and
  logged out/in to verify extension state.
- **Release complete**: verified tag workflow succeeded AND artifacts are
  publicly present under Releases, not merely on PR or CI page.
