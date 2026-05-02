const ENABLED_KEY = "settings:enabled";

async function getEnabled(): Promise<boolean> {
  const got = await chrome.storage.local.get(ENABLED_KEY);
  return got[ENABLED_KEY] !== false;
}

async function setEnabled(v: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: v });
}

const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

async function refresh(): Promise<void> {
  const on = await getEnabled();
  toggleBtn.textContent = on ? "Zapnuto — kliknutím vypnout" : "Vypnuto — kliknutím zapnout";
}

toggleBtn.addEventListener("click", async () => {
  await setEnabled(!(await getEnabled()));
  await refresh();
  statusEl.textContent = "Reloadni Netflix tab.";
});

clearBtn.addEventListener("click", async () => {
  statusEl.textContent = "Mažu…";
  await chrome.runtime.sendMessage({ type: "clear-cache" });
  statusEl.textContent = "Cache vymazána.";
});

void refresh();
