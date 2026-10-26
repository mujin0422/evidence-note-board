#!/usr/bin/env bash
# Inspect installed payload and metadata without requiring a desktop session.
set -euo pipefail
DIR="${1:-dist}"
shopt -s nullglob
rpms=("$DIR"/*.x86_64.rpm)
srpms=("$DIR"/*.src.rpm)
if (( ${#rpms[@]} != 1 || ${#srpms[@]} != 1 )); then
    echo "Expected one binary and one source RPM" >&2
    exit 1
fi
rpm_file="${rpms[0]}"
files="$(rpm -qpl "$rpm_file")"
deps="$(rpm -qp --requires "$rpm_file")"
scripts="$(rpm -qp --scripts "$rpm_file")"
for path in \
    /usr/bin/evidence-note-boardd \
    /usr/bin/evidence-note-board-backup \
    /usr/share/gnome-shell/extensions/evidence-note-board@mujin0422.github.io/metadata.json \
    /usr/share/gnome-shell/extensions/evidence-note-board@mujin0422.github.io/ui/boardView.js \
    /usr/share/dbus-1/services/io.github.mujin0422.EvidenceNoteBoard.service; do
    grep -Fq "$path" <<< "$files" || {
        echo "RPM missing $path" >&2
        exit 1
    }
done
grep -Fq "zenity" <<< "$deps"
grep -Fq "gnome-shell" <<< "$deps"
# rpm user-unit scriptlets must exist; local developer paths must not.
grep -Eiq 'systemctl.*--user|systemd.*user' <<< "$scripts" || {
    echo "Systemd user scriptlet missing" >&2
    exit 1
}
if grep -Fq "/home/" <<< "$files"; then
    echo "User-specific path accidentally shipped" >&2
    exit 1
fi
rpm -qpi "$rpm_file"
echo "Fedora RPM metadata and payload: OK"
