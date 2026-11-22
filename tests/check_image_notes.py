"""Static checks only: the GNOME compositor is NOT loaded in CI."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
frontend = (root / "extension/ui/boardView.js").read_text(encoding="utf-8")
service = (root / "extension/services/noteService.js").read_text(encoding="utf-8")
backend = (root / "backend/src/db.rs").read_text(encoding="utf-8")
assets = (root / "backend/src/assets.rs").read_text(encoding="utf-8")
assert "ImportImageAsync" in service
assert "Gio.Subprocess.new(" in frontend
assert "St.TextureCache.get_default()" in frontend
assert "texture.load_file_async(" in frontend
assert "boundedImageDecodeSize(" in frontend
assert "MAX_DECODED_IMAGE_PIXELS" in (
    root / "extension/geometry/imageSizing.js").read_text(encoding="utf-8")
assert "Clutter.ContentGravity.RESIZE_ASPECT" in frontend
assert "new St.Icon(" not in frontend[frontend.index("    _renderImageNote("):frontend.index("    _press(event)")]
assert "new Gio.FileIcon" not in frontend
assert "if (note.type === 'image')" in frontend
assert "this._imagePicker?.force_exit();" in frontend
assert "MAX_BYTES" in assets and "MAX_PIXELS" in assets
assert "image::guess_format" in assets
assert "fs::remove_file(path)" in backend
assert "fs::hard_link(" in backend
assert "idx_assets_checksum" in backend
assert "CREATE TABLE IF NOT EXISTS assets" in (
    root / "db/migrations/0001_init.sql").read_text(encoding="utf-8")
# Images expose a caption editor inside the Polaroid white footer. It must
# autosave through an image-only API instead of the text-note UpdateNote path.
main = (root / "backend/src/main.rs").read_text(encoding="utf-8")
styles = (root / "extension/stylesheet.css").read_text(encoding="utf-8")
photo_section = frontend[
    frontend.index("    _renderImageNote("):frontend.index("    _press(event)")
]
flush_section = frontend[
    frontend.index("    _flushNote(id)"):frontend.index("    _cancelNoteTimer(id)")
]
assert "const caption=new St.Entry(" in photo_section
assert "hint_text:'Thêm tiêu đề…'" in photo_section
assert "paper.add_child(photo);" in photo_section
assert "paper.add_child(caption);" in photo_section
assert photo_section.index("paper.add_child(photo)") < photo_section.index("paper.add_child(caption)")
assert "caption.clutter_text.set_max_length(120)" in photo_section
assert "caption.clutter_text.connect('notify::text'" in photo_section
assert "this._scheduleNote(note.id)" in photo_section
assert "item.caption?.set_width(imageWidth)" in frontend
assert "caption.contains(event.get_source())" in frontend
assert "this._service.updateImageCaption(id,title)" in flush_section
assert "if (item.caption) {" in flush_section
assert "UpdateImageCaptionAsync" in service
assert "fn update_image_caption(&self, id: &str, caption: &str)" in backend
assert "type='image'" in backend
assert "fn update_image_caption(&self, id: &str, caption: &str)" in main
assert "validate_image_caption(caption)?" in main
assert "fn image_caption_persists_and_is_scoped_to_its_board()" in backend
assert "padding: 8px 12px 6px 12px;" in styles
assert ".evidence-photo-caption {" in styles
print("Image note static checks: OK (not GNOME UI test)")
