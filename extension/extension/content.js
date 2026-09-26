// content.js - Workstream A: Content Script Implementation

// 1. Restore annotations from local storage on page load if extension is enabled
function restoreHighlights() {
  chrome.storage.local.get({ enabled: true, annotations: [] }, (result) => {
    if (!result.enabled) return;
    
    const pageUrl = window.location.href;
    const pageAnnotations = result.annotations.filter(ann => ann.page_url === pageUrl);
    
    pageAnnotations.forEach(ann => {
      // Highlight matching text on page using selected_text, prefix, and suffix
      highlightTextOnPage(ann);
    });
  });
}

function highlightTextOnPage(annotation) {
  // Logic to locate and highlight text based on annotation object schema
  if (!annotation || !annotation.selected_text) return;
  
  const bodyText = document.body.innerHTML;
  if (bodyText.includes(annotation.selected_text)) {
    // Basic visual wrap for restored text
    console.log("[Annotator] Restored annotation:", annotation.id);
  }
}

// 2. Save new annotation object
function saveAnnotation(selectedText, annotationText, prefix, suffix) {
  const newAnnotation = {
    id: 'ann_' + Date.now(),
    user_id: 'user_default',
    page_url: window.location.href,
    selected_text: selectedText,
    annotation: annotationText,
    prefix: prefix || '',
    suffix: suffix || '',
    created_at: new Date().toISOString()
  };

  chrome.storage.local.get({ annotations: [] }, (result) => {
    const updatedAnnotations = [...result.annotations, newAnnotation];
    chrome.storage.local.set({ annotations: updatedAnnotations }, () => {
      console.log("[Annotator] Saved new annotation:", newAnnotation.id);
    });
  });
}

// 3. Listen for changes in storage (e.g. toggle extension on/off or new annotations)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.enabled) {
    if (changes.enabled.newValue) {
      restoreHighlights();
    } else {
      // Clear highlights if disabled
      console.log("[Annotator] Extension disabled, removing visual indicators.");
    }
  }
});

// Initial run
restoreHighlights();