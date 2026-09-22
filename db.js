const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// تحديد مسار وتجهيز ملف قاعدة البيانات
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// إنشاء جدول الملاحظات عند تشغيل الملف لأول مرة
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      page_url TEXT,
      text_selected TEXT,
      prefix TEXT,
      suffix TEXT,
      annotation TEXT,
      created_at TEXT
    )
  `);
});

module.exports = db;