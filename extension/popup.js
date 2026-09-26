// setup the checkbox to enable/disable the extension
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

//using the background script to fetch annotations from the server
const list = document.getElementById("list");
const empty = document.getElementById("empty");

// render the list of annotations in the popup
function render(annotations) {
  list.innerHTML = "";
  empty.hidden = annotations.length > 0;

  for (const a of annotations) {
    const li = document.createElement("li");
    li.textContent = a.selected_text + " : " + a.annotation;

    const btn = document.createElement("button");
    btn.textContent = "حذف";
    btn.addEventListener("click", () => deleteAnnotation(a.id));
    li.appendChild(btn);

    list.appendChild(li);
  }
}

// refresh the list of annotations from the server
async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage(
    { type: "GET_ANNOTATIONS", page_url: tab.url },
    (response) => {
      if (!response || !response.ok) {
        empty.hidden = false;
        empty.textContent = "تعذر الاتصال بالسيرفر";
        list.innerHTML = "";
        console.error("[Annotator] Fetch failed:", response && response.error);
        return;
      }
      empty.textContent = "ما في ملاحظات بعد";
      render(response.data);
    }
  );
}

// delete annotation from the server via background.js
function deleteAnnotation(id) {
  chrome.runtime.sendMessage({ type: "DELETE_ANNOTATION", id }, (response) => {
    if (!response || !response.ok) {
      console.error("[Annotator] Delete failed:", response && response.error);
      return;
    }
    refresh();
  });
}

refresh();