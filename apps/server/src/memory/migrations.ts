/**
 * The schema, as an ordered list of steps. Section 9 of docs/architecture.md.
 *
 * A database records how many steps it has had in `PRAGMA user_version`, so a
 * step is never edited once it has shipped. A change is a new step.
 */

/** One step. Every statement in it runs in a single transaction. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    end_reason TEXT,
    person TEXT NOT NULL,
    language TEXT NOT NULL
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX events_by_session ON events(session_id, id);

  CREATE TABLE episodes (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE facts (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    importance INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    superseded_by INTEGER REFERENCES facts(id)
  );

  CREATE VIRTUAL TABLE facts_fts USING fts5(
    text, content='facts', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER facts_after_insert AFTER INSERT ON facts BEGIN
    INSERT INTO facts_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER facts_after_delete AFTER DELETE ON facts BEGIN
    INSERT INTO facts_fts(facts_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;

  CREATE TABLE self_model (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    from_episode INTEGER REFERENCES episodes(id)
  );
  `,
  `
  ALTER TABLE sessions ADD COLUMN mood TEXT;
  `,
  `
  CREATE TABLE faces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    embedding BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX faces_by_name ON faces(name, id);
  `,
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  // No foreign key to sessions: the record of what was spent outlives
  // forgetting what was said.
  `
  CREATE TABLE usage (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('call', 'turn')),
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    session_id INTEGER,
    input_text INTEGER NOT NULL DEFAULT 0,
    input_audio INTEGER NOT NULL DEFAULT 0,
    input_image INTEGER NOT NULL DEFAULT 0,
    cached_text INTEGER NOT NULL DEFAULT 0,
    cached_audio INTEGER NOT NULL DEFAULT 0,
    cached_image INTEGER NOT NULL DEFAULT 0,
    output_text INTEGER NOT NULL DEFAULT 0,
    output_audio INTEGER NOT NULL DEFAULT 0,
    thinking INTEGER NOT NULL DEFAULT 0,
    cost_micros INTEGER,
    saved_micros INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX usage_by_time ON usage(at);
  `,
  // When a live session's call row stopped, for the hours of live session.
  `
  ALTER TABLE usage ADD COLUMN ended_at INTEGER;
  `,
];
