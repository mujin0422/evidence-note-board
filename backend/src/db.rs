use rusqlite::{params, Connection, Error, OptionalExtension, Result, Row};
use std::{fs, io::Write, path::PathBuf};
use crate::assets;
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

const SCHEMA: &str = include_str!("../../db/migrations/0001_init.sql");
const BOARD_ID: &str = "default";

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub asset_path: Option<String>,
    pub mime_type: Option<String>,
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
    assets_dir: PathBuf,
}

impl Storage {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let assets_dir = path.parent().ok_or(Error::InvalidPath(path.to_path_buf()))?
            .join("assets");
        Self::initialize(conn, assets_dir)
    }

    fn initialize(mut conn: Connection, assets_dir: PathBuf) -> Result<Self> {
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
        Ok(Self { conn, assets_dir })
    }

    fn map_note(row: &Row<'_>, assets_dir: &Path) -> Result<Note> {
        let asset_name: Option<String> = row.get(11)?;
        let asset_path = asset_name.map(|name| assets_dir.join(name).to_string_lossy().into_owned());
        Ok(Note {
            id: row.get(0)?,
            note_type: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            x: row.get(4)?,
            y: row.get(5)?,
            width: row.get(6)?,
            height: row.get(7)?,
            rotation: row.get(8)?,
            color: row.get(9)?,
            z_index: row.get(10)?,
            asset_path,
            mime_type: row.get(12)?,
        })
    }

    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.type, COALESCE(n.title, ''), n.content, n.x, n.y,
                    n.width, n.height, n.rotation, n.color, n.z_index,
                    a.file_path, a.mime_type
               FROM notes n
               LEFT JOIN assets a ON a.note_id = n.id
              WHERE n.board_id = ?1
              ORDER BY n.z_index, n.created_at, n.id",
        )?;
        let notes = stmt.query_map([BOARD_ID], |row| Self::map_note(row, &self.assets_dir))?
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
        self.conn.query_row(
            "SELECT n.id, n.type, COALESCE(n.title, ''), n.content, n.x, n.y,
                    n.width, n.height, n.rotation, n.color, n.z_index,
                    a.file_path, a.mime_type
               FROM notes n
               LEFT JOIN assets a ON a.note_id = n.id
              WHERE n.board_id = ?1 AND n.id = ?2",
            params![BOARD_ID, id],
            |row| Self::map_note(row, &self.assets_dir),
        ).optional()
    }

    pub fn import_image(&mut self, path: &Path, x: f64, y: f64) -> Result<Note> {
        let data = assets::validate_file(path)
            .map_err(|error| Error::ToSqlConversionFailure(error))?;
        fs::create_dir_all(&self.assets_dir)
            .map_err(|error| Error::ToSqlConversionFailure(Box::new(error)))?;

        let id = Uuid::new_v4().to_string();
        let file_name = format!("{}.{}", id, data.ext);
        let destination = self.assets_dir.join(&file_name);
        let mut output = fs::OpenOptions::new().create_new(true).write(true)
            .open(&destination)
            .map_err(|error| Error::ToSqlConversionFailure(Box::new(error)))?;
        if let Err(error) = output.write_all(&data.bytes) {
            let _ = fs::remove_file(&destination);
            return Err(Error::ToSqlConversionFailure(Box::new(error)));
        }
        drop(output);

        // Limit initial visual footprint while preserving original ratio.
        let factor = (320.0 / f64::from(data.width))
            .min(240.0 / f64::from(data.height))
            .min(1.0);
        let visual_width = (f64::from(data.width) * factor).max(60.0) + 24.0;
        let visual_height = (f64::from(data.height) * factor).max(50.0) + 48.0;
        let tx_result: Result<()> = (|| {
            let tx = self.conn.transaction()?;
            tx.execute(
                "INSERT INTO notes
                 (id, board_id, type, title, content, x, y, width, height, rotation, color, z_index)
                 VALUES (?1, ?2, 'image', '', '', ?3, ?4, ?5, ?6, 0, '#F1E9D2',
                 (SELECT COALESCE(MAX(z_index), 0) + 1 FROM notes WHERE board_id = ?2))",
                params![id, BOARD_ID, x, y, visual_width, visual_height],
            )?;
            tx.execute(
                "INSERT INTO assets(id, note_id, file_path, mime_type, width, height, checksum)
                 VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, file_name, data.mime,
                        i64::from(data.width), i64::from(data.height), data.checksum],
            )?;
            tx.commit()
        })();
        if let Err(error) = tx_result {
            let _ = fs::remove_file(&destination);
            return Err(error);
        }
        self.get_note(&id)?.ok_or(Error::QueryReturnedNoRows)
    }

    pub fn update_note(&self, id: &str, title: &str, content: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND board_id = ?4",
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
        let asset: Option<String> = self.conn.query_row(
            "SELECT a.file_path FROM assets a JOIN notes n ON n.id=a.note_id
              WHERE n.id=?1 AND n.board_id=?2",
            params![id, BOARD_ID],
            |row| row.get(0),
        ).optional()?;
        let removed = self.conn.execute(
            "DELETE FROM notes WHERE id = ?1 AND board_id = ?2",
            params![id, BOARD_ID],
        )? == 1;
        if removed {
            if let Some(file_name) = asset {
                // The filename is generated by the backend, never passed by IPC.
                let path = self.assets_dir.join(file_name);
                if let Err(error) = fs::remove_file(path) {
                    eprintln!("Evidence Note Board: orphaned asset: {error}");
                }
            }
        }
        Ok(removed)
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
        Storage::initialize(Connection::open_in_memory().unwrap(), std::env::temp_dir()).unwrap()
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
    #[test]
    fn import_image_persists_copy_and_cleans_on_delete() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("image.png");
        let image = image::RgbImage::new(120, 80);
        image.save_with_format(&path, image::ImageFormat::Png).unwrap();
        let db_path = temp.path().join("evidence.db");

        let saved = {
            let mut db = Storage::open(&db_path).unwrap();
            let note = db.import_image(&path, 42.0, 70.0).unwrap();
            assert_eq!(note.note_type, "image");
            assert_eq!(note.mime_type.as_deref(), Some("image/png"));
            assert!(Path::new(note.asset_path.as_ref().unwrap()).exists());
            note
        };

        fs::remove_file(&path).unwrap();
        let db = Storage::open(&db_path).unwrap();
        let all = db.list_notes().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, saved.id);
        let stored = saved.asset_path.unwrap();
        assert!(Path::new(&stored).exists());
        assert!(db.move_note(&saved.id, 20.0, 30.0).unwrap());
        assert!(db.delete_note(&saved.id).unwrap());
        assert!(!Path::new(&stored).exists());
        assert!(db.list_notes().unwrap().is_empty());
    }

    #[test]
    fn keeps_text_notes_during_image_import() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = Storage::open(&temp.path().join("board.sqlite")).unwrap();
        let text = db.create_note("", "Tiếng Việt\nmultiline", 0.0, 5.0).unwrap();
        let image_path = temp.path().join("not-an-image.png");
        fs::write(&image_path, b"garbage").unwrap();
        assert!(db.import_image(&image_path, 4.0, 5.0).is_err());
        let notes = db.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, text.id);
        assert_eq!(notes[0].note_type, "text");
    }

}
