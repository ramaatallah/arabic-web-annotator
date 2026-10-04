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
    case "UPDATE_ANNOTATION":
      return await updateAnnotation(message.id, message.changes);
    case "DELETE_ANNOTATION":
      return await deleteAnnotation(message.id);
        case "ANALYZE_TEXT":
      return await analyzeText(message.text);
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

// PUT /annotations
async function updateAnnotation(id, changes) {
  const res = await fetch(`${API_BASE}/annotations/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error("فشل التعديل (status " + res.status + ")");
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