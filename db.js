const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// إنشاء جدول الملاحظات بأسماء الأوردة المعتمدة بالاتفاق
db.serialize(() => {
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
});

module.exports = db;