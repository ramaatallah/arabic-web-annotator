const API_BASE = "http://localhost:5000";
const NER_BASE = "http://localhost:8000";
const NER_TIMEOUT_MS = 3000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; 
});

async function handleMessage(message) {
  switch (message.type) {
    case "SAVE_ANNOTATION":
      return await saveAnnotation(message.annotation);
    case "GET_ANNOTATIONS":
      return await getAnnotations(message.page_url);
    case "DELETE_ANNOTATION":
      return await deleteAnnotation(message.id);
    case "ANALYZE_TEXT":
      return await analyzeText(message.text);
    case "ADD_NOTE":
      return await addNote(message.annotation_id, message.text);
    case "UPDATE_NOTE":
      return await updateNote(message.id, message.text);
    case "DELETE_NOTE":
      return await deleteNote(message.id);
    default:
      return { ok: false, error: "نوع رسالة غير معروف: " + message.type };
  }
}

// POST /annotations 
async function saveAnnotation(annotation) {
  const res = await fetch(`${API_BASE}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
  });
  if (!res.ok) throw new Error("فشل الحفظ (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}

// GET /annotations?url=... 
async function getAnnotations(pageUrl) {
  const res = await fetch(`${API_BASE}/annotations?url=${encodeURIComponent(pageUrl)}`);
  if (!res.ok) throw new Error("فشل الجلب (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}


// DELETE /annotations
async function deleteAnnotation(id) {
  const res = await fetch(`${API_BASE}/annotations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("فشل الحذف (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}

// POST /analyze (خدمة NER) مع مهلة 3 ثواني
async function analyzeText(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NER_TIMEOUT_MS);
  try {
    const res = await fetch(`${NER_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("فشل التحليل (status " + res.status + ")");
    return { ok: true, data: await res.json() };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("انتهت مهلة خدمة التحليل (3 ثواني)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
// POST /annotations/:id/notes
async function addNote(annotationId, text) {
  const res = await fetch(`${API_BASE}/annotations/${encodeURIComponent(annotationId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("فشل إضافة الملاحظة (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}

// PUT /notes/:id
async function updateNote(id, text) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("فشل تعديل الملاحظة (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}

// DELETE /notes/:id
async function deleteNote(id) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("فشل حذف الملاحظة (status " + res.status + ")");
  return { ok: true, data: await res.json() };
}