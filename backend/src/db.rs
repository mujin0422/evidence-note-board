use rusqlite::{params, Connection, Error, OptionalExtension, Result};
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

const SCHEMA: &str = include_str!("../../db/migrations/0001_init.sql");
const BOARD_ID: &str = "default";

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub color: String,
    pub z_index: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct View {
    pub zoom: f64,
    pub pan_x: f64,
    pub pan_y: f64,
}

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::initialize(conn)
    }

    fn initialize(mut conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 3000)?;
        // A bundled SQLite version ships with rusqlite; journal mode is per database.
        // In-memory tests use SQLite's in-memory journal mode instead.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        let version: i64 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > 1 {
            return Err(Error::InvalidQuery);
        }
        if version == 0 {
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.pragma_update(None, "user_version", 1)?;
            tx.commit()?;
        }
        conn.execute(
            "INSERT OR IGNORE INTO boards (id, name) VALUES (?1, ?2)",
            params![BOARD_ID, "Evidence Board"],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO board_view_state (board_id) VALUES (?1)",
            [BOARD_ID],
        )?;
        Ok(Self { conn })
    }

    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, COALESCE(title, ''), content, x, y, width, height, rotation, color, z_index
             FROM notes WHERE board_id = ?1 AND type = 'text' ORDER BY z_index, created_at, id",
        )?;
        let notes = stmt.query_map([BOARD_ID], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                x: row.get(3)?,
                y: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                rotation: row.get(7)?,
                color: row.get(8)?,
                z_index: row.get(9)?,
            })
        })?
        .collect();
        notes
    }

    pub fn create_note(&self, title: &str, content: &str, x: f64, y: f64) -> Result<Note> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO notes
             (id, board_id, type, title, content, x, y, width, height, rotation, color, z_index)
             VALUES (?1, ?2, 'text', ?3, ?4, ?5, ?6, 270, 185, 0, '#E9D898',
                (SELECT COALESCE(MAX(z_index), 0) + 1 FROM notes WHERE board_id = ?2))",
            params![id, BOARD_ID, title, content, x, y],
        )?;
        self.get_note(&id)?.ok_or(Error::QueryReturnedNoRows)
    }

    fn get_note(&self, id: &str) -> Result<Option<Note>> {
        self.conn
            .query_row(
                "SELECT id, COALESCE(title, ''), content, x, y, width, height, rotation, color, z_index
                 FROM notes WHERE board_id = ?1 AND type = 'text' AND id = ?2",
                params![BOARD_ID, id],
                |row| {
                    Ok(Note {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        content: row.get(2)?,
                        x: row.get(3)?,
                        y: row.get(4)?,
                        width: row.get(5)?,
                        height: row.get(6)?,
                        rotation: row.get(7)?,
                        color: row.get(8)?,
                        z_index: row.get(9)?,
                    })
                },
            )
            .optional()
    }

    pub fn update_note(&self, id: &str, title: &str, content: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND board_id = ?4 AND type = 'text'",
            params![title, content, id, BOARD_ID],
        )? == 1)
    }

    pub fn move_note(&self, id: &str, x: f64, y: f64) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET x = ?1, y = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND board_id = ?4 AND type = 'text'",
            params![x, y, id, BOARD_ID],
        )? == 1)
    }

    pub fn delete_note(&self, id: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "DELETE FROM notes WHERE id = ?1 AND board_id = ?2 AND type = 'text'",
            params![id, BOARD_ID],
        )? == 1)
    }

    pub fn load_view(&self) -> Result<View> {
        self.conn.query_row(
            "SELECT zoom, pan_x, pan_y FROM board_view_state WHERE board_id = ?1",
            [BOARD_ID],
            |row| Ok(View {
                zoom: row.get(0)?,
                pan_x: row.get(1)?,
                pan_y: row.get(2)?,
            }),
        )
    }

    pub fn save_view(&self, zoom: f64, pan_x: f64, pan_y: f64) -> Result<()> {
        self.conn.execute(
            "UPDATE board_view_state SET zoom = ?1, pan_x = ?2, pan_y = ?3 WHERE board_id = ?4",
            params![zoom, pan_x, pan_y, BOARD_ID],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Storage {
        Storage::initialize(Connection::open_in_memory().unwrap()).unwrap()
    }

    #[test]
    fn migration_and_text_crud() {
        let db = mem();
        assert!(db.list_notes().unwrap().is_empty());
        let n = db.create_note("Tiêu đề", "Dòng 1\nDòng 2", 10.0, 20.0).unwrap();
        assert_eq!(db.list_notes().unwrap().len(), 1);
        assert_eq!(n.content, "Dòng 1\nDòng 2");
        assert!(db.update_note(&n.id, "Đã sửa", "Xin chào").unwrap());
        assert!(db.move_note(&n.id, -50.0, 99.0).unwrap());
        let saved = db.list_notes().unwrap().remove(0);
        assert_eq!(saved.x, -50.0);
        assert_eq!(saved.title, "Đã sửa");
        assert_eq!(saved.content, "Xin chào");
        assert!(db.delete_note(&n.id).unwrap());
        assert!(!db.delete_note(&n.id).unwrap());
        assert!(db.list_notes().unwrap().is_empty());
    }

    #[test]
    fn view_state_and_foreign_keys() {
        let db = mem();
        db.save_view(2.0, -75.0, 36.0).unwrap();
        let state = db.load_view().unwrap();
        assert_eq!((state.zoom, state.pan_x, state.pan_y), (2.0, -75.0, 36.0));
        assert!(db.conn.execute(
            "INSERT INTO notes (id, board_id, type, x, y, width, height) VALUES
             ('bad', 'missing', 'text', 0, 0, 20, 20)", [],
        ).is_err());
    }

    #[test]
    fn reopen_preserves_data_and_schema_version() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("evidence.db");
        let id = {
            let db = Storage::open(&path).unwrap();
            db.create_note("persistent", "saved", 4.0, 5.0).unwrap().id
        };
        let db = Storage::open(&path).unwrap();
        assert_eq!(db.list_notes().unwrap().len(), 1);
        assert_eq!(db.list_notes().unwrap()[0].id, id);
        let v: i64 = db.conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
    }
}
