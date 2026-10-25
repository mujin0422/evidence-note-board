"""Verify user session activation files and fail-safe installer wiring.

CI cannot simulate a real Fedora GNOME Classic login. This test only checks
rendered entry fields and source-level integration with the service watcher.
"""
import configparser
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
UNIT = ROOT / "packaging/evidence-note-board.service"
ENTRY = ROOT / "packaging/io.github.mujin0422.EvidenceNoteBoard.service.in"
INSTALLER = (ROOT / "scripts/install-backend-dev.sh").read_text(encoding="utf-8")
SETUP = (ROOT / "scripts/setup-dev.sh").read_text(encoding="utf-8")
JS = (ROOT / "extension/boardView.js").read_text(encoding="utf-8")

def parse(path):
    config = configparser.ConfigParser(interpolation=None)
    config.read(path, encoding="utf-8")
    return config

unit = parse(UNIT)
assert unit["Service"]["Type"] == "dbus"
assert unit["Service"]["BusName"] == "io.github.mujin0422.EvidenceNoteBoard"
assert unit["Install"]["WantedBy"] == "default.target"
assert unit["Service"]["Restart"] == "on-failure"

with tempfile.TemporaryDirectory() as td:
    binary = pathlib.Path(td, "bin", "evidence-note-boardd")
    output = pathlib.Path(td, "activation.service")
    subprocess.run([
        sys.executable, str(ROOT / "scripts/render-dbus-service.py"),
        str(ENTRY), str(binary), str(output)
    ], check=True)
    activation = parse(output)
    assert activation["D-BUS Service"]["Name"] == unit["Service"]["BusName"]
    assert activation["D-BUS Service"]["SystemdService"] == "evidence-note-board.service"
    assert str(binary) in activation["D-BUS Service"]["Exec"]
    assert "@EXEC_PATH@" not in output.read_text(encoding="utf-8")

assert 'systemctl --user daemon-reload' in INSTALLER
assert 'systemctl --user enable "$UNIT"' in INSTALLER
assert 'systemctl --user restart "$UNIT"' in INSTALLER
assert 'busctl --user call "$SERVICE"' in INSTALLER
assert "install-backend-dev.sh" in SETUP and "install-dev.sh" in SETUP
assert "Gio.bus_watch_name(" in JS
assert "Gio.BusNameWatcherFlags.AUTO_START" in JS
assert "Gio.bus_unwatch_name(this._backendWatchId)" in JS
assert "revision !== this._connectionRevision" in JS

print("Autostart and D-Bus reconnect static checks: OK (Fedora session not tested)")
