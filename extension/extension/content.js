chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  console.log("[Annotator] content script loaded. enabled =", enabled);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    console.log("[Annotator] enabled changed to", changes.enabled.newValue);
  }
});
