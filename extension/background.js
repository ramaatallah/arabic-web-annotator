const API_BASE = "http://localhost:5000";
const NER_BASE = "http://localhost:8000";
const NER_TIMEOUT_MS = 3000;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;

  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }

  if (!response.ok) {
    const error = body && body.error ? body.error : `HTTP ${response.status}`;
    throw new Error(error);
  }

  return body;
}

async function analyzeText(text) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NER_TIMEOUT_MS);

  try {
    const body = await requestJson(`${NER_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    return { ok: true, data: body };
  } catch (_) {
    // NER failure must not prevent saving an annotation.
    return { ok: true, data: { entities: [] } };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function saveAnnotation(annotation) {
  try {
    const body = await requestJson(`${API_BASE}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation)
    });
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function getAnnotations(pageUrl) {
  try {
    const url = `${API_BASE}/annotations?url=${encodeURIComponent(pageUrl)}`;
    const body = await requestJson(url);
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function addNote(annotationId, text) {
  try {
    const body = await requestJson(`${API_BASE}/annotations/${encodeURIComponent(annotationId)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function updateNote(id, text) {
  try {
    const body = await requestJson(`${API_BASE}/notes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    return { ok: true, data: body.data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function deleteNote(id) {
  try {
    const body = await requestJson(`${API_BASE}/notes/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    return { ok: true, data: { deleted: body.deleted === true } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function deleteAnnotation(id) {
  try {
    const body = await requestJson(`${API_BASE}/annotations/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    return { ok: true, data: { deleted: body.deleted === true } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "Invalid message" };
  }

  switch (message.type) {
    case "ANALYZE_TEXT":
      return analyzeText(message.text);
    case "SAVE_ANNOTATION":
      return saveAnnotation(message.annotation);
    case "GET_ANNOTATIONS":
      return getAnnotations(message.page_url);
    case "ADD_NOTE":
      return addNote(message.annotation_id, message.text);
    case "UPDATE_NOTE":
      return updateNote(message.id, message.text);
    case "DELETE_NOTE":
      return deleteNote(message.id);
    case "DELETE_ANNOTATION":
      return deleteAnnotation(message.id);
    default:
      return { ok: false, error: `نوع رسالة غير معروف: ${message.type}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
