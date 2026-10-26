#!/usr/bin/env bash
# Build a reproducible Fedora source RPM and binary RPM from the current
# committed checkout. Vendor locked crates into the SRPM; rpmbuild is offline.
# Does not install or run the application. Does not touch user data.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for command in git cargo rpmbuild tar python3 sha256sum; do
    command -v "$command" >/dev/null || {
        echo "Missing tool: $command" >&2
        exit 1
    }
done
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Commit tracked changes before building a release source archive" >&2
    exit 1
fi
version="$(python3 - <<'PY'
import tomllib
with open('backend/Cargo.toml','rb') as f:
    print(tomllib.load(f)['package']['version'])
PY
)"
python3 scripts/check-release-version.py "$version"

name="evidence-note-board"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tree="$work/$name-$version"
mkdir -p "$tree" "$work/rpmbuild/"{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
# Use checked-in content (not working-tree files) for all release sources.
git archive --format=tar HEAD | tar -xf - -C "$tree"
mkdir -p "$tree/.cargo"
echo "Vendoring locked Cargo dependencies for $version..."
(
    cd "$tree"
    cargo vendor --locked --manifest-path backend/Cargo.toml vendor > .cargo/config.toml
)
# The archive includes the exact Cargo.lock and offline dependencies.
tar -czf "$work/rpmbuild/SOURCES/$name-$version.tar.gz" \
    -C "$work" "$name-$version"
echo "Building Fedora source and binary RPM..."
rpmbuild -ba \
    --define "_topdir $work/rpmbuild" \
    packaging/evidence-note-board.spec

mkdir -p "$ROOT/dist"
find "$work/rpmbuild/RPMS" "$work/rpmbuild/SRPMS" -type f \
    \( -name '*.rpm' \) -exec cp -v {} "$ROOT/dist/" \;
bash scripts/build-extension.sh

# Prevent stale local RPMs or ZIPs from leaking into checksums/release.
python3 scripts/verify-release-artifacts.py "$version" "$ROOT/dist"
(
    cd "$ROOT/dist"
    sha256sum "$name-$version"-*.rpm "$name-$version"-gnome50.zip > SHA256SUMS
)
echo "Release build ready in $ROOT/dist"
cat "$ROOT/dist/SHA256SUMS"
