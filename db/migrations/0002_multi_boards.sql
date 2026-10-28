-- v2: keep existing notes, pins, assets and the default board unchanged.
-- A single selected board is persisted for the desktop session.
CREATE TABLE board_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_board_id TEXT NOT NULL REFERENCES boards(id),
    next_board_number INTEGER NOT NULL CHECK (next_board_number >= 2)
);
INSERT INTO board_state(id, active_board_id, next_board_number)
VALUES (1, 'default', 2);
