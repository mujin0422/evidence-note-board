//! SQLite persistence for the single local evidence board.
//!
//! This module owns migrations, note/asset CRUD, camera state and red-string
//! edges. Callers validate IPC input; this layer maintains database and file
//! consistency with transactions, foreign keys and best-effort cleanup.

use crate::assets;
use rusqlite::{params, Connection, Error, OptionalExtension, Result, Row};
use serde::Serialize;
use std::{fs, io::Write, path::{Path, PathBuf}};
use uuid::Uuid;

const SCHEMA: &str = include_str!("../../db/migrations/0001_init.sql");
const BOARD_ID: &str = "default";

/// Serializable note DTO returned to the GNOME extension.
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

/// Serializable red-string edge expressed using note IDs.
#[derive(Debug, Clone, Serialize)]
pub struct ConnectionEdge {
    pub id: String,
    pub source_note_id: String,
    pub target_note_id: String,
    pub color: String,
}

/// Persisted board camera state.
#[derive(Debug, Clone, Serialize)]
pub struct View {
    pub zoom: f64,
    pub pan_x: f64,
    pub pan_y: f64,
}

/// Owns the SQLite connection and the adjacent managed-asset directory.
pub struct Storage {
    conn: Connection,
    assets_dir: PathBuf,
}

impl Storage {
    /// Open a database file and bring it to the schema expected by this build.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let assets_dir = path.parent().ok_or(Error::InvalidPath(path.to_path_buf()))?
            .join("assets");
        Self::initialize(conn, assets_dir)
    }

    /// Configure SQLite, apply the initial migration and backfill stable pins.
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
        // An index is safe to add to existing schema-v1 databases and keeps
        // duplicate-image lookup cheap without a destructive migration.
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_checksum ON assets(checksum)",
            [],
        )?;
        // Backfill Phase-4 pins for every existing Phase-2/3 note without
        // changing schema/user_version or destroying existing pins/strings.
        conn.execute(
            "INSERT INTO pins (id, note_id, local_x, local_y, style)
             SELECT n.id, n.id, n.width / 2.0, 0, 'red'
             FROM notes n WHERE n.board_id=?1
             AND NOT EXISTS (SELECT 1 FROM pins p WHERE p.note_id=n.id)",
            [BOARD_ID],
        )?;
        Ok(Self { conn, assets_dir })
    }

    /// Convert one joined SQL row into the API-facing note representation.
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

    /// Return all notes in deterministic visual stacking order.
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

    /// Insert a text note and its default top-center pin.
    pub fn create_note(&self, title: &str, content: &str, x: f64, y: f64) -> Result<Note> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO notes
             (id, board_id, type, title, content, x, y, width, height, rotation, color, z_index)
             VALUES (?1, ?2, 'text', ?3, ?4, ?5, ?6, 270, 185, 0, '#E9D898',
                (SELECT COALESCE(MAX(z_index), 0) + 1 FROM notes WHERE board_id = ?2))",
            params![id, BOARD_ID, title, content, x, y],
        )?;
        self.conn.execute(
            "INSERT INTO pins (id, note_id, local_x, local_y) VALUES (?1, ?1, 135, 0)",
            [&id],
        )?;
        self.get_note(&id)?.ok_or(Error::QueryReturnedNoRows)
    }

    /// Fetch one note scoped to the default board.
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

    /// Validate and copy an image, then atomically register its note metadata.
    pub fn import_image(&mut self, path: &Path, x: f64, y: f64) -> Result<Note> {
        let data = assets::validate_file(path)
            .map_err(|error| Error::ToSqlConversionFailure(error))?;
        fs::create_dir_all(&self.assets_dir)
            .map_err(|error| Error::ToSqlConversionFailure(Box::new(error)))?;

        let id = Uuid::new_v4().to_string();
        let file_name = format!("{}.{}", id, data.ext);
        let destination = self.assets_dir.join(&file_name);
        let duplicate: Option<String> = self.conn.query_row(
            "SELECT file_path FROM assets WHERE checksum=?1 LIMIT 1",
            [&data.checksum], |row| row.get(0),
        ).optional()?;
        let linked = duplicate.as_deref().is_some_and(|existing|
            fs::hard_link(self.assets_dir.join(existing), &destination).is_ok());
        if !linked {
            let mut output = fs::OpenOptions::new().create_new(true).write(true)
                .open(&destination)
                .map_err(|error| Error::ToSqlConversionFailure(Box::new(error)))?;
            if let Err(error) = output.write_all(&data.bytes) {
                let _ = fs::remove_file(&destination);
                return Err(Error::ToSqlConversionFailure(Box::new(error)));
            }
            drop(output);
        }

        // Limit initial visual footprint while preserving original ratio.
        let factor = (320.0 / f64::from(data.width))
            .min(240.0 / f64::from(data.height))
            .min(1.0);
        let visual_width = ((f64::from(data.width) * factor).max(60.0) + 24.0)
            .max(220.0);
        let visual_height = (((visual_width - 24.0) *
            f64::from(data.height) / f64::from(data.width)) + 48.0)
            .clamp(110.0, 6000.0);
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
                "INSERT INTO pins (id, note_id, local_x, local_y) VALUES (?1, ?1, ?2, 0)",
                params![id, visual_width / 2.0],
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

    /// Update editable text fields; image cards intentionally reject this path.
    pub fn update_note(&self, id: &str, title: &str, content: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND board_id = ?4 AND type = 'text'",
            params![title, content, id, BOARD_ID],
        )? == 1)
    }

    /// Persist the world-space position of either note type.
    pub fn move_note(&self, id: &str, x: f64, y: f64) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET x = ?1, y = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND board_id = ?4",
            params![x, y, id, BOARD_ID],
        )? == 1)
    }

    /// Geometry is persisted for both text notes and image cards. Existing
    /// note rows use the same columns, so no destructive schema migration.
    pub fn update_geometry(&self, id: &str, width: f64, height: f64, rotation: f64) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET width=?1, height=?2, rotation=?3, updated_at=unixepoch()
             WHERE id=?4 AND board_id=?5",
            params![width, height, rotation, id, BOARD_ID],
        )? == 1)
    }

    /// Persist one validated paper color for a text note.
    pub fn update_color(&self, id: &str, color: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "UPDATE notes SET color=?1, updated_at=unixepoch()
             WHERE id=?2 AND board_id=?3 AND type='text'",
            params![color, id, BOARD_ID],
        )? == 1)
    }

    /// Red strings are edges between stable pin IDs, resolved from note IDs.
    /// SQLite foreign keys cascade when either note/pin is removed.
    pub fn list_connections(&self) -> Result<Vec<ConnectionEdge>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, s.note_id, t.note_id, c.color
             FROM connections c
             JOIN pins s ON s.id=c.source_pin_id
             JOIN pins t ON t.id=c.target_pin_id
             JOIN notes ns ON ns.id=s.note_id AND ns.board_id=?1
             JOIN notes nt ON nt.id=t.note_id AND nt.board_id=?1
             ORDER BY c.created_at, c.id",
        )?;
        let rows = stmt.query_map([BOARD_ID], |row| Ok(ConnectionEdge {
            id: row.get(0)?,
            source_note_id: row.get(1)?,
            target_note_id: row.get(2)?,
            color: row.get(3)?,
        }))?;
        rows.collect()
    }

    pub fn create_connection(&mut self, source: &str, target: &str) -> Result<ConnectionEdge> {
        if source == target { return Err(Error::InvalidQuery); }
        let resolve_pin = |db: &Connection, note: &str| -> Result<String> {
            db.query_row(
                "SELECT p.id FROM pins p JOIN notes n ON n.id=p.note_id
                 WHERE p.note_id=?1 AND n.board_id=?2 ORDER BY p.rowid LIMIT 1",
                params![note, BOARD_ID], |row| row.get(0))
        };
        let source_pin = resolve_pin(&self.conn, source)?;
        let target_pin = resolve_pin(&self.conn, target)?;
        // Idempotent unordered pair (A-B == B-A): repeated click
        // does not create visually stacked duplicate strings.
        let existing: Option<String> = self.conn.query_row(
            "SELECT id FROM connections WHERE
             (source_pin_id=?1 AND target_pin_id=?2) OR
             (source_pin_id=?2 AND target_pin_id=?1) LIMIT 1",
            params![source_pin, target_pin], |row| row.get(0)
        ).optional()?;
        if let Some(id) = existing {
            return self.list_connections()?.into_iter()
                .find(|edge| edge.id==id).ok_or(Error::QueryReturnedNoRows);
        }
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO connections (id,source_pin_id,target_pin_id,color,style)
             VALUES (?1,?2,?3,'#A32626','string')",
            params![id, source_pin, target_pin],
        )?;
        Ok(ConnectionEdge {
            id, source_note_id: source.to_owned(), target_note_id: target.to_owned(),
            color: "#A32626".to_string(),
        })
    }

    /// Remove a red-string edge owned by the current board.
    pub fn delete_connection(&self, id: &str) -> Result<bool> {
        Ok(self.conn.execute(
            "DELETE FROM connections WHERE id=?1 AND EXISTS (
                 SELECT 1 FROM pins a JOIN notes n ON n.id=a.note_id
                 WHERE a.id=connections.source_pin_id AND n.board_id=?2)",
            params![id, BOARD_ID],
        )? == 1)
    }

    /// Delete a note and remove its managed asset after the DB row is gone.
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

    /// Load the one camera row created during initialization.
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

    /// Persist zoom and pan without changing any note coordinates.
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
        assert!(db.update_color(&n.id, "#FFFFFF").unwrap());
        assert!(db.move_note(&n.id, -50.0, 99.0).unwrap());
        let saved = db.list_notes().unwrap().remove(0);
        assert_eq!(saved.x, -50.0);
        assert_eq!(saved.title, "Đã sửa");
        assert_eq!(saved.content, "Xin chào");
        assert_eq!(saved.color, "#FFFFFF");
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

    #[cfg(unix)]
    #[test]
    fn repeated_imports_share_disk_blocks_and_delete_independently() {
        use std::os::unix::fs::MetadataExt;

        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("same.png");
        image::RgbImage::new(80, 60)
            .save_with_format(&source, image::ImageFormat::Png).unwrap();
        let mut db = Storage::open(&temp.path().join("board.db")).unwrap();
        let first = db.import_image(&source, 0.0, 0.0).unwrap();
        let second = db.import_image(&source, 100.0, 100.0).unwrap();
        let first_path = PathBuf::from(first.asset_path.unwrap());
        let second_path = PathBuf::from(second.asset_path.unwrap());

        assert_ne!(first_path, second_path);
        assert_eq!(fs::metadata(&first_path).unwrap().ino(),
            fs::metadata(&second_path).unwrap().ino());
        assert!(db.delete_note(&first.id).unwrap());
        assert!(!first_path.exists());
        assert!(second_path.exists());
        assert!(db.delete_note(&second.id).unwrap());
        assert!(!second_path.exists());
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

    #[test]
    fn geometry_and_landscape_image_survive_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let original = temp.path().join("landscape.png");
        image::RgbImage::new(240, 120)
            .save_with_format(&original, image::ImageFormat::Png).unwrap();
        let path = temp.path().join("evidence.db");
        let photo = {
            let mut db = Storage::open(&path).unwrap();
            let photo = db.import_image(&original, 10.0, 20.0).unwrap();
            assert!(photo.width > photo.height);
            assert!(db.update_geometry(&photo.id, 360.0, 216.0, -15.0).unwrap());
            photo
        };
        let db = Storage::open(&path).unwrap();
        let photo_after = db.list_notes().unwrap().into_iter()
            .find(|n| n.id == photo.id).unwrap();
        assert_eq!(photo_after.note_type, "image");
        assert_eq!((photo_after.width, photo_after.height, photo_after.rotation),
            (360.0, 216.0, -15.0));
        let saved_file = photo_after.asset_path.unwrap();
        assert!(Path::new(&saved_file).exists());
        assert!(db.delete_note(&photo.id).unwrap());
        assert!(!Path::new(&saved_file).exists());
    }
    #[test]
    fn strings_persist_backfill_and_cascade_with_deleted_notes() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("board.db");
        let (a, b, edge_id) = {
            let mut db = Storage::open(&path).unwrap();
            let a = db.create_note("", "Note A", 0.0, 0.0).unwrap().id;
            let b = db.create_note("", "Note B", 200.0, 150.0).unwrap().id;
            assert!(db.create_connection(&a, &a).is_err());
            assert!(db.create_connection(&a, "nonexistent").is_err());
            let edge = db.create_connection(&a, &b).unwrap();
            assert_eq!(db.create_connection(&b, &a).unwrap().id, edge.id);
            assert_eq!(db.list_connections().unwrap().len(), 1);
            (a, b, edge.id)
        };
        let mut db = Storage::open(&path).unwrap();
        let edge = db.list_connections().unwrap().pop().unwrap();
        assert_eq!(edge.id, edge_id);
        assert_eq!(edge.source_note_id, a);
        assert_eq!(edge.target_note_id, b);
        assert!(db.delete_connection(&edge.id).unwrap());
        assert!(db.list_connections().unwrap().is_empty());
        let created = db.create_connection(&a, &b).unwrap();
        assert!(db.delete_note(&a).unwrap());
        assert!(db.list_connections().unwrap().is_empty());
        assert!(!db.delete_connection(&created.id).unwrap());
        assert_eq!(db.list_notes().unwrap().len(), 1);
    }

    #[test]
    fn deleting_a_pin_owner_removes_all_its_edges_but_keeps_unrelated_edges() {
        let mut db = mem();
        let a = db.create_note("", "hub", 0.0, 0.0).unwrap().id;
        let b = db.create_note("", "leaf", 100.0, 0.0).unwrap().id;
        let c = db.create_note("", "leaf", 200.0, 0.0).unwrap().id;
        let d = db.create_note("", "independent", 300.0, 0.0).unwrap().id;
        let e = db.create_note("", "independent", 400.0, 0.0).unwrap().id;
        // Prevent self-links in backend, not just UI.
        assert!(db.create_connection(&a, &a).is_err());
        let ab = db.create_connection(&a, &b).unwrap();
        let ac = db.create_connection(&a, &c).unwrap();
        let de = db.create_connection(&d, &e).unwrap();
        assert_eq!(db.list_connections().unwrap().len(), 3);
        // Deleting a note removes its pin, and SQLite cascades ALL edges
        // attached to that pin. Unrelated D-E must remain untouched.
        assert!(db.delete_note(&a).unwrap());
        let remaining = db.list_connections().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, de.id);
        assert!(!remaining.iter().any(|edge| edge.id == ab.id || edge.id == ac.id));
        assert_eq!(db.list_notes().unwrap().len(), 4);
        let pins_left: i64 = db.conn.query_row(
            "SELECT count(*) FROM pins WHERE note_id=?1",
            [&a], |row| row.get(0),
        ).unwrap();
        assert_eq!(pins_left, 0);
        assert!(db.create_connection(&a, &b).is_err());
    }

    #[test]
    fn prior_phase_note_without_pin_is_backfilled_without_schema_change() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("existing.db");
        {
            let db = Storage::open(&path).unwrap();
            let n = db.create_note("", "from P2", 0.0, 0.0).unwrap();
            db.conn.execute("DELETE FROM pins WHERE note_id=?1", [&n.id]).unwrap();
        }
        let db = Storage::open(&path).unwrap();
        let count: i64 = db.conn.query_row(
            "SELECT count(*) FROM pins", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        let version: i64 = db.conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(version, 1);
    }

}
