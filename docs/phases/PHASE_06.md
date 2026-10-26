# Phase 06 — Fedora Distribution & Release

**Implementation:** Phase 6 PR #26 and backup test fix PR #27 merged into `dev`;
the Fedora 44 RPM built and passed packaging tests on the owner's machine.
**Install acceptance:** Fedora RPM `0.2.0-1.fc44`, user backend active and
enabled, GNOME Extension ACTIVE at the system `/usr/share` path.
**Not yet released:** no `v0.2.0` tag or public GitHub Release.
Desktop workflows, upgrade and uninstall still require final validation.

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
- [x] CI Fedora RPM job green for merged packaging and backup-test PRs
- [x] Verified RPM installed and GNOME extension ACTIVE on Fedora 44
      (owner terminal log, 26/10/2026; functional smoke test still pending)
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

CI build note: Fedora container checkouts that do not expose .git to subprocesses
use a source-only tar fallback excluding build artifacts, while local builds
with a usable Git repository use a committed git archive.

## Phase 6 finishing polish

- GNOME extension metadata uses a release-ready name, `Evidence Note
  Board`, instead of the obsolete `(Phase 4)` label, and no longer
  describes the production RPM as `Experimental`.
- Updated GNOME extension metadata version to `18` (independent of
  app RPM version `0.2.0`).
- Removed duplicate `extension/README.md` from `%doc` because Fedora
  RPM flattened it to the same destination as project `README.md`.
- These cosmetic changes do not alter backend, settings, SQLite or
  existing pinned notes. Local RPM testers should rebuild and use
  `dnf reinstall` when using the same pre-release RPM NEVRA.

## v0.2.0 release workflow recovery (26/10/2026)

- Fedora 44 owner validated RPM `0.2.0-1.fc44.x86_64` installed,
  backend `active/enabled`, GNOME extension v18 `ACTIVE`, and all
  RPM/SRPM/ZIP SHA-256 checksums `OK`.
- The owner pushed annotated tag `v0.2.0` to commit
  `9902183b92c1c94972481b9229d563dceca61eb8` (matching `dev`
  at the time). **Do not force-move or delete this tag.**
- Initial GitHub Release run failed during `git rev-parse HEAD` because
  the Fedora 44 GitHub Actions job container classified the checked-out
  workspace as `dubious ownership`. The build itself did not run.
- Patch the workflow on `dev`: trust only the current
  `$GITHUB_WORKSPACE` via `git config --global --add safe.directory`
  and add a `workflow_dispatch` path accepting an existing tag.
- **After patch merges to default branch `dev`**, use
  GitHub → Actions → **Fedora 44 Release** → **Run workflow** →
  Branch **dev**, tag input `v0.2.0`.
  The dispatch uses the fixed workflow from `dev` but checks out the
  original immutable `v0.2.0` source commit, validates the tag points
  to the source HEAD, and rebuilds identical-version artifacts.
- Inspect job exit status and
  `https://github.com/mujin0422/evidence-note-board/releases/tag/v0.2.0`;
  verify that RPM, Source RPM, GNOME50 ZIP and SHA256SUMS all exist.
  **Do not describe the release as published until that check succeeds.**

This recovery publishes the original tested tag without changing its
target commit, RPM version or the application's SQLite schema.
