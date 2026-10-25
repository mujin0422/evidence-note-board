#!/usr/bin/env bash
set -euo pipefail

# Run only inside dbus-run-session. This is service/DB integration, not a
# GNOME compositor test. All data is kept in a disposable temporary directory.
: "${DBUS_SESSION_BUS_ADDRESS:?Run using dbus-run-session}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="io.github.mujin0422.EvidenceNoteBoard"
OBJECT="/io/github/mujin0422/EvidenceNoteBoard"
WORK="$(mktemp -d)"
export XDG_DATA_HOME="$WORK/data"
PID=""

cleanup() {
    if [[ -n "$PID" ]]; then
        kill "$PID" 2>/dev/null || true
        wait "$PID" 2>/dev/null || true
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT

start() {
    "$ROOT/backend/target/debug/evidence-note-boardd" &
    PID=$!
    local ready=0
    for _ in $(seq 1 40); do
        if busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" ListNotes >/dev/null 2>&1; then
            ready=1
            break
        fi
        sleep 0.25
    done
    [[ "$ready" == 1 ]] || { echo "D-Bus service not ready" >&2; exit 1; }
}

start
busctl --user introspect "$SERVICE" "$OBJECT" | grep -q CreateNote
first="$(busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" ListNotes)"
[[ "$first" == *'[]'* ]] || { echo "Expected empty board" >&2; exit 1; }

busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" CreateNote ssdd "Smoke Test" "Xin chào" 17.0 23.0 >/dev/null
stored="$(busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" ListNotes)"
[[ "$stored" == *'Smoke Test'* ]] || { echo "Note not found after create" >&2; exit 1; }

# Restart service process and verify durable SQLite data.
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
PID=""
start
restored="$(busctl --user call "$SERVICE" "$OBJECT" "$SERVICE" ListNotes)"
[[ "$restored" == *'Smoke Test'* ]] || { echo "Persistence failed after restart" >&2; exit 1; }
test -s "$XDG_DATA_HOME/evidence-note-board/evidence.db"
echo "D-Bus / SQLite smoke test passed"
