const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      page_url TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',
      suffix TEXT NOT NULL DEFAULT '',
      annotation TEXT,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL
    )
  `);

  db.all('PRAGMA table_info(annotations)', (err, columns) => {
    if (err) {
      console.error('Error checking annotations columns:', err.message);
      return;
    }

    const names = new Set(columns.map((column) => column.name));

    if (!names.has('start_offset')) {
      db.run('ALTER TABLE annotations ADD COLUMN start_offset INTEGER');
    }
    if (!names.has('end_offset')) {
      db.run('ALTER TABLE annotations ADD COLUMN end_offset INTEGER');
    }

    // Migrate the previous column names when upgrading an existing database.
    if (names.has('offset_start')) {
      db.run(`
        UPDATE annotations
        SET start_offset = offset_start
        WHERE start_offset IS NULL AND offset_start IS NOT NULL
      `);
    }
    if (names.has('offset_end')) {
      db.run(`
        UPDATE annotations
        SET end_offset = offset_end
        WHERE end_offset IS NULL AND offset_end IS NOT NULL
      `);
    }

    // v1 stored the note in annotations.annotation. Copy it once to notes.
    if (names.has('annotation')) {
      db.run(`
        INSERT INTO notes (annotation_id, text, created_at)
        SELECT a.id, a.annotation, a.created_at
        FROM annotations a
        WHERE a.annotation IS NOT NULL
          AND TRIM(a.annotation) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM notes n
            WHERE n.annotation_id = a.id
          )
      `);
    }
  });
});

module.exports = db;
