"""Regression checks for previously broken GNOME 50 rendering code.

These source checks are NOT a substitute for compositor tests on Fedora.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "extension/boardView.js").read_text(encoding="utf-8")
metadata = (ROOT / "extension/metadata.json").read_text(encoding="utf-8")

assert "import Cogl from 'gi://Cogl';" in source
assert "new Cogl.Color()" in source
assert "init_from_4f(" in source
# Ignore source comments when searching for removed API invocations.
code_only = "\\n".join(line for line in source.splitlines()
                      if not line.lstrip().startswith("//"))
assert "new Clutter.Color" not in code_only, "Mutter 50 removed Clutter.Color"
assert "get_click_count(" not in code_only, "Mutter 50 has no get_click_count()"
assert "reactive: true,\n            editable: true," in source
assert "ĐÃ LƯU NHƯNG LỖI HIỂN THỊ" in source
assert '"version": 3' in metadata
print("GNOME 50 API regression checks: OK (static only)")
