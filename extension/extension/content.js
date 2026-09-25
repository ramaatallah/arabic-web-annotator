// content.js - Workstream A: Content Script Implementation

// 1. Restore highlights from local storage on page load if extension is enabled
function restoreHighlights() {
  chrome.storage.local.get({ enabled: true, annotations: [] }, (result) => {
    if (!result.enabled) return;

    const currentUrl = window.location.href;
    const pageAnnotations = result.annotations.filter(a => a.page_url === currentUrl);

    if (pageAnnotations.length === 0) return;

    pageAnnotations.forEach(anno => {
      highlightSavedText(anno.selected_text);
    });
  });
}

document.addEventListener('DOMContentLoaded', restoreHighlights);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  restoreHighlights();
}

// 2. Highlight text within the DOM using <mark> tag
function highlightSavedText(textToFind) {
  if (!textToFind) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;

  while ((node = walker.nextNode())) {
    const index = node.nodeValue.indexOf(textToFind);
    if (index !== -1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + textToFind.length);

      const markNode = document.createElement('mark');
      markNode.style.backgroundColor = '#FFD700';
      markNode.style.color = '#000000';
      markNode.style.borderRadius = '3px';
      markNode.style.padding = '1px 3px';
      markNode.className = 'arabic-annotator-highlight';

      try {
        range.surroundContents(markNode);
      } catch (e) {
        // Ignore minor DOM overlap errors
      }
      break;
    }
  }
}

// 3. Independent listener for storage state changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    console.log("[Annotator] enabled changed to", changes.enabled.newValue);
  }
});

// 4. Handle text selection on mouseup event
document.addEventListener('mouseup', (event) => {
  if (event.target.closest('#arabic-annotator-note-box')) return;

  chrome.storage.local.get({ enabled: true }, (result) => {
    if (!result.enabled) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    removeExistingNoteBox();

    if (selectedText.length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      const markNode = document.createElement('mark');
      markNode.style.backgroundColor = '#FFD700';
      markNode.style.color = '#000000';
      markNode.style.borderRadius = '3px';
      markNode.style.padding = '1px 3px';
      markNode.className = 'arabic-annotator-highlight';

      try {
        range.surroundContents(markNode);
        selection.removeAllRanges();

        createNoteBox(event.pageX, event.pageY, selectedText);
      } catch (e) {
        console.warn("Warning: Cannot highlight text spanning across multiple elements.", e);
      }
    }
  });
});

// 5. Create floating note popup UI
function createNoteBox(x, y, selectedText) {
  const box = document.createElement('div');
  box.id = 'arabic-annotator-note-box';
  box.style.position = 'absolute';
  box.style.left = `${x}px`;
  box.style.top = `${y + 10}px`;
  box.style.backgroundColor = '#ffffff';
  box.style.border = '1px solid #ccc';
  box.style.borderRadius = '8px';
  box.style.padding = '10px';
  box.style.boxShadow = '0px 4px 12px rgba(0,0,0,0.15)';
  box.style.zIndex = '999999';
  box.style.direction = 'rtl';
  box.style.fontFamily = 'sans-serif';

  box.innerHTML = `
    <div style="margin-bottom: 6px; font-weight: bold; font-size: 12px; color: #333;">إضافة ملاحظة:</div>
    <textarea id="arabic-annotator-text" rows="3" style="width: 180px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; resize: none; font-size: 12px;" placeholder="اكتب ملاحظتك هنا..."></textarea>
    <div style="margin-top: 8px; text-align: left;">
      <button id="arabic-annotator-save-btn" style="background-color: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">حفظ</button>
    </div>
  `;

  document.body.appendChild(box);

  document.getElementById('arabic-annotator-save-btn').addEventListener('click', () => {
    const noteContent = document.getElementById('arabic-annotator-text').value.trim();

    // Align schema directly with approved API contract
    const annotationObject = {
      id: 'anno_' + Date.now(),
      user_id: null,
      page_url: window.location.href,
      selected_text: selectedText,
      annotation: noteContent || null,
      prefix: "",
      suffix: "",
      created_at: new Date().toISOString()
    };

    chrome.storage.local.get({ annotations: [] }, (result) => {
      const updatedAnnotations = [...result.annotations, annotationObject];

      chrome.storage.local.set({ annotations: updatedAnnotations }, () => {
        console.log("Saved successfully with new schema!");
        removeExistingNoteBox();
      });
    });
  });
}

// 6. Remove existing note box if present
function removeExistingNoteBox() {
  const existingBox = document.getElementById('arabic-annotator-note-box');
  if (existingBox) {
    existingBox.remove();
  }
}