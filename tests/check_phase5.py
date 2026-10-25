"""Phase-5 source and delivery validation; actual GNOME UI remains manual."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/"extension/boardView.js").read_text(encoding="utf-8")
dbus=(root/"extension/noteService.js").read_text(encoding="utf-8")
rust=(root/"backend/src/main.rs").read_text(encoding="utf-8")
settings=(root/"backend/src/settings.rs").read_text(encoding="utf-8")
for snippet in (
    "singleScreenLayout(",
    "getSettings()", "_toggleSettingsMenu()", "this._preferences.show_strings",
    "_scheduleReconnect()",
    "this._dirtyNotes.add(id)", "this._flushNote(id)", "this._dirtyView",
    "curveVisible(from,to,viewport)", "this._paintTimer", "this._reconnectTimer",
):
    assert snippet in js, snippet
assert "primaryMonitor(" not in js and "toolbarLayout(" not in js
assert "monitors-changed" not in js and "layoutManager.monitors" not in js
assert "unused import" not in settings
assert "use std::{fs, io::Write, path::PathBuf};" in settings
install=(root/"scripts/install-dev.sh").read_text(encoding="utf-8")
assert 'systemctl --user is-active --quiet evidence-note-board.service' in install
assert "Cần chạy scripts/install-backend-dev.sh trước khi bật extension." not in install
assert "GetSettings" in dbus and "SaveSettings" in dbus
assert "fn get_settings" in rust and "fn save_settings" in rust
assert "XDG_CONFIG_HOME" in settings and "rename(" in settings
assert "settings.json" in settings
assert "PRAGMA" in (root/"scripts/backup-board.py").read_text() or (
    "integrity_check" in (root/"scripts/backup-board.py").read_text())
for path in ["scripts/install-dev.sh","scripts/build-extension.sh",
             "tests/check_extension.py"]:
    assert "productionMath.js" in (root/path).read_text(encoding="utf-8")
print("Phase 5 static checks: PASS (not Fedora desktop acceptance)")
