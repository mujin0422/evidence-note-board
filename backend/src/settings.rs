//! Local-first user preferences, stored outside the database under XDG_CONFIG_HOME.
//! Crash-safe replace avoids partial JSON writes. Invalid files are preserved
//! for user investigation rather than overwritten during startup.
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
/// User-visible preferences shared with the extension over D-Bus.
pub struct Settings {
    pub show_hud: bool,
    pub show_strings: bool,
    pub zoom_step: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self { show_hud: true, show_strings: true, zoom_step: 1.1 }
    }
}

impl Settings {
    /// Reject non-finite or impractical zoom increments before persistence.
    pub fn validate(&self) -> Result<(), String> {
        if !self.zoom_step.is_finite() || !(1.02..=1.5).contains(&self.zoom_step) {
            return Err("zoom_step must be between 1.02 and 1.5".into());
        }
        Ok(())
    }
}

/// Loads and atomically saves the local JSON preferences file.
pub struct SettingsStore {
    path: PathBuf,
    settings: Settings,
}

impl SettingsStore {
    /// Resolve the settings path according to the XDG base-directory rules.
    pub fn default_path() -> Result<PathBuf, String> {
        let dir = match std::env::var_os("XDG_CONFIG_HOME") {
            Some(dir) if !dir.is_empty() => PathBuf::from(dir),
            _ => PathBuf::from(std::env::var_os("HOME")
                .ok_or("HOME is not set")?).join(".config"),
        };
        if !dir.is_absolute() { return Err("Config path must be absolute".into()); }
        Ok(dir.join("evidence-note-board").join("settings.json"))
    }

    /// Load valid settings, falling back safely while preserving bad input.
    pub fn open(path: PathBuf) -> Self {
        let settings = match fs::read(&path) {
            Ok(data) => match serde_json::from_slice::<Settings>(&data) {
                Ok(value) if value.validate().is_ok() => value,
                _ => {
                    eprintln!("Evidence Note Board: invalid settings, using defaults; file preserved");
                    Settings::default()
                },
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(error) => {
                eprintln!("Evidence Note Board: cannot read settings ({error}), using defaults");
                Settings::default()
            },
        };
        Self {path, settings}
    }

    /// Return an owned snapshot so callers cannot mutate the store in place.
    pub fn get(&self) -> Settings { self.settings.clone() }

    /// Validate and atomically replace the JSON settings file.
    pub fn save(&mut self, requested: Settings) -> Result<(), String> {
        requested.validate()?;
        let dir = self.path.parent().ok_or("Invalid settings path")?;
        fs::create_dir_all(dir).map_err(|error| error.to_string())?;
        let pending = self.path.with_extension("json.tmp");
        let payload = serde_json::to_vec_pretty(&requested)
            .map_err(|error| error.to_string())?;
        let write_result = (|| -> std::io::Result<()> {
            let mut file = fs::OpenOptions::new().write(true).create(true)
                .truncate(true).open(&pending)?;
            #[cfg(unix)]
            file.set_permissions(fs::Permissions::from_mode(0o600))?;
            file.write_all(&payload)?;
            file.sync_all()?;
            fs::rename(&pending, &self.path)?;
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&pending);
            return Err(error.to_string());
        }
        self.settings = requested;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_preferences_and_keeps_invalid_requests_out() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut store = SettingsStore::open(path.clone());
        assert_eq!(store.get(), Settings::default());
        assert!(store.save(Settings {show_hud:false, show_strings:false, zoom_step:1.2}).is_ok());
        let loaded = SettingsStore::open(path);
        assert_eq!(loaded.get().zoom_step, 1.2);
        assert!(!loaded.get().show_hud);
        assert!(store.save(Settings {show_hud:true, show_strings:true, zoom_step:f64::NAN}).is_err());
        assert_eq!(store.get().zoom_step, 1.2);
    }

    #[test]
    fn corrupt_json_is_preserved_and_default_is_safe() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, b"{ broken json").unwrap();
        assert_eq!(SettingsStore::open(path.clone()).get(), Settings::default());
        assert_eq!(fs::read(path).unwrap(), b"{ broken json");
    }
}
