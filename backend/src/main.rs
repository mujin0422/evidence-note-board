//! Evidence Note Board backend process.
//!
//! The service exposes a narrow session D-Bus API and keeps all SQLite and
//! filesystem work outside GNOME Shell. It owns one database connection for
//! the lifetime of the user session.

mod assets;
mod db;
mod settings;

use std::{error::Error, future::pending, path::PathBuf, sync::Mutex};
use zbus::{connection, interface};

const SERVICE: &str = "io.github.mujin0422.EvidenceNoteBoard";
const OBJECT: &str = "/io/github/mujin0422/EvidenceNoteBoard";
const PAPER_COLORS: [&str; 5] = ["#E9D898", "#EFE2AD", "#F4EBC6", "#FAF6E4", "#FFFFFF"];

/// D-Bus object containing synchronized access to storage and preferences.
struct NoteApi {
    storage: Mutex<db::Storage>,
    preferences: Mutex<settings::SettingsStore>,
}

impl NoteApi {
    /// Lock storage, execute one operation and hide internal errors from IPC.
    fn with_db<T>(
        &self,
        f: impl FnOnce(&mut db::Storage) -> rusqlite::Result<T>,
    ) -> zbus::fdo::Result<T> {
        let mut db = self.storage.lock().map_err(|_| {
            zbus::fdo::Error::Failed("Database unavailable".into())
        })?;
        f(&mut db).map_err(|_| zbus::fdo::Error::Failed("Storage operation failed".into()))
    }
}

/// Enforce payload limits before text reaches SQLite.
fn validate_text(title: &str, content: &str) -> zbus::fdo::Result<()> {
    if title.len() > 512 || content.len() > 65536 {
        return Err(zbus::fdo::Error::InvalidArgs("Note exceeds size limit".into()));
    }
    Ok(())
}

/// Accept only finite world coordinates within the supported canvas range.
fn validate_position(x: f64, y: f64) -> zbus::fdo::Result<()> {
    if !x.is_finite() || !y.is_finite() || x.abs() > 1_000_000.0 || y.abs() > 1_000_000.0 {
        return Err(zbus::fdo::Error::InvalidArgs("Invalid canvas position".into()));
    }
    Ok(())
}

/// Validate persisted paper dimensions and rotation.
fn validate_geometry(width: f64, height: f64, rotation: f64) -> zbus::fdo::Result<()> {
    if !width.is_finite() || !height.is_finite() || !rotation.is_finite() ||
        !(180.0..=1200.0).contains(&width) ||
        !(110.0..=6000.0).contains(&height) ||
        !(-180.0..=180.0).contains(&rotation) {
        return Err(zbus::fdo::Error::InvalidArgs("Invalid note geometry".into()));
    }
    Ok(())
}

/// Validate camera zoom and pan as one coherent state.
fn validate_view(zoom: f64, x: f64, y: f64) -> zbus::fdo::Result<()> {
    validate_position(x, y)?;
    if !zoom.is_finite() || !(0.25..=3.0).contains(&zoom) {
        return Err(zbus::fdo::Error::InvalidArgs("Invalid zoom level".into()));
    }
    Ok(())
}

#[interface(name = "io.github.mujin0422.EvidenceNoteBoard", spawn = false)]
impl NoteApi {
    /// Serialize every saved note for initial UI hydration.
    fn list_notes(&self) -> zbus::fdo::Result<String> {
        let notes = self.with_db(|db| db.list_notes())?;
        serde_json::to_string(&notes)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Create a text note after validating its content and position.
    fn create_note(&self, title: &str, content: &str, x: f64, y: f64) -> zbus::fdo::Result<String> {
        validate_text(title, content)?;
        validate_position(x, y)?;
        let note = self.with_db(|db| db.create_note(title, content, x, y))?;
        serde_json::to_string(&note)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Import a user-selected image from an absolute local path.
    fn import_image(&self, path: &str, x: f64, y: f64) -> zbus::fdo::Result<String> {
        validate_position(x, y)?;
        if path.len() > 4096 || !PathBuf::from(path).is_absolute() {
            return Err(zbus::fdo::Error::InvalidArgs("Choose an absolute image path".into()));
        }
        let note = self.with_db(|db| db.import_image(std::path::Path::new(path), x, y))?;
        serde_json::to_string(&note)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Save text content for an existing text note.
    fn update_note(&self, id: &str, title: &str, content: &str) -> zbus::fdo::Result<()> {
        validate_text(title, content)?;
        if !self.with_db(|db| db.update_note(id, title, content))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    /// Save a note's world-space position.
    fn move_note(&self, id: &str, x: f64, y: f64) -> zbus::fdo::Result<()> {
        validate_position(x, y)?;
        if !self.with_db(|db| db.move_note(id, x, y))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    /// Save paper size and rotation after a resize/rotate gesture.
    fn update_geometry(&self, id: &str, width: f64, height: f64, rotation: f64)
        -> zbus::fdo::Result<()> {
        validate_geometry(width, height, rotation)?;
        if !self.with_db(|db| db.update_geometry(id, width, height, rotation))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    /// Save a paper color from the fixed UI palette.
    fn update_color(&self, id: &str, color: &str) -> zbus::fdo::Result<()> {
        if !PAPER_COLORS.contains(&color) {
            return Err(zbus::fdo::Error::InvalidArgs("Unsupported paper color".into()));
        }
        if !self.with_db(|db| db.update_color(id, color))? {
            return Err(zbus::fdo::Error::Failed("Text note not found".into()));
        }
        Ok(())
    }

    /// Serialize all saved red-string connections.
    fn list_connections(&self) -> zbus::fdo::Result<String> {
        let edges = self.with_db(|db| db.list_connections())?;
        serde_json::to_string(&edges)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Connect two different note pins, reusing an existing unordered edge.
    fn create_connection(&self, source_note_id: &str, target_note_id: &str)
        -> zbus::fdo::Result<String> {
        if source_note_id == target_note_id ||
            source_note_id.len() > 80 || target_note_id.len() > 80 {
            return Err(zbus::fdo::Error::InvalidArgs("Choose two distinct notes".into()));
        }
        let edge = self.with_db(|db|
            db.create_connection(source_note_id, target_note_id))?;
        serde_json::to_string(&edge)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Delete one red-string connection.
    fn delete_connection(&self, id: &str) -> zbus::fdo::Result<()> {
        if !self.with_db(|db| db.delete_connection(id))? {
            return Err(zbus::fdo::Error::Failed("Connection not found".into()));
        }
        Ok(())
    }

    /// Delete a note; related pins/edges cascade inside SQLite.
    fn delete_note(&self, id: &str) -> zbus::fdo::Result<()> {
        if !self.with_db(|db| db.delete_note(id))? {
            return Err(zbus::fdo::Error::Failed("Note not found".into()));
        }
        Ok(())
    }

    /// Serialize the current UI preferences.
    fn get_settings(&self) -> zbus::fdo::Result<String> {
        let settings = self.preferences.lock()
            .map_err(|_| zbus::fdo::Error::Failed("Settings unavailable".into()))?;
        serde_json::to_string(&settings.get())
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Validate and atomically persist UI preferences.
    fn save_settings(&self, show_hud: bool, show_strings: bool, zoom_step: f64)
        -> zbus::fdo::Result<()> {
        let next = settings::Settings {show_hud, show_strings, zoom_step};
        next.validate().map_err(zbus::fdo::Error::InvalidArgs)?;
        self.preferences.lock()
            .map_err(|_| zbus::fdo::Error::Failed("Settings unavailable".into()))?
            .save(next).map_err(|_| zbus::fdo::Error::Failed("Cannot save preferences".into()))
    }

    /// Serialize the saved board camera.
    fn get_view(&self) -> zbus::fdo::Result<String> {
        let view = self.with_db(|db| db.load_view())?;
        serde_json::to_string(&view)
            .map_err(|_| zbus::fdo::Error::Failed("Serialization failed".into()))
    }

    /// Validate and persist the board camera.
    fn save_view(&self, zoom: f64, pan_x: f64, pan_y: f64) -> zbus::fdo::Result<()> {
        validate_view(zoom, pan_x, pan_y)?;
        self.with_db(|db| db.save_view(zoom, pan_x, pan_y))
    }
}

/// Resolve and create the XDG data directory containing `evidence.db`.
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

#[tokio::main(flavor = "current_thread")]
/// Start the session-bus service and keep it alive until systemd stops it.
async fn main() -> Result<(), Box<dyn Error>> {
    let storage = db::Storage::open(&data_file()?)?;
    let settings_path = settings::SettingsStore::default_path()?;
    let api = NoteApi {
        storage: Mutex::new(storage),
        preferences: Mutex::new(settings::SettingsStore::open(settings_path)),
    };
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
        assert!(validate_geometry(180.0, 110.0, 0.0).is_ok());
        assert!(validate_geometry(179.0, 110.0, 0.0).is_err());
        assert!(validate_geometry(350.0, 310.0, f64::NAN).is_err());
        assert!(PAPER_COLORS.contains(&"#FFFFFF"));
        assert!(!PAPER_COLORS.contains(&"#000000"));
    }
}
