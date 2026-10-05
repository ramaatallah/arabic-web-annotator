document.addEventListener('DOMContentLoaded', () => {
  const toggleInput = document.getElementById('toggle-enable');

  // Load enabled state from chrome storage
  chrome.storage.local.get(['enabled'], (result) => {
    toggleInput.checked = result.enabled !== false; // Default to true if undefined
  });

  // Save state on change
  toggleInput.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: toggleInput.checked });
  });
});

