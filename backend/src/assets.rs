use image::{ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::{error::Error, fs, io::Cursor, path::Path};

pub const MAX_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_PIXELS: u64 = 20_000_000;

pub struct ValidatedImage {
    pub bytes: Vec<u8>,
    pub ext: &'static str,
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
    pub checksum: String,
}

// Decode metadata BEFORE importing; never infer image format from suffix.
pub fn validate_file(path: &Path) -> Result<ValidatedImage, Box<dyn Error + Send + Sync>> {
    if !path.is_absolute() {
        return Err("Image path must be absolute".into());
    }
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_BYTES {
        return Err("Image must be a regular file of 1–16 MiB".into());
    }
    let bytes = fs::read(path)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
        return Err("Image too large".into());
    }
    let format = image::guess_format(&bytes)?;
    let (ext, mime) = match format {
        ImageFormat::Png => ("png", "image/png"),
        ImageFormat::Jpeg => ("jpg", "image/jpeg"),
        ImageFormat::WebP => ("webp", "image/webp"),
        _ => return Err("Only PNG, JPEG and WebP images are supported".into()),
    };
    let mut reader = ImageReader::new(Cursor::new(&bytes));
    reader.set_format(format);
    let (width, height) = reader.into_dimensions()?;
    if width == 0 || height == 0 ||
        u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("Image dimensions exceed allowed bounds".into());
    }

    // Reject corrupt images, not just a valid header; heavy decoding occurs
    // in the backend process, never inside GNOME Shell.
    image::load_from_memory_with_format(&bytes, format)?;
    let checksum = format!("{:x}", Sha256::digest(&bytes));
    Ok(ValidatedImage {bytes, ext, mime, width, height, checksum})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_image_and_missing_files() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("bad.jpg");
        fs::write(&path, b"not a valid image").unwrap();
        assert!(validate_file(&path).is_err());
        assert!(validate_file(&temp.path().join("no.png")).is_err());
    }

    #[test]
    fn png_uses_magic_bytes_not_extension() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("photo-with-wrong-extension.txt");
        let bitmap = image::RgbImage::new(32, 16);
        bitmap.save_with_format(&path, ImageFormat::Png).unwrap();
        let found = validate_file(&path).unwrap();
        assert_eq!(found.width, 32);
        assert_eq!(found.height, 16);
        assert_eq!(found.mime, "image/png");
    }
}
