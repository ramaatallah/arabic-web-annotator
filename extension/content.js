let enabled = true;
let currentSelectionRange = null;
let hoverCardTimeout = null;

function cleanPageUrl() {
  const url = new URL(window.location.href);
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response from background script" });
    });
  });
}

function refreshEnabledState() {
  chrome.storage.local.get(["enabled"], (result) => {
    enabled = result.enabled !== false;
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    enabled = changes.enabled.newValue !== false;
  }
});

function isVisibleTextNode(node) {
  if (!node.parentElement) return false;
  if (node.parentElement.closest("script, style, noscript, template")) return false;

  let element = node.parentElement;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    element = element.parentElement;
  }

  return true;
}

function getPageTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return isVisibleTextNode(node) && node.nodeValue
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

function getPageText() {
  return getPageTextNodes().map((node) => node.nodeValue).join("");
}

function pointToPageOffset(container, offset, textNodes) {
  const point = document.createRange();
  point.setStart(container, offset);
  point.collapse(true);

  let total = 0;

  for (const node of textNodes) {
    if (node === container) {
      return total + offset;
    }

    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);

    const pointVsNodeEnd = point.compareBoundaryPoints(Range.START_TO_END, nodeRange);
    if (pointVsNodeEnd >= 0) {
      total += node.nodeValue.length;
      continue;
    }

    const pointVsNodeStart = point.compareBoundaryPoints(Range.START_TO_START, nodeRange);
    if (pointVsNodeStart >= 0) {
      const inside = document.createRange();
      inside.setStart(node, 0);
      inside.setEnd(container, offset);
      return total + inside.toString().length;
    }

    break;
  }

  return total;
}

function getRangePageOffsets(range, textNodes) {
  return {
    start: pointToPageOffset(range.startContainer, range.startOffset, textNodes),
    end: pointToPageOffset(range.endContainer, range.endOffset, textNodes)
  };
}

function getSurroundingContext(pageText, start, end, length = 30) {
  return {
    prefix: pageText.slice(Math.max(0, start - length), start),
    suffix: pageText.slice(end, Math.min(pageText.length, end + length))
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("mousedown", (event) => {
  const box = document.getElementById("arabic-annotator-box");
  const card = document.getElementById("arabic-annotator-hover-card");
  if ((box && !box.contains(event.target)) || (card && !card.contains(event.target))) {
    removeAnnotatorBox();
    removeHoverCard();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeAnnotatorBox();
    removeHoverCard();
  }
});

document.addEventListener("mouseup", handleTextSelection);

function handleTextSelection(event) {
  if (!enabled) return;
  if (event.target.closest("#arabic-annotator-box, #arabic-annotator-hover-card")) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const selectedText = selection.toString();
  if (!selectedText.trim()) return;

  try {
    const range = selection.getRangeAt(0).cloneRange();
    currentSelectionRange = range.cloneRange();
    selection.removeAllRanges();
    processSelection(selectedText, range);
  } catch (error) {
    console.error("Error handling text selection:", error);
  }
}

async function processSelection(selectedText, range) {
  const rect = range.getBoundingClientRect();
  const position = {
    top: rect.bottom + window.scrollY + 8,
    left: rect.left + window.scrollX
  };

  try {
    const response = await send({ type: "ANALYZE_TEXT", text: selectedText });
    const entities = response.ok && response.data && Array.isArray(response.data.entities)
      ? response.data.entities
      : [];

    showAnnotatorBox(selectedText, range, position, entities);
  } catch (error) {
    console.error("Error analyzing text:", error);
    showAnnotatorBox(selectedText, range, position, []);
  }
}

function showAnnotatorBox(selectedText, range, position, entities = []) {
  removeAnnotatorBox();

  const box = document.createElement("div");
  box.id = "arabic-annotator-box";
  box.style.cssText = `position:absolute;top:${position.top}px;left:${position.left}px;z-index:2147483647;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:12px;font-family:sans-serif;direction:rtl;min-width:260px;`;

  const entitiesHtml = entities.length
    ? `<div style="margin-bottom:8px;font-size:12px;color:#555"><strong>الكيانات المكتشفة:</strong><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${entities.map((entity) => `<span style="background:#e3f2fd;color:#1565c0;padding:2px 6px;border-radius:4px;font-size:11px">${escapeHtml(entity.text)} (${escapeHtml(entity.type)})</span>`).join("")}</div></div>`
    : "";

  box.innerHTML = `
    ${entitiesHtml}
    <textarea id="arabic-annotator-note" placeholder="أضف ملاحظة (اختياري)..." style="width:100%;height:50px;margin-bottom:8px;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px;resize:none;box-sizing:border-box"></textarea>
    <div style="display:flex;justify-content:flex-end;gap:6px">
      <button id="arabic-annotator-cancel" style="padding:4px 10px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px">إلغاء</button>
      <button id="arabic-annotator-save" style="padding:4px 10px;background:#1976d2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">حفظ</button>
    </div>
  `;

  document.body.appendChild(box);
  box.querySelector("#arabic-annotator-cancel").addEventListener("click", removeAnnotatorBox);
  box.querySelector("#arabic-annotator-save").addEventListener("click", () => {
    const noteText = box.querySelector("#arabic-annotator-note").value.trim();
    handleSaveAnnotation(selectedText, range, entities, noteText);
  });
}

function removeAnnotatorBox() {
  document.getElementById("arabic-annotator-box")?.remove();
}

async function handleSaveAnnotation(selectedText, range, entities, noteText) {
  try {
    const textNodes = getPageTextNodes();
    const pageText = textNodes.map((node) => node.nodeValue).join("");
    const offsets = getRangePageOffsets(range, textNodes);
    const selectedAtOffsets = pageText.slice(offsets.start, offsets.end);

    if (selectedAtOffsets !== selectedText) {
      console.error("Selected text does not match page offsets.");
      return;
    }

    const context = getSurroundingContext(pageText, offsets.start, offsets.end);
    const annotation = {
      id: `anno_${Date.now()}`,
      user_id: null,
      page_url: cleanPageUrl(),
      selected_text: selectedText,
      prefix: context.prefix,
      suffix: context.suffix,
      start_offset: offsets.start,
      end_offset: offsets.end,
      created_at: new Date().toISOString(),
      entities,
      note: noteText || null
    };

    const response = await send({ type: "SAVE_ANNOTATION", annotation });
    if (!response.ok) {
      console.error("Failed to save annotation:", response.error);
      return;
    }

    applyHighlightToRange(range, response.data);
    removeAnnotatorBox();
  } catch (error) {
    console.error("Error saving annotation:", error);
  }
}

function applyHighlightToRange(range, annotationData) {
  try {
    const mark = document.createElement("mark");
    mark.className = "arabic-annotator-highlight";
    mark.dataset.annotationId = annotationData.id;
    mark.style.backgroundColor = "#fff59d";
    mark.style.color = "inherit";
    mark.style.padding = "2px 0";
    mark.style.borderRadius = "3px";
    mark.style.cursor = "pointer";
    range.surroundContents(mark);
  } catch (error) {
    console.warn("Could not apply highlight to selected range:", error);
  }
}

const ENTITY_TYPE_LABELS = {
  person: "شخص",
  city: "مدينة",
  country: "دولة",
  university: "جامعة",
  organization: "منظمة"
};

let activeHoverMark = null;

function entityTypeLabel(type) {
  return ENTITY_TYPE_LABELS[type] || type;
}

function scheduleHoverCardRemoval() {
  clearTimeout(hoverCardTimeout);
  hoverCardTimeout = setTimeout(() => {
    const card = document.getElementById("arabic-annotator-hover-card");
    if (activeHoverMark?.matches(":hover") || card?.matches(":hover")) return;
    removeHoverCard();
  }, 350);
}

document.addEventListener("mouseover", (event) => {
  const mark = event.target.closest(".arabic-annotator-highlight");
  if (!mark) return;
  if (activeHoverMark === mark && document.getElementById("arabic-annotator-hover-card")) return;
  activeHoverMark = mark;
  showHoverCard(mark);
});

document.addEventListener("mouseout", (event) => {
  const mark = event.target.closest(".arabic-annotator-highlight");
  if (mark && !mark.contains(event.relatedTarget)) scheduleHoverCardRemoval();
});

async function showHoverCard(mark) {
  clearTimeout(hoverCardTimeout);
  removeHoverCard();

  const annotationId = mark.dataset.annotationId;
  const response = await send({ type: "GET_ANNOTATIONS", page_url: cleanPageUrl() });
  if (!response.ok || !Array.isArray(response.data)) return;

  const annotation = response.data.find((item) => item.id === annotationId);
  if (!annotation) return;

  const rect = mark.getBoundingClientRect();
  const card = document.createElement("div");
  card.id = "arabic-annotator-hover-card";
  card.className = "arabic-annotator-hover-card";
  card.style.top = `${rect.bottom + window.scrollY + 6}px`;
  card.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;

  renderHoverCard(card, annotation);
  document.body.appendChild(card);

  card.addEventListener("mouseenter", () => clearTimeout(hoverCardTimeout));
  card.addEventListener("mouseleave", scheduleHoverCardRemoval);
}

function renderHoverCard(card, annotation) {
  const entities = Array.isArray(annotation.entities) ? annotation.entities : [];
  const notes = Array.isArray(annotation.notes) ? annotation.notes : [];

  const entitiesHtml = entities.length
    ? `<div class="arabic-annotator-section">
         <div class="arabic-annotator-section-title">التصنيف</div>
         <div class="arabic-annotator-entities">
           ${entities.map((entity) => `
             <span class="arabic-annotator-entity">
               <span>${escapeHtml(entity.text)}</span>
               <small>${escapeHtml(entityTypeLabel(entity.type))}</small>
             </span>
           `).join("")}
         </div>
       </div>`
    : `<div class="arabic-annotator-section">
         <div class="arabic-annotator-section-title">التصنيف</div>
         <div class="arabic-annotator-empty">لا توجد كيانات مصنفة</div>
       </div>`;

  const notesHtml = notes.length
    ? notes.map((note) => `
        <div class="arabic-annotator-note-row" data-note-id="${escapeHtml(note.id)}">
          <div class="arabic-annotator-note-text">${escapeHtml(note.text)}</div>
          <div class="arabic-annotator-note-actions">
            <button type="button" class="arabic-annotator-edit-note" data-note-id="${escapeHtml(note.id)}">تعديل</button>
            <button type="button" class="arabic-annotator-delete-note" data-note-id="${escapeHtml(note.id)}">حذف</button>
          </div>
        </div>
      `).join("")
    : '<div class="arabic-annotator-empty">لا توجد ملاحظات لهذه الجملة</div>';

  card.innerHTML = `
    <div class="arabic-annotator-card-title">الجملة المحفوظة</div>
    ${entitiesHtml}
    <div class="arabic-annotator-section">
      <div class="arabic-annotator-section-title">الملاحظات</div>
      <div class="arabic-annotator-notes">${notesHtml}</div>
      <div id="arabic-annotator-note-form"></div>
      <button type="button" id="arabic-annotator-add-note" class="arabic-annotator-primary-button">＋ إضافة ملاحظة</button>
    </div>
    <div class="arabic-annotator-card-footer">
      <button type="button" id="arabic-annotator-delete-ann" class="arabic-annotator-danger-button">حذف الجملة</button>
    </div>
  `;

  card.querySelectorAll(".arabic-annotator-edit-note").forEach((button) => {
    button.addEventListener("click", () => {
      const note = notes.find((item) => String(item.id) === String(button.dataset.noteId));
      if (note) showNoteForm(card, annotation, "edit", note);
    });
  });

  card.querySelectorAll(".arabic-annotator-delete-note").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await send({ type: "DELETE_NOTE", id: Number(button.dataset.noteId) });
      if (!response.ok) {
        console.error("Failed to delete note:", response.error);
        return;
      }
      await refreshHoverCard(annotation.id);
    });
  });

  card.querySelector("#arabic-annotator-add-note").addEventListener("click", () => {
    showNoteForm(card, annotation, "add");
  });

  card.querySelector("#arabic-annotator-delete-ann").addEventListener("click", async () => {
    const response = await send({ type: "DELETE_ANNOTATION", id: annotation.id });
    if (!response.ok) {
      console.error("Failed to delete annotation:", response.error);
      return;
    }
    if (activeHoverMark) activeHoverMark.replaceWith(document.createTextNode(activeHoverMark.textContent));
    activeHoverMark = null;
    removeHoverCard();
  });
}

function showNoteForm(card, annotation, mode, note = null) {
  const formHost = card.querySelector("#arabic-annotator-note-form");
  if (!formHost) return;

  const isEdit = mode === "edit";
  formHost.innerHTML = `
    <div class="arabic-annotator-note-form">
      <textarea class="arabic-annotator-note-input" maxlength="2000" placeholder="اكتب الملاحظة...">${isEdit ? escapeHtml(note.text) : ""}</textarea>
      <div class="arabic-annotator-form-actions">
        <button type="button" class="arabic-annotator-cancel-note">إلغاء</button>
        <button type="button" class="arabic-annotator-save-note">${isEdit ? "حفظ التعديل" : "حفظ الملاحظة"}</button>
      </div>
    </div>
  `;

  const input = formHost.querySelector(".arabic-annotator-note-input");
  input.focus();

  formHost.querySelector(".arabic-annotator-cancel-note").addEventListener("click", () => {
    formHost.innerHTML = "";
  });

  formHost.querySelector(".arabic-annotator-save-note").addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    const response = isEdit
      ? await send({ type: "UPDATE_NOTE", id: Number(note.id), text })
      : await send({ type: "ADD_NOTE", annotation_id: annotation.id, text });

    if (!response.ok) {
      console.error(`Failed to ${isEdit ? "update" : "add"} note:`, response.error);
      return;
    }

    await refreshHoverCard(annotation.id);
  });
}

async function refreshHoverCard(annotationId) {
  const response = await send({ type: "GET_ANNOTATIONS", page_url: cleanPageUrl() });
  if (!response.ok || !Array.isArray(response.data)) return;
  const annotation = response.data.find((item) => item.id === annotationId);
  const card = document.getElementById("arabic-annotator-hover-card");
  if (annotation && card) renderHoverCard(card, annotation);
}

function removeHoverCard() {
  document.getElementById("arabic-annotator-hover-card")?.remove();
}

function findRangeForOffsets(textNodes, startOffset, endOffset) {
  let total = 0;
  let startPoint = null;
  let endPoint = null;

  for (const node of textNodes) {
    const length = node.nodeValue.length;
    const nextTotal = total + length;

    if (startPoint === null && startOffset >= total && startOffset <= nextTotal) {
      startPoint = { node, offset: startOffset - total };
    }
    if (endPoint === null && endOffset >= total && endOffset <= nextTotal) {
      endPoint = { node, offset: endOffset - total };
      if (startPoint) break;
    }

    total = nextTotal;
  }

  if (!startPoint || !endPoint) return null;

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function findFallbackRange(annotation, pageText, textNodes) {
  let from = 0;
  while (true) {
    const index = pageText.indexOf(annotation.selected_text, from);
    if (index === -1) return null;

    const prefixMatches = pageText.slice(Math.max(0, index - annotation.prefix.length), index) === annotation.prefix;
    const suffixMatches = pageText.slice(index + annotation.selected_text.length, index + annotation.selected_text.length + annotation.suffix.length) === annotation.suffix;

    if (prefixMatches && suffixMatches) {
      return findRangeForOffsets(textNodes, index, index + annotation.selected_text.length);
    }

    from = index + 1;
  }
}

function restoreSingleAnnotation(annotation) {
  const textNodes = getPageTextNodes();
  const pageText = textNodes.map((node) => node.nodeValue).join("");
  let range = null;

  if (
    Number.isInteger(annotation.start_offset) &&
    Number.isInteger(annotation.end_offset) &&
    pageText.slice(annotation.start_offset, annotation.end_offset) === annotation.selected_text
  ) {
    range = findRangeForOffsets(textNodes, annotation.start_offset, annotation.end_offset);
  }

  if (!range) {
    range = findFallbackRange(annotation, pageText, textNodes);
  }

  if (range) applyHighlightToRange(range, annotation);
}

async function restorePageAnnotations() {
  if (!enabled) return;

  try {
    const response = await send({ type: "GET_ANNOTATIONS", page_url: cleanPageUrl() });
    if (response.ok && Array.isArray(response.data)) {
      response.data.forEach(restoreSingleAnnotation);
    }
  } catch (error) {
    console.error("Error restoring annotations:", error);
  }
}

refreshEnabledState();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", restorePageAnnotations, { once: true });
} else {
  restorePageAnnotations();
}
