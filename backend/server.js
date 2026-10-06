const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 5000;
const VALID_ENTITY_TYPES = new Set([
  'person',
  'city',
  'country',
  'university',
  'organization'
]);

app.use(cors());
app.use(express.json());

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

async function getAnnotationById(id) {
  const annotation = await get(
    `SELECT id, user_id, page_url, selected_text, prefix, suffix,
            start_offset, end_offset, created_at
     FROM annotations
     WHERE id = ?`,
    [id]
  );

  if (!annotation) return null;

  const entities = await all(
    `SELECT id, text, type,
            start_offset AS start,
            end_offset AS end
     FROM entities
     WHERE annotation_id = ?
     ORDER BY start_offset, id`,
    [id]
  );

  const notes = await all(
    `SELECT id, text, created_at
     FROM notes
     WHERE annotation_id = ?
     ORDER BY id`,
    [id]
  );

  return { ...annotation, entities, notes };
}

function validateAnnotationBody(body) {
  const requiredStrings = ['id', 'page_url', 'selected_text', 'created_at'];
  for (const field of requiredStrings) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return `${field} is required and cannot be empty`;
    }
  }

  if (body.user_id !== null && body.user_id !== undefined && typeof body.user_id !== 'string') {
    return 'user_id must be a string or null';
  }

  if (typeof body.prefix !== 'string' || typeof body.suffix !== 'string') {
    return 'prefix and suffix are required strings';
  }
  if (body.prefix.length > 30 || body.suffix.length > 30) {
    return 'prefix and suffix cannot exceed 30 characters';
  }

  if (!Number.isInteger(body.start_offset) || !Number.isInteger(body.end_offset) || body.start_offset < 0 || body.end_offset <= body.start_offset) {
    return 'Invalid annotation start_offset or end_offset';
  }

  if (body.end_offset - body.start_offset !== body.selected_text.length) {
    return 'Annotation offsets do not match selected_text length';
  }

  if (!Array.isArray(body.entities)) {
    return 'entities must be an array';
  }

  let previousEnd = 0;
  for (const entity of body.entities) {
    if (!entity || typeof entity.text !== 'string' || entity.text === '') {
      return 'Invalid entity text';
    }
    if (!VALID_ENTITY_TYPES.has(entity.type)) {
      return `Invalid entity type: ${entity.type}`;
    }
    if (!Number.isInteger(entity.start) || !Number.isInteger(entity.end) || entity.start < 0 || entity.end <= entity.start || entity.end > body.selected_text.length) {
      return 'Invalid entity start or end position';
    }
    if (entity.start < previousEnd) {
      return 'Entity positions must be sorted and non-overlapping';
    }
    if (body.selected_text.slice(entity.start, entity.end) !== entity.text) {
      return 'Entity text does not match its start/end position';
    }
    previousEnd = entity.end;
  }

  if (body.note !== null && body.note !== undefined && (typeof body.note !== 'string' || body.note.trim() === '')) {
    return 'note must be a non-empty string or null';
  }

  return null;
}

app.post('/annotations', async (req, res) => {
  const body = req.body || {};
  const validationError = validateAnnotationBody(body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const { id, user_id = null, page_url, selected_text, prefix, suffix, start_offset, end_offset, created_at, entities, note = null } = body;

  try {
    await run('BEGIN TRANSACTION');

    await run(
      `INSERT INTO annotations
       (id, user_id, page_url, selected_text, prefix, suffix, start_offset, end_offset, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, page_url, selected_text, prefix, suffix, start_offset, end_offset, created_at]
    );

    for (const entity of entities) {
      await run(
        `INSERT INTO entities
         (annotation_id, text, type, start_offset, end_offset)
         VALUES (?, ?, ?, ?, ?)`,
        [id, entity.text, entity.type, entity.start, entity.end]
      );
    }

    if (typeof note === 'string' && note.trim() !== '') {
      await run(
        `INSERT INTO notes (annotation_id, text, created_at)
         VALUES (?, ?, ?)`,
        [id, note, new Date().toISOString()]
      );
    }

    await run('COMMIT');
    const annotation = await getAnnotationById(id);
    return res.status(201).json({ ok: true, data: annotation });
  } catch (error) {
    try { await run('ROLLBACK'); } catch (_) {}

    if (String(error.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ ok: false, error: 'Annotation ID already exists' });
    }
    return res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/annotations', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl) {
    return res.status(400).json({ ok: false, error: 'URL query parameter is required' });
  }

  try {
    const annotations = await all(
      `SELECT id FROM annotations WHERE page_url = ? ORDER BY created_at, id`,
      [pageUrl]
    );
    const result = [];

    for (const annotation of annotations) {
      result.push(await getAnnotationById(annotation.id));
    }

    return res.json({ ok: true, data: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/annotations/:id/notes', async (req, res) => {
  const annotationId = req.params.id;
  const { text } = req.body || {};

  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Note text cannot be empty' });
  }

  try {
    const annotation = await get('SELECT id FROM annotations WHERE id = ?', [annotationId]);
    if (!annotation) return res.status(404).json({ ok: false, error: 'Annotation not found' });

    const createdAt = new Date().toISOString();
    const result = await run(
      `INSERT INTO notes (annotation_id, text, created_at) VALUES (?, ?, ?)`,
      [annotationId, text, createdAt]
    );

    return res.status(201).json({
      ok: true,
      data: { id: result.lastID, annotation_id: annotationId, text, created_at: createdAt }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.put('/notes/:id', async (req, res) => {
  const noteId = req.params.id;
  const { text } = req.body || {};

  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ ok: false, error: 'Note text cannot be empty' });
  }

  try {
    const result = await run('UPDATE notes SET text = ? WHERE id = ?', [text, noteId]);
    if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Note not found' });

    const note = await get(
      `SELECT id, annotation_id, text, created_at FROM notes WHERE id = ?`,
      [noteId]
    );
    return res.json({ ok: true, data: note });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete('/notes/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM notes WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Note not found' });
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete('/annotations/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM annotations WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Annotation not found' });
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
