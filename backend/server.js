const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 1. add a new annotation (POST)
app.post('/annotations', (req, res) => {
  const { id, user_id, page_url, selected_text, prefix, suffix, annotation, created_at } = req.body;

  const query = `
    INSERT INTO annotations (id, user_id, page_url, selected_text, prefix, suffix, annotation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [id, user_id, page_url, selected_text, prefix, suffix, annotation, created_at], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ message: 'Annotation saved successfully', id });
  });
});

// 2. retrieve annotations for a specific page (GET)
app.get('/annotations', (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  const query = `SELECT * FROM annotations WHERE page_url = ?`;

  db.all(query, [pageUrl], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 3. update an existing annotation (PUT) - new requirement!
app.put('/annotations/:id', (req, res) => {
  const { id } = req.params;
  const { annotation, selected_text } = req.body;

  const query = `
    UPDATE annotations 
    SET annotation = COALESCE(?, annotation),
        selected_text = COALESCE(?, selected_text)
    WHERE id = ?
  `;

  db.run(query, [annotation, selected_text, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Annotation not found' });
    }
    res.json({ message: 'Annotation updated successfully', id });
  });
});

// 4. delete an annotation (DELETE)
app.delete('/annotations/:id', (req, res) => {
  const { id } = req.params;

  const query = `DELETE FROM annotations WHERE id = ?`;

  db.run(query, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Annotation not found' });
    }
    res.json({ message: 'Annotation deleted successfully', id });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});