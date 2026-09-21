// ===== 1) Activation and Deactivation Button =====
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

// ===== 2) List of notes for the current page =====
const list = document.getElementById("list");
const empty = document.getElementById("empty");

// It renders the list from the array of notes.
function render(annotations) {
  list.innerHTML = "";                    // clear the old list.
  empty.hidden = annotations.length > 0;  // hide the "no notes" message if there are notes.

  for (const a of annotations) {
    const li = document.createElement("li");
    //get the selected text and the annotation and display them in the list.
    li.textContent = a.selected_text + " : " + a.annotation;

    const btn = document.createElement("button");
    btn.textContent = "حذف";
    btn.addEventListener("click", () => deleteAnnotation(a.id));
    li.appendChild(btn);

    list.appendChild(li);
  }
}

// It fetches the saved annotations and displays only those for the current page.
async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { annotations } = await chrome.storage.local.get({ annotations: [] });
  render(annotations.filter((a) => a.page_url === tab.url));
}

// It deletes an annotation by its ID and updates the list.
async function deleteAnnotation(id) {
  const { annotations } = await chrome.storage.local.get({ annotations: [] });
  await chrome.storage.local.set({
    annotations: annotations.filter((a) => a.id !== id),
  });
  refresh();
}

refresh();