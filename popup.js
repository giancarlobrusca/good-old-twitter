document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggleMedia");
  const loading = document.querySelector(".loading");
  const error = document.querySelector(".error");

  loading.style.display = "block";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      loading.style.display = "none";
      error.textContent = "No active tab found.";
      error.style.display = "block";
      return;
    }

    chrome.tabs.sendMessage(tabId, { action: "getState" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.storage.sync.get(["goodOldTwitterEnabled"], (result) => {
          const isEnabled = result.goodOldTwitterEnabled !== false;
          toggle.checked = isEnabled;
          loading.style.display = "none";
        });
        return;
      }
      toggle.checked = !!response.enabled;
      loading.style.display = "none";
    });

    toggle.addEventListener("change", () => {
      chrome.tabs.sendMessage(tabId, { action: "toggle" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          error.textContent = "Error: Could not communicate with extension.";
          error.style.display = "block";
          return;
        }
        toggle.checked = response.enabled;
      });
    });
  });
});
