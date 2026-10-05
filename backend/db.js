const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Step 2: Use absolute path for the SQLite database instead of a relative path
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

db.serialize(() => {
  // Step 3: Enable Foreign Key constraints
  db.run('PRAGMA foreign_keys = ON;');

  // Create primary annotations table if it does not exist
  db.run(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      page_url TEXT,
      selected_text TEXT,
      prefix TEXT,
      suffix TEXT,
      annotation TEXT,
      created_at TEXT
    )
  `);

  // Step 3: Create notes table with foreign key reference to annotations and ON DELETE CASCADE
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id TEXT REFERENCES annotations(id) ON DELETE CASCADE,
      text TEXT,
      created_at TEXT
    )
  `);

  // Step 4: Create entities table for NER words
  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annotation_id TEXT REFERENCES annotations(id) ON DELETE CASCADE,
      text TEXT,
      type TEXT,
      start_offset INTEGER,
      end_offset INTEGER
    )
  `);

  // Step 5: Add offset_start and offset_end columns to annotations table if they do not exist
  db.all("PRAGMA table_info(annotations)", (err, columns) => {
    if (err) {
      console.error('Error checking columns:', err.message);
      return;
    }
    const columnNames = columns.map(col => col.name);
    
    if (!columnNames.includes('offset_start')) {
      db.run("ALTER TABLE annotations ADD COLUMN offset_start INTEGER");
    }
    if (!columnNames.includes('offset_end')) {
      db.run("ALTER TABLE annotations ADD COLUMN offset_end INTEGER");
    }
  });

  // Step 6: Migrate old non-empty annotation data to the notes table without duplication
  db.run(`
    INSERT INTO notes (annotation_id, text, created_at)
    SELECT id, annotation, created_at 
    FROM annotations 
    WHERE annotation IS NOT NULL 
      AND annotation != '' 
      AND id NOT IN (SELECT DISTINCT annotation_id FROM notes)
  `);
});

module.exports = db;
