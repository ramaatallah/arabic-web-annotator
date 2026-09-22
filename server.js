const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 1. تجربة أن السيرفر يعمل
app.get('/', (req, res) => {
  res.send('Server is running successfully!');
});

// 2. إضافة ملاحظة جديدة (POST /annotations)
app.post('/annotations', (req, res) => {
  const { id, user_id, page_url, text_selected, prefix, suffix, annotation, created_at } = req.body;

  const sql = `
    INSERT INTO annotations (id, user_id, page_url, text_selected, prefix, suffix, annotation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [id, user_id, page_url, text_selected, prefix, suffix, annotation, created_at], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ message: 'Annotation saved successfully', id });
  });
});

// 3. جلب ملاحظات صفحة معينة (GET /annotations?url=...)
app.get('/annotations', (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ error: 'Page URL is required' });
  }

  const sql = `SELECT * FROM annotations WHERE page_url = ?`;

  db.all(sql, [pageUrl], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 4. حذف ملاحظة (DELETE /annotations/:id)
app.delete('/annotations/:id', (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM annotations WHERE id = ?`;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Annotation deleted successfully' });
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});