-- Proposed Phase 2 schema. Not yet opened by a Rust backend.
-- Enable PRAGMA foreign_keys = ON for every connection.
-- Consider WAL once the backend is implemented.
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'image')),
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL CHECK (width > 0),
    height REAL NOT NULL CHECK (height > 0),
    rotation REAL NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#E9D898',
    z_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_notes_board_z ON notes(board_id, z_index);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    checksum TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_note ON assets(note_id);

CREATE TABLE IF NOT EXISTS pins (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    local_x REAL NOT NULL,
    local_y REAL NOT NULL,
    style TEXT NOT NULL DEFAULT 'red'
);
CREATE INDEX IF NOT EXISTS idx_pins_note ON pins(note_id);

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    source_pin_id TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
    target_pin_id TEXT NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
    color TEXT NOT NULL DEFAULT '#A32626',
    style TEXT NOT NULL DEFAULT 'string',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    CHECK (source_pin_id <> target_pin_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_pin_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target_pin_id);

CREATE TABLE IF NOT EXISTS board_view_state (
    board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    zoom REAL NOT NULL DEFAULT 1 CHECK (zoom BETWEEN 0.25 AND 3.0),
    pan_x REAL NOT NULL DEFAULT 0,
    pan_y REAL NOT NULL DEFAULT 0
);
