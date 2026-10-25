mod db;

use std::{error::Error, future::pending, path::PathBuf, sync::Mutex};
use zbus::{connection, interface};

const SERVICE: &str = "io.github.mujin0422.EvidenceNoteBoard";
const OBJECT: &str = "/io/github/mujin0422/EvidenceNoteBoard";

struct NoteApi {
    storage: Mutex<db::Storage>,
}

impl NoteApi {
    fn with_db<T>(
        &self,
        f: impl FnOnce(&db::Storage) -> rusqlite::Result<T>,
    ) -> zbus::fdo::Result<T> {
        let db = self.storage.lock().map_err(|_| {
            zbus::fdo::Error::Failed("Database unavailable".into())
        })?;
        f(&db).map_err(|_| zbus::fdo::Error::Failed("Storage operation failed".into()))
    }
}

fn validate_text(title: &str, content: &str) -> zbus::fdo::Result<()> {
    if title.len() > 512 || content.len() > 65536 {
        return Err(zbus::fdo::Error::InvalidArgs("Note exceeds size limit".into()));
    }
    Ok(())
}

fn validate_position(x: f64, y: f64) -> zbus::fdo::Result<()> {
    if !x.is_finite() || !y.is_finite() || x.abs() > 1_000_000.0 || y.abs() > 1_000_000.0 {
        return Err(zbus::fdo::Error::InvalidArgs("Invalid canvas position".into()));
    }
    Ok(())
}

fn validate_view(zoom: f64, x: f64, y: f64) -> zbus::fdo::Result<()> {
    validate_position(x, y)?;
    if !zoom.is_finite() || !(0.25..=3.0).contains(&zoom) {
        return Err(zbus::fdo::Error::InvalidArgs("Invalid zoom level".into()));
    }
    Ok(())
}

#[interface(name = "io.github.mujin0422.EvidenceNoteBoard", spawn = false)]
impl NoteApi {
    fn list_notes(&self) -> zbus::fdo::Result<String> {
        let notes = self.with_db(|db| db.list_notes())?;
        serde_json::to_string(&notes)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    fn create_note(&self, title: &str, content: &str, x: f64, y: f64) -> zbus::fdo::Result<String> {
        validate_text(title, content)?;
        validate_position(x, y)?;
        let note = self.with_db(|db| db.create_note(title, content, x, y))?;
        serde_json::to_string(&note)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    fn update_note(&self, id: &str, title: &str, content: &str) -> zbus::fdo::Result<()> {
        validate_text(title, content)?;
        if !self.with_db(|db| db.update_note(id, title, content))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    fn move_note(&self, id: &str, x: f64, y: f64) -> zbus::fdo::Result<()> {
        validate_position(x, y)?;
        if !self.with_db(|db| db.move_note(id, x, y))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    fn delete_note(&self, id: &str) -> zbus::fdo::Result<()> {
        if !self.with_db(|db| db.delete_note(id))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    fn get_view(&self) -> zbus::fdo::Result<String> {
        let view = self.with_db(|db| db.load_view())?;
        serde_json::to_string(&view)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    fn save_view(&self, zoom: f64, pan_x: f64, pan_y: f64) -> zbus::fdo::Result<()> {
        validate_view(zoom, pan_x, pan_y)?;
        self.with_db(|db| db.save_view(zoom, pan_x, pan_y))
    }
}

fn data_file() -> Result<PathBuf, Box<dyn Error>> {
    let base = match std::env::var_os("XDG_DATA_HOME") {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => {
            let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
            PathBuf::from(home).join(".local/share")
        }
    };
    if !base.is_absolute() {
        return Err("XDG_DATA_HOME must be an absolute path".into());
    }
    let dir = base.join("evidence-note-board");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("evidence.db"))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let storage = db::Storage::open(&data_file()?)?;
    let api = NoteApi { storage: Mutex::new(storage) };
    let _conn = connection::Builder::session()?
        .name(SERVICE)?
        .serve_at(OBJECT, api)?
        .build()
        .await?;
    // A single backend instance per session bus name.
    pending::<()>().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checks_reject_nonfinite_and_oversized_values() {
        assert!(validate_position(f64::NAN, 2.0).is_err());
        assert!(validate_view(3.1, 0.0, 0.0).is_err());
        assert!(validate_view(0.25, -120.0, 300.0).is_ok());
        assert!(validate_text("ok", &"a".repeat(65537)).is_err());
    }
}
