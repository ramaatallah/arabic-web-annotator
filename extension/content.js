// extension/content.js - Workstream A: Content Script Implementation

// 1. Mock Configuration and Central Communication Function
const MOCK = {
  ANALYZE_TEXT: true,
  SAVE_ANNOTATION: true,
  GET_ANNOTATIONS: true,
  ADD_NOTE: true,
  UPDATE_NOTE: true,
  DELETE_NOTE: true,
  DELETE_ANNOTATION: true
};

async function send(message) {
  const type = message.type;

  if (MOCK[type]) {
    return handleMockResponse(message);
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { ok: false, error: "No response from background script" });
    });
  });
}

function handleMockResponse(message) {
  return new Promise((resolve) => {
    switch (message.type) {
      case 'ANALYZE_TEXT': {
        const text = message.text || '';
        const mockEntities = [];
        if (text.includes('أحمد')) {
          const start = text.indexOf('أحمد');
          mockEntities.push({ text: 'أحمد', type: 'person', start: start, end: start + 4 });
        }
        if (text.includes('جامعة النجاح')) {
          const start = text.indexOf('جامعة النجاح');
          mockEntities.push({ text: 'جامعة النجاح', type: 'university', start: start, end: start + 12 });
        }
        if (text.includes('نابلس')) {
          const start = text.indexOf('نابلس');
          mockEntities.push({ text: 'نابلس', type: 'city', start: start, end: start + 5 });
        }
        resolve({ ok: true, data: mockEntities });
        break;
      }

      case 'SAVE_ANNOTATION': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const annotations = result.mock_annotations;
          const newAnnotation = {
            id: 'ann_' + Date.now(),
            user_id: null,
            page_url: message.page_url,
            selected_text: message.selected_text,
            prefix: message.prefix || '',
            suffix: message.suffix || '',
            start_offset: message.start_offset || 0,
            end_offset: message.end_offset || 0,
            created_at: new Date().toISOString(),
            entities: message.entities || [],
            notes: message.note ? [{ id: 'note_' + Date.now(), text: message.note, created_at: new Date().toISOString() }] : []
          };
          annotations.push(newAnnotation);
          chrome.storage.local.set({ mock_annotations: annotations }, () => {
            resolve({ ok: true, data: newAnnotation });
          });
        });
        break;
      }

      case 'GET_ANNOTATIONS': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const pageAnnotations = result.mock_annotations.filter(ann => ann.page_url === message.url);
          resolve({ ok: true, data: pageAnnotations });
        });
        break;
      }

      case 'ADD_NOTE': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const annotations = result.mock_annotations;
          const ann = annotations.find(a => a.id === message.annotation_id);
          if (ann) {
            const newNote = { id: 'note_' + Date.now(), text: message.text, created_at: new Date().toISOString() };
            ann.notes = ann.notes || [];
            ann.notes.push(newNote);
            chrome.storage.local.set({ mock_annotations: annotations }, () => {
              resolve({ ok: true, data: newNote });
            });
          } else {
            resolve({ ok: false, error: "Annotation not found" });
          }
        });
        break;
      }

      case 'UPDATE_NOTE': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const annotations = result.mock_annotations;
          let updatedNote = null;
          annotations.forEach(ann => {
            if (ann.notes) {
              const note = ann.notes.find(n => n.id === message.id);
              if (note) {
                note.text = message.text;
                updatedNote = note;
              }
            }
          });
          if (updatedNote) {
            chrome.storage.local.set({ mock_annotations: annotations }, () => {
              resolve({ ok: true, data: updatedNote });
            });
          } else {
            resolve({ ok: false, error: "Note not found" });
          }
        });
        break;
      }

      case 'DELETE_NOTE': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const annotations = result.mock_annotations;
          annotations.forEach(ann => {
            if (ann.notes) {
              ann.notes = ann.notes.filter(n => n.id !== message.id);
            }
          });
          chrome.storage.local.set({ mock_annotations: annotations }, () => {
            resolve({ ok: true, data: { deleted: true } });
          });
        });
        break;
      }

      case 'DELETE_ANNOTATION': {
        chrome.storage.local.get({ mock_annotations: [] }, (result) => {
          const annotations = result.mock_annotations.filter(a => a.id !== message.id);
          chrome.storage.local.set({ mock_annotations: annotations }, () => {
            resolve({ ok: true, data: { deleted: true } });
          });
        });
        break;
      }

      default:
        resolve({ ok: false, error: "Unknown message type" });
    }
  });
}

// 2. Selection Event Handling & Early Un-highlighting
let currentSelectionRange = null;

document.addEventListener('mouseup', handleTextSelection);

function handleTextSelection(e) {
  // Ignore clicks inside extension popups or controls if any
  if (e.target.closest('#arabic-annotator-box') || e.target.closest('#arabic-annotator-hover-card')) {
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length > 0) {
    const range = selection.getRangeAt(0);
    // Store the selected range for later processing
    currentSelectionRange = range.cloneRange();

    // Immediately clear default blue highlighting
    selection.removeAllRanges();

    console.log('Text selected and saved in range:', selectedText);
  }
}