const checkbox = document.getElementById("enabled");
const status = document.getElementById("status");

function showStatus(enabled) {
  status.textContent = enabled ? "التظليل مفعّل" : "التظليل متوقف";
}

chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  checkbox.checked = enabled;
  showStatus(enabled);
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: checkbox.checked });
  showStatus(checkbox.checked);
});
