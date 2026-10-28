#!/usr/bin/env python3
"""v0.4.0 board migration and GNOME lifecycle checks (static, not compositor tests)."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
initial = (ROOT / "db/migrations/0001_init.sql").read_text()
upgrade = (ROOT / "db/migrations/0002_multi_boards.sql").read_text()
with sqlite3.connect(":memory:") as db:
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(initial)
    db.execute("INSERT INTO boards(id,name) VALUES('default','Evidence Board')")
    db.execute("INSERT INTO notes(id,board_id,type,x,y,width,height) VALUES('old','default','text',0,0,270,185)")
    db.execute("INSERT INTO board_view_state(board_id,zoom) VALUES('default',1.75)")
    db.executescript(upgrade)
    assert db.execute("SELECT active_board_id, next_board_number FROM board_state").fetchone() == ("default", 2)
    assert db.execute("SELECT id,name FROM boards").fetchall() == [("default","Evidence Board")]
    assert db.execute("SELECT board_id FROM notes WHERE id='old'").fetchone() == ("default",)
    assert db.execute("SELECT zoom FROM board_view_state WHERE board_id='default'").fetchone()[0] == 1.75
    db.execute("INSERT INTO boards(id,name) VALUES('b2','board #2')")
    db.execute("INSERT INTO board_view_state(board_id) VALUES('b2')")
    db.execute("UPDATE board_state SET active_board_id='b2' WHERE id=1")
    try:
        db.execute("UPDATE board_state SET active_board_id='missing' WHERE id=1")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Board selection accepted invalid foreign key")
    assert db.execute("SELECT active_board_id FROM board_state").fetchone()[0] == "b2"

rust = (ROOT / "backend/src/db.rs").read_text()
api = (ROOT / "backend/src/main.rs").read_text()
service = (ROOT / "extension/services/noteService.js").read_text()
ui = (ROOT / "extension/ui/boardView.js").read_text()
for method in ("fn list_boards", "fn create_board", "fn rename_board", "fn select_board", "fn delete_board"):
    assert method in api, method
for symbol in ("_switchBoard(id)", "_createBoard()", "_renameBoard(id, entry)",
               "_clearBoardActors()", "_renderNoteBatch(notes, revision)",
               "GLib.idle_add", "await service.flushWrites()", "this._notes.clear()"):
    assert symbol in ui, symbol
for method in ("ListBoardsAsync", "CreateBoardAsync", "RenameBoardAsync", "SelectBoardAsync", "DeleteBoardAsync"):
    assert method in service, method
assert "WHERE n.board_id = ?1" in rust
assert "this._renderNoteBatch(notes, revision)" in ui
assert "const decodeSize=boundedImageDecodeSize(photoWidth,photoHeight,paintScale)" in ui
css = (ROOT / "extension/stylesheet.css").read_text()
assert "if version < 2 {" in rust, "Do not resurrect explicitly deleted legacy board"
assert "tx.execute(\"DELETE FROM boards WHERE id=?1\"" in rust
assert "board_count <= 1" in rust
assert "tx.commit()?;" in rust
assert "this._confirmDeleteBoard(board)" in ui
assert "_deleteBoard(id)" in ui
assert "this._boards.length<=1" in ui
assert "deleteBoard(id)" in service
assert "text:'BOARDS'" in ui
assert "label:'Thêm board'" in ui
assert "action('+ Tạo board'" not in ui
assert "document-edit-symbolic" in ui and "user-trash-symbolic" in ui
assert "nameLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END)" in ui
assert "evidence-board-add-button" in css
assert ".evidence-board-confirm-delete" in css
assert ".evidence-board-row .evidence-settings-action:first-child" not in css
print("v0.4.0 multi-board migration and lifecycle checks: OK (static only)")
