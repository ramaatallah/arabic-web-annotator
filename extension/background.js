// extension/background.js - Workstream B: Service Worker & API Layer Implementation

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Set USE_MOCK to false when connecting to the real FastAPI backend
const USE_MOCK = false;

// 1. Central Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ ok: false, error: error.message }));

  // Return true to indicate asynchronous response handling
  return true;
});

async function handleMessage(message, sender) {
  if (USE_MOCK) {
    return handleMockBackgroundResponse(message);
  }

  switch (message.type) {
    case 'ANALYZE_TEXT':
      return await analyzeTextAPI(message.text);

    case 'SAVE_ANNOTATION':
      return await saveAnnotationAPI(message);

    case 'GET_ANNOTATIONS':
      return await getAnnotationsAPI(message.url);

    case 'ADD_NOTE':
      return await addNoteAPI(message.annotation_id, message.text);

    case 'UPDATE_NOTE':
      return await updateNoteAPI(message.id, message.text);

    case 'DELETE_NOTE':
      return await deleteNoteAPI(message.id);

    case 'DELETE_ANNOTATION':
      return await deleteAnnotationAPI(message.id);

    default:
      return { ok: false, error: `Unknown action type: ${message.type}` };
  }
}

// 2. Helper Function for Fetching with Token Authorization
async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: data.detail || 'API request failed' };
    }

    return { ok: true, data };
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    return { ok: false, error: err.message || 'Network error' };
  }
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth_token'], (result) => {
      resolve(result.auth_token || null);
    });
  });
}

// 3. API Handlers
async function analyzeTextAPI(text) {
  return await apiRequest('/ner/analyze', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

async function saveAnnotationAPI(payload) {
  return await apiRequest('/annotations', {
    method: 'POST',
    body: JSON.stringify({
      page_url: payload.page_url,
      selected_text: payload.selected_text,
      prefix: payload.prefix,
      suffix: payload.suffix,
      start_offset: payload.start_offset,
      end_offset: payload.end_offset,
      entities: payload.entities,
      note: payload.note
    })
  });
}

async function getAnnotationsAPI(url) {
  const encodedUrl = encodeURIComponent(url);
  return await apiRequest(`/annotations?page_url=${encodedUrl}`, {
    method: 'GET'
  });
}

async function addNoteAPI(annotationId, text) {
  return await apiRequest(`/annotations/${annotationId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

async function updateNoteAPI(noteId, text) {
  return await apiRequest(`/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ text })
  });
}

async function deleteNoteAPI(noteId) {
  return await apiRequest(`/notes/${noteId}`, {
    method: 'DELETE'
  });
}

async function deleteAnnotationAPI(annotationId) {
  return await apiRequest(`/annotations/${annotationId}`, {
    method: 'DELETE'
  });
}

// 4. Mock Handlers (Fallback for Offline Testing)
async function handleMockBackgroundResponse(message) {
  // Simple mock wrapper for standalone extension testing
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ok: true, data: { message: "Mock response executed" } });
    }, 100);
  });
}