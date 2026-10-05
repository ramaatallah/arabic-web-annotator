const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Step 7: Save new annotation with entities and optional note
app.post('/annotations', (req, res) => {
  const { id, user_id, page_url, selected_text, prefix, suffix, start_offset, end_offset, entities, note } = req.body;

  if (!selected_text || typeof selected_text !== 'string' || selected_text.trim() === '') {
    return res.status(400).json({ ok: false, error: 'selected_text is required and cannot be empty' });
  }

  const validTypes = ['person', 'city', 'country', 'university', 'organization'];

  if (entities && Array.isArray(entities)) {
    for (const entity of entities) {
      if (!validTypes.includes(entity.type)) {
        return res.status(400).json({ ok: false, error: `Invalid entity type: ${entity.type}` });
      }
      if (typeof entity.start !== 'number' || typeof entity.end !== 'number' || entity.start < 0 || entity.end <= entity.start || entity.end > selected_text.length) {
        return res.status(400).json({ ok: false, error: 'Invalid entity start or end position' });
      }
    }
  }

  const createdAt = new Date().toISOString();
  const annotationId = id || Date.now().toString();

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const insertAnnotationSql = `
      INSERT INTO annotations (id, user_id, page_url, selected_text, prefix, suffix, offset_start, offset_end, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(insertAnnotationSql, [annotationId, user_id || null, page_url, selected_text, prefix || '', suffix || '', start_offset || 0, end_offset || 0, createdAt], function(err) {
      if (err) {
        db.run('ROLLBACK');
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ ok: false, error: 'Annotation ID already exists' });
        }
        return res.status(400).json({ ok: false, error: err.message });
      }

      let hasError = false;
      if (entities && Array.isArray(entities) && entities.length > 0) {
        const insertEntitySql = `
          INSERT INTO entities (annotation_id, text, type, start_offset, end_offset)
          VALUES (?, ?, ?, ?, ?)
        `;
        for (const entity of entities) {
          db.run(insertEntitySql, [annotationId, entity.text, entity.type, entity.start, entity.end], (entityErr) => {
            if (entityErr) hasError = true;
          });
        }
      }

      if (note && typeof note === 'string' && note.trim() !== '') {
        const insertNoteSql = `
          INSERT INTO notes (annotation_id, text, created_at)
          VALUES (?, ?, ?)
        `;
        db.run(insertNoteSql, [annotationId, note, createdAt], (noteErr) => {
          if (noteErr) hasError = true;
        });
      }

      if (hasError) {
        db.run('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Failed to insert entities or note' });
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          db.run('ROLLBACK');
          return res.status(400).json({ ok: false, error: 'Transaction commit failed' });
        }

        return res.status(201).json({
          ok: true,
          data: {
            id: annotationId,
            user_id: user_id || null,
            page_url,
            selected_text,
            prefix: prefix || '',
            suffix: suffix || '',
            start_offset: start_offset || 0,
            end_offset: end_offset || 0,
            created_at: createdAt,
            entities: entities || [],
            notes: note ? [{ id: Date.now(), text: note, created_at: createdAt }] : []
          }
        });
      });
    });
  });
});

// Step 8: Get annotations for a page URL with entities and notes
app.get('/annotations', (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ ok: false, error: 'URL query parameter is required' });
  }

  const annotationsSql = `SELECT * FROM annotations WHERE page_url = ?`;

  db.all(annotationsSql, [pageUrl], (err, annotations) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    if (!annotations || annotations.length === 0) {
      return res.json({ ok: true, data: [] });
    }

    const annotationIds = annotations.map(a => a.id);
    const placeholders = annotationIds.map(() => '?').join(',');

    const entitiesSql = `SELECT id, annotation_id, text, type, start_offset AS start, end_offset AS end FROM entities WHERE annotation_id IN (${placeholders})`;
    const notesSql = `SELECT id, annotation_id, text, created_at FROM notes WHERE annotation_id IN (${placeholders})`;

    db.all(entitiesSql, annotationIds, (entErr, entities) => {
      if (entErr) {
        return res.status(500).json({ ok: false, error: entErr.message });
      }

      db.all(notesSql, annotationIds, (noteErr, notes) => {
        if (noteErr) {
          return res.status(500).json({ ok: false, error: noteErr.message });
        }

        const result = annotations.map(annotation => {
          return {
            id: annotation.id,
            user_id: annotation.user_id,
            page_url: annotation.page_url,
            selected_text: annotation.selected_text,
            prefix: annotation.prefix,
            suffix: annotation.suffix,
            start_offset: annotation.offset_start,
            end_offset: annotation.offset_end,
            created_at: annotation.created_at,
            entities: (entities || []).filter(e => e.annotation_id === annotation.id).map(e => ({
              id: e.id,
              text: e.text,
              type: e.type,
              start: e.start,
              end: e.end
            })),
            notes: (notes || []).filter(n => n.annotation_id === annotation.id).map(n => ({
              id: n.id,
              text: n.text,
              created_at: n.created_at
            }))
          };
        });

        res.json({ ok: true, data: result });
      });
    });
  });
});

// Step 9: Add a new note to an annotation
app.post('/annotations/:id/notes', (req, res) => {
  const annotationId = req.params.id;
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Note text cannot be empty' });
  }

  db.get('SELECT id FROM annotations WHERE id = ?', [annotationId], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: 'Annotation not found' });

    const createdAt = new Date().toISOString();
    const insertSql = `INSERT INTO notes (annotation_id, text, created_at) VALUES (?, ?, ?)`;

    db.run(insertSql, [annotationId, text, createdAt], function(runErr) {
      if (runErr) return res.status(500).json({ ok: false, error: runErr.message });

      res.status(201).json({
        ok: true,
        data: {
          id: this.lastID,
          annotation_id: annotationId,
          text,
          created_at: createdAt
        }
      });
    });
  });
});

// Step 9: Update an existing note
app.put('/notes/:id', (req, res) => {
  const noteId = req.params.id;
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Note text cannot be empty' });
  }

  const updateSql = `UPDATE notes SET text = ? WHERE id = ?`;

  db.run(updateSql, [text, noteId], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ ok: false, error: 'Note not found' });

    res.json({
      ok: true,
      data: {
        id: Number(noteId),
        text
      }
    });
  });
});

// Step 9: Delete a note
app.delete('/notes/:id', (req, res) => {
  const noteId = req.params.id;
  const deleteSql = `DELETE FROM notes WHERE id = ?`;

  db.run(deleteSql, [noteId], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ ok: false, error: 'Note not found' });

    res.json({ ok: true, deleted: true });
  });
});

// Step 10: Delete an entire annotation
app.delete('/annotations/:id', (req, res) => {
  const annotationId = req.params.id;
  const deleteSql = `DELETE FROM annotations WHERE id = ?`;

  db.run(deleteSql, [annotationId], function(err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ ok: false, error: 'Annotation not found' });

    res.json({ ok: true, deleted: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
