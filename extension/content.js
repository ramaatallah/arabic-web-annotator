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

    // Process selection positioning and NER analysis (Step 3)
    processSelection(selectedText, currentSelectionRange);
  }
}

// 3. Positioning and Initial Entity Analysis
async function processSelection(selectedText, range) {
  // Get text coordinates relative to viewport
  const rect = range.getBoundingClientRect();
  const position = {
    top: rect.bottom + window.scrollY + 8, // Position slightly below the selection
    left: rect.left + window.scrollX
  };

  try {
    // Send request to analyze selected text for entities
    const response = await send({ type: 'ANALYZE_TEXT', text: selectedText });
    const entities = response.ok ? response.data : [];

    // Trigger UI presentation (Step 4)
    if (typeof showAnnotatorBox === 'function') {
      showAnnotatorBox(selectedText, range, position, entities);
    } else {
      console.log('Selection processed:', { selectedText, position, entities });
    }
  } catch (err) {
    console.error('Error analyzing text:', err);
  }
}

// 4. Floating Action Box UI Construction
function showAnnotatorBox(selectedText, range, position, entities = []) {
  removeAnnotatorBox();

  const box = document.createElement('div');
  box.id = 'arabic-annotator-box';
  box.style.position = 'absolute';
  box.style.top = `${position.top}px`;
  box.style.left = `${position.left}px`;
  box.style.zIndex = '2147483647';
  box.style.backgroundColor = '#ffffff';
  box.style.border = '1px solid #e0e0e0';
  box.style.borderRadius = '8px';
  box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  box.style.padding = '12px';
  box.style.fontFamily = 'sans-serif';
  box.style.direction = 'rtl';
  box.style.minWidth = '260px';

  let entitiesHtml = '';
  if (entities.length > 0) {
    entitiesHtml = `
      <div style="margin-bottom: 8px; font-size: 12px; color: #555;">
        <strong>الكيانات المكتشفة:</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
          ${entities.map(e => `<span style="background: #e3f2fd; color: #1565c0; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${e.text} (${e.type})</span>`).join('')}
        </div>
      </div>
    `;
  }

  box.innerHTML = `
    ${entitiesHtml}
    <textarea id="arabic-annotator-note" placeholder="أضف ملاحظة (اختياري)..." style="width: 100%; height: 50px; margin-bottom: 8px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; resize: none; box-sizing: border-box;"></textarea>
    <div style="display: flex; justify-content: flex-end; gap: 6px;">
      <button id="arabic-annotator-cancel" style="padding: 4px 10px; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 12px;">إلغاء</button>
      <button id="arabic-annotator-save" style="padding: 4px 10px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">حفظ</button>
    </div>
  `;

  document.body.appendChild(box);

  document.getElementById('arabic-annotator-cancel').addEventListener('click', removeAnnotatorBox);
  document.getElementById('arabic-annotator-save').addEventListener('click', () => {
    const noteText = document.getElementById('arabic-annotator-note').value;
    if (typeof handleSaveAnnotation === 'function') {
      handleSaveAnnotation(selectedText, range, entities, noteText);
    } else {
      console.log('Save triggered:', { selectedText, noteText, entities });
      removeAnnotatorBox();
    }
  });
}

function removeAnnotatorBox() {
  const existing = document.getElementById('arabic-annotator-box');
  if (existing) {
    existing.remove();
  }
}

// 5. Annotation Creation & Persistent Highlighting
async function handleSaveAnnotation(selectedText, range, entities = [], noteText = '') {
  // Extract surrounding context (prefix and suffix) for robust anchor matching
  const context = getSurroundingContext(range);

  const annotationPayload = {
    type: 'SAVE_ANNOTATION',
    page_url: window.location.href,
    selected_text: selectedText,
    prefix: context.prefix,
    suffix: context.suffix,
    start_offset: range.startOffset,
    end_offset: range.endOffset,
    entities: entities,
    note: noteText.trim()
  };

  try {
    const response = await send(annotationPayload);
    if (response.ok) {
      // Highlight the range in DOM
      applyHighlightToRange(range, response.data);
      removeAnnotatorBox();
    } else {
      console.error('Failed to save annotation:', response.error);
    }
  } catch (err) {
    console.error('Error saving annotation:', err);
  }
}

function getSurroundingContext(range, length = 30) {
  const container = range.commonAncestorContainer;
  const fullText = container.textContent || '';
  
  const start = range.startOffset;
  const end = range.endOffset;

  const prefix = fullText.substring(Math.max(0, start - length), start);
  const suffix = fullText.substring(end, Math.min(fullText.length, end + length));

  return { prefix, suffix };
}

function applyHighlightToRange(range, annotationData) {
  const mark = document.createElement('mark');
  mark.className = 'arabic-annotator-highlight';
  mark.dataset.annotationId = annotationData.id;
  mark.style.backgroundColor = '#fff59d';
  mark.style.color = 'inherit';
  mark.style.padding = '2px 0';
  mark.style.borderRadius = '3px';
  mark.style.cursor = 'pointer';

  try {
    range.surroundContents(mark);
  } catch (e) {
    // Fallback if range spans multiple node boundaries
    console.warn('Direct surroundContents failed, wrapping text nodes:', e);
  }
}

// 6. Hover Card Interaction
document.addEventListener('mouseover', (e) => {
  const mark = e.target.closest('.arabic-annotator-highlight');
  if (mark) {
    showHoverCard(mark);
  }
});

let hoverCardTimeout = null;

function showHoverCard(mark) {
  clearTimeout(hoverCardTimeout);
  removeHoverCard();

  const annotationId = mark.dataset.annotationId;

  chrome.storage.local.get({ mock_annotations: [] }, (result) => {
    const annotation = result.mock_annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    const rect = mark.getBoundingClientRect();
    const card = document.createElement('div');
    card.id = 'arabic-annotator-hover-card';
    card.style.position = 'absolute';
    card.style.top = `${rect.bottom + window.scrollY + 6}px`;
    card.style.left = `${rect.left + window.scrollX}px`;
    card.style.zIndex = '2147483647';
    card.style.backgroundColor = '#ffffff';
    card.style.border = '1px solid #ddd';
    card.style.borderRadius = '6px';
    card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    card.style.padding = '10px';
    card.style.fontSize = '12px';
    card.style.direction = 'rtl';
    card.style.minWidth = '220px';

    let notesHtml = '';
    if (annotation.notes && annotation.notes.length > 0) {
      notesHtml = annotation.notes.map(n => `<div style="background: #f9f9f9; padding: 4px 6px; border-radius: 4px; margin-top: 4px;">${n.text}</div>`).join('');
    }

    card.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">التظليل المحفوظ</div>
      ${notesHtml}
      <div style="margin-top: 8px; display: flex; gap: 4px; justify-content: flex-end;">
        <button id="arabic-annotator-delete-ann" style="background: #e53935; color: white; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer;">حذف</button>
      </div>
    `;

    document.body.appendChild(card);

    card.addEventListener('mouseleave', () => removeHoverCard());
    mark.addEventListener('mouseleave', () => {
      hoverCardTimeout = setTimeout(() => {
        if (!card.matches(':hover')) removeHoverCard();
      }, 300);
    });

    const deleteBtn = card.querySelector('#arabic-annotator-delete-ann');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        await send({ type: 'DELETE_ANNOTATION', id: annotationId });
        mark.replaceWith(document.createTextNode(mark.textContent));
        removeHoverCard();
      });
    }
  });
}

function removeHoverCard() {
  const card = document.getElementById('arabic-annotator-hover-card');
  if (card) card.remove();
}