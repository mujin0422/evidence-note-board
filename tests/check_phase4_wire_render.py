"""Source regression only, not a compositor screenshot test."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
js = (root / "extension/boardView.js").read_text(encoding="utf-8")
css = (root / "extension/stylesheet.css").read_text(encoding="utf-8")
schema = (root / "db/migrations/0001_init.sql").read_text(encoding="utf-8")
db = (root / "backend/src/db.rs").read_text(encoding="utf-8")
api = (root / "backend/src/main.rs").read_text(encoding="utf-8")
assert "this._root.add_child(this._stringsLayer)" in js
assert "this._root.set_child_below_sibling(this._stringsLayer, this._world)" in js
assert "this._world.add_child(this._stringsLayer)" not in js
assert "this._stringsLayer.set_size(4000, 3000)" not in js
assert "this._stringsLayer.set_size(global.stage.width, global.stage.height)" in js
assert "draw(project(pinCenter(a)), project(pinCenter(b)))" in js
assert "project(this._stringDraft.target)" in js
assert "this._queueStrings();" in js
assert "red string repaint failed" in js
assert "evidence-strings-layer" in css
# Self-link forbidden in all layers, plus SQLite constraint.
assert "draft.sourceId === targetId" in js
assert "source_note_id == target_note_id" in api
assert "if source == target" in db
assert "CHECK (source_pin_id <> target_pin_id)" in schema
# Pin deletion is note deletion; FKs cascade pins -> connections.
assert "REFERENCES notes(id) ON DELETE CASCADE" in schema
assert "REFERENCES pins(id) ON DELETE CASCADE" in schema
assert 'conn.pragma_update(None, "foreign_keys", "ON")' in db
assert "this._service.deleteNote(id)" in js
assert "edge.source_note_id === id || edge.target_note_id === id" in js
print("Wire renderer and relational integrity static regression: OK")
