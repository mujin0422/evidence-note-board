"""Validate proposed SQLite migration using the standard library only."""
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
sql = (ROOT / "db/migrations/0001_init.sql").read_text(encoding="utf-8")
with sqlite3.connect(":memory:") as db:
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(sql)
    tables = {
        row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }
    required = {"boards", "notes", "pins", "connections", "assets", "board_view_state"}
    assert required <= tables, (required - tables)
    db.execute("INSERT INTO boards (id, name) VALUES ('b1', 'Sample')")
    db.execute(
        "INSERT INTO notes (id, board_id, type, x, y, width, height, color) "
        "VALUES ('n1', 'b1', 'text', 0, 0, 200, 160, '#E9D898')"
    )
    db.execute(
        "INSERT INTO pins (id, note_id, local_x, local_y) "
        "VALUES ('p1', 'n1', 0.5, 0.05)"
    )
    try:
        db.execute(
            "INSERT INTO connections (id, source_pin_id, target_pin_id) "
            "VALUES ('c1', 'p1', 'missing')"
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Foreign keys are not enforced")
print("Migration schema and foreign key check: OK")
