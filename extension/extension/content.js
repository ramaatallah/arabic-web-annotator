// content.js - المسار 1 المكتمل بالكامل (المهام 1 إلى 6)

// 1. إعادة تظليل النصوص المحفوظة عند فتح الصفحة بشرط أن تكون الإضافة مفعلة
function restoreHighlights() {
  chrome.storage.local.get({ enabled: true, highlights: [] }, (result) => {
    if (!result.enabled) return; // عدم التنفيذ إذا كانت الإضافة معطلة

    const currentUrl = window.location.href;
    const pageHighlights = result.highlights.filter(h => h.url === currentUrl);

    if (pageHighlights.length === 0) return;

    pageHighlights.forEach(hl => {
      highlightSavedText(hl.text);
    });
  });
}

document.addEventListener('DOMContentLoaded', restoreHighlights);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  restoreHighlights();
}

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
        // تجاهل الأخطاء البسيطة في التداخل
      }
      break;
    }
  }
}

// 2. معالجة تحديد النص مع التحقق من زر التفعيل enabled
document.addEventListener('mouseup', (event) => {
  if (event.target.closest('#arabic-annotator-note-box')) return;

  chrome.storage.local.get({ enabled: true }, (result) => {
    if (!result.enabled) return; // إلغاء التظليل إذا كانت الإضافة معطلة

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
        console.warn("تنبيه: لا يمكن تظليل النص المتقاطع بين عناصر مختلفة.", e);
      }
    }
  });
});

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
    
    const highlightId = 'hl_' + Date.now();
    const noteId = noteContent ? 'note_' + Date.now() : null;

    const highlightObject = {
      id: highlightId,
      url: window.location.href,
      text: selectedText,
      color: '#FFD700',
      createdAt: new Date().toISOString(),
      noteId: noteId
    };

    const noteObject = noteId ? {
      id: noteId,
      highlightId: highlightId,
      text: noteContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } : null;

    chrome.storage.local.get({ highlights: [], notes: [] }, (result) => {
      const updatedHighlights = [...result.highlights, highlightObject];
      const updatedNotes = noteObject ? [...result.notes, noteObject] : result.notes;

      chrome.storage.local.set({ highlights: updatedHighlights, notes: updatedNotes }, () => {
        console.log("تم الحفظ بنجاح!");
        removeExistingNoteBox();
      });
    });
  });
}

function removeExistingNoteBox() {
  const existingBox = document.getElementById('arabic-annotator-note-box');
  if (existingBox) {
    existingBox.remove();
  }
}