document.addEventListener('DOMContentLoaded', () => {
  // Matched ID with enableToggle in popup.html
  const toggleInput = document.getElementById('enableToggle'); 
  const highlightsList = document.getElementById('highlightsList');

  // Load enabled state and stored highlights from chrome storage
  chrome.storage.local.get(['enabled', 'highlights'], (result) => {
    toggleInput.checked = result.enabled !== false; // Default to true

    displayHighlights(result.highlights || []);
  });

  // Save toggle state on change
  toggleInput.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: toggleInput.checked });
  });

  // Render highlights and notes
  function displayHighlights(highlights) {
    highlightsList.innerHTML = '';

    if (highlights.length === 0) {
      highlightsList.innerHTML = '<div class="empty-state">No saved highlights or notes found.</div>';
      return;
    }

    highlights.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'highlight-item';

      // Highlighted Text
      const textEl = document.createElement('div');
      textEl.className = 'highlight-text';
      textEl.textContent = typeof item === 'string' ? item : item.text;
      itemEl.appendChild(textEl);

      // Associated Note (if present)
      if (item.note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'highlight-note';
        noteEl.textContent = `Note: ${item.note}`;
        itemEl.appendChild(noteEl);
      }

      highlightsList.appendChild(itemEl);
    });
  }
});
