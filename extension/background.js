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
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: "No response from background script" });
      }
    });
  });
}

function handleMockResponse(message) {
  return new Promise((resolve) => {
    try {
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
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

// 2. Selection Event Handling & Early Un-highlighting
let currentSelectionRange = null;

document.addEventListener('mouseup', handleTextSelection);

function handleTextSelection(e) {
  if (e.target.closest('#arabic-annotator-box') || e.target.closest('#arabic-annotator-hover-card')) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const selectedText = selection.toString().trim();

  if (selectedText.length === 0) {
    return;
  }

  try {
    const range = selection.getRangeAt(0);
    currentSelectionRange = range.cloneRange();

    selection.removeAllRanges();

    processSelection(selectedText, currentSelectionRange);
  } catch (err) {
    console.error('Error handling text selection:', err);
  }
}

// 3. Positioning and Initial Entity Analysis
async function processSelection(selectedText, range) {
  try {
    const rect = range.getBoundingClientRect();
    const position = {
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX
    };

    const response = await send({ type: 'ANALYZE_TEXT', text: selectedText });
    const entities = (response && response.ok) ? response.data : [];

    showAnnotatorBox(selectedText, range, position, entities);
  } catch (err) {
    console.error('Error in processSelection:', err);
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
  if (entities && entities.length > 0) {
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
    const noteInput = document.getElementById('arabic-annotator-note');
    const noteText = noteInput ? noteInput.value : '';
    handleSaveAnnotation(selectedText, range, entities, noteText);
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
    if (response && response.ok) {
      applyHighlightToRange(range, response.data);
      removeAnnotatorBox();
    } else {
      console.error('Failed to save annotation:', response ? response.error : 'Unknown error');
    }
  } catch (err) {
    console.error('Error saving annotation:', err);
  }
}

function getSurroundingContext(range, length = 30) {
  try {
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || '';
    
    const start = range.startOffset;
    const end = range.endOffset;

    const prefix = fullText.substring(Math.max(0, start - length), start);
    const suffix = fullText.substring(end, Math.min(fullText.length, end + length));

    return { prefix, suffix };
  } catch (e) {
    return { prefix: '', suffix: '' };
  }
}

// 9. Multi-node / Cross-element Selection Support Implementation
function applyHighlightToRange(range, annotationData) {
  try {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      const mark = createHighlightElement(annotationData.id);
      range.surroundContents(mark);
    } else {
      highlightMultiNodeRange(range, annotationData.id);
    }
  } catch (e) {
    console.warn('surroundContents failed, falling back to multi-node handler:', e);
    highlightMultiNodeRange(range, annotationData.id);
  }
}

function createHighlightElement(annotationId) {
  const mark = document.createElement('mark');
  mark.className = 'arabic-annotator-highlight';
  mark.dataset.annotationId = annotationId;
  mark.style.backgroundColor = '#fff59d';
  mark.style.color = 'inherit';
  mark.style.padding = '2px 0';
  mark.style.borderRadius = '3px';
  mark.style.cursor = 'pointer';
  return mark;
}

function highlightMultiNodeRange(range, annotationId) {
  const textNodes = [];
  const treeWalker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );

  while (treeWalker.nextNode()) {
    textNodes.push(treeWalker.currentNode);
  }

  textNodes.forEach(node => {
    if (!node.nodeValue.trim()) return;

    const subRange = document.createRange();
    let startOffset = 0;
    let endOffset = node.nodeValue.length;

    if (node === range.startContainer) startOffset = range.startOffset;
    if (node === range.endContainer) endOffset = range.endOffset;

    if (startOffset < endOffset) {
      subRange.setStart(node, startOffset);
      subRange.setEnd(node, endOffset);

      const mark = createHighlightElement(annotationId);
      try {
        subRange.surroundContents(mark);
      } catch (err) {
        console.error('Error highlighting sub-range node:', err);
      }
    }
  });
}

// 6 & 10. Hover Card Interaction and Note Management
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
    card.style.minWidth = '240px';

    let notesHtml = '';
    if (annotation.notes && annotation.notes.length > 0) {
      notesHtml = annotation.notes.map(n => `
        <div class="note-item" data-note-id="${n.id}" style="background: #f9f9f9; padding: 6px; border-radius: 4px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span class="note-text">${n.text}</span>
          <div style="display: flex; gap: 4px;">
            <button class="btn-edit-note" style="border:none; background:none; cursor:pointer; color:#1976d2; font-size:10px;">تعديل</button>
            <button class="btn-delete-note" style="border:none; background:none; cursor:pointer; color:#e53935; font-size:10px;">حذف</button>
          </div>
        </div>
      `).join('');
    }

    card.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: #333;">التظليل المحفوظ</div>
      <div id="notes-container">${notesHtml}</div>
      <div style="margin-top: 8px;">
        <input type="text" id="new-note-input" placeholder="إضافة ملاحظة جديدة..." style="width: 100%; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" />
        <button id="btn-add-note" style="margin-top: 4px; width: 100%; background: #1976d2; color: white; border: none; padding: 4px; border-radius: 4px; cursor: pointer; font-size: 11px;">إضافة ملاحظة</button>
      </div>
      <div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 6px; display: flex; justify-content: flex-end;">
        <button id="arabic-annotator-delete-ann" style="background: #e53935; color: white; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">حذف التظليل كامل</button>
      </div>
    `;

    document.body.appendChild(card);

    card.addEventListener('mouseleave', () => removeHoverCard());
    mark.addEventListener('mouseleave', () => {
      hoverCardTimeout = setTimeout(() => {
        if (!card.matches(':hover')) removeHoverCard();
      }, 300);
    });

    card.querySelector('#btn-add-note').addEventListener('click', async () => {
      const input = card.querySelector('#new-note-input');
      const text = input ? input.value.trim() : '';
      if (text) {
        await send({ type: 'ADD_NOTE', annotation_id: annotationId, text: text });
        showHoverCard(mark);
      }
    });

    card.querySelector('#notes-container').addEventListener('click', async (e) => {
      const noteItem = e.target.closest('.note-item');
      if (!noteItem) return;
      const noteId = noteItem.dataset.noteId;

      if (e.target.classList.contains('btn-delete-note')) {
        await send({ type: 'DELETE_NOTE', id: noteId });
        showHoverCard(mark);
      } else if (e.target.classList.contains('btn-edit-note')) {
        const textSpan = noteItem.querySelector('.note-text');
        const currentText = textSpan.textContent;
        const newText = prompt('تعديل الملاحظة:', currentText);
        if (newText !== null && newText.trim() !== '') {
          await send({ type: 'UPDATE_NOTE', id: noteId, text: newText.trim() });
          showHoverCard(mark);
        }
      }
    });

    const deleteAnnBtn = card.querySelector('#arabic-annotator-delete-ann');
    if (deleteAnnBtn) {
      deleteAnnBtn.addEventListener('click', async () => {
        await send({ type: 'DELETE_ANNOTATION', id: annotationId });
        const allMarks = document.querySelectorAll(`mark[data-annotation-id="${annotationId}"]`);
        allMarks.forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
        removeHoverCard();
      });
    }
  });
}

function removeHoverCard() {
  const card = document.getElementById('arabic-annotator-hover-card');
  if (card) card.remove();
}

// 7 & 11. On-load Annotation Restoration & Robust Context Matching Algorithm
document.addEventListener('DOMContentLoaded', restorePageAnnotations);

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  restorePageAnnotations();
}

async function restorePageAnnotations() {
  try {
    const response = await send({ type: 'GET_ANNOTATIONS', url: window.location.href });
    if (response && response.ok && Array.isArray(response.data)) {
      response.data.forEach(annotation => {
        restoreSingleAnnotation(annotation);
      });
    }
  } catch (err) {
    console.error('Error restoring annotations:', err);
  }
}

// Step 11: Enhanced Context Matching Algorithm
function restoreSingleAnnotation(annotation) {
  const { id, selected_text, prefix, suffix } = annotation;
  if (!selected_text) return;
  
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  let candidateNode = null;
  let candidateIndex = -1;
  let highestScore = -1;

  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    let index = text.indexOf(selected_text);

    while (index !== -1) {
      let score = 0;
      const nodePrefix = text.substring(Math.max(0, index - (prefix ? prefix.length : 0)), index);
      const nodeSuffix = text.substring(index + selected_text.length, index + selected_text.length + (suffix ? suffix.length : 0));

      if (prefix && (nodePrefix.endsWith(prefix) || prefix.endsWith(nodePrefix))) score += 2;
      if (suffix && (nodeSuffix.startsWith(suffix) || suffix.startsWith(nodeSuffix))) score += 2;

      if (score > highestScore) {
        highestScore = score;
        candidateNode = node;
        candidateIndex = index;
      }

      index = text.indexOf(selected_text, index + 1);
    }
  }

  // Fallback if no contextual match score but exact text exists
  if (!candidateNode) {
    const fallbackWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while ((node = fallbackWalker.nextNode())) {
      const idx = node.nodeValue.indexOf(selected_text);
      if (idx !== -1) {
        candidateNode = node;
        candidateIndex = idx;
        break;
      }
    }
  }

  if (candidateNode && candidateIndex !== -1) {
    try {
      const range = document.createRange();
      range.setStart(candidateNode, candidateIndex);
      range.setEnd(candidateNode, candidateIndex + selected_text.length);
      applyHighlightToRange(range, { id });
    } catch (e) {
      console.error('Failed to apply restored range:', e);
    }
  }
}