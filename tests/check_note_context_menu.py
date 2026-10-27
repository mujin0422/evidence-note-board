"""Static cross-layer contracts for note context-menu features."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
view = (root / "extension/ui/boardView.js").read_text(encoding="utf-8")
rich = (root / "extension/model/richText.js").read_text(encoding="utf-8")
service = (root / "extension/services/noteService.js").read_text(encoding="utf-8")
styles = (root / "extension/stylesheet.css").read_text(encoding="utf-8")
backend = (root / "backend/src/main.rs").read_text(encoding="utf-8")
database = (root / "backend/src/db.rs").read_text(encoding="utf-8")

for token in (
    "event.get_button()===3", "_openNoteMenu(item,event,true)",
    "_toggleSelectionDarkRed(item,selection)", "for (const level of CEFR_LEVELS)",
    "get_preferred_height(width)", "note.height-TEXT_VERTICAL_CHROME",
    "item.body.set_height(-1)", "Chuyển về màu gốc",
    "Pango.attr_letter_spacing_new(15*Pango.SCALE)",
):
    assert token in view, token

for token in ("red:", "badges:", "insertBadge", "rebaseBadges", "BADGE_PLACEHOLDER"):
    assert token in rich, token
assert "BADGE_PLACEHOLDER = '\\ufffc';" in rich
assert "coords_to_position" not in view

assert '<method name="UpdateColor">' in service
assert "UpdateColorAsync(id, color)" in service
assert "fn update_color" in backend
assert "pub fn update_color" in database
assert "#FFFFFF" in backend and "#FFFFFF" in view
assert ".evidence-cefr-badge" in styles
assert "color: #514837" in styles and "border: 2px solid #514837" in styles
assert "border-radius: 4px" in styles
assert "margin-right: 4px" in styles
assert "font-size: 10px" in styles and "font-weight: 900" in styles

print("Note color, dark-red text, CEFR badges and compact-height contracts: PASS")
