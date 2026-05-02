import { SELECTORS } from "./netflix-selectors";
import { extractFromTile, extractFromBobCard, extractFromDetailModal } from "./extract-title";
import { renderSmallBadge, renderLargeBadge, hasBadge } from "./badge";
import { lookup } from "./lookup-client";

const PROCESSED = new WeakSet<HTMLElement>();

async function processTile(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el) || hasBadge(el)) return;
  const { title } = extractFromTile(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, null);
  renderSmallBadge(el, result);
}

async function processBobCard(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title, year } = extractFromBobCard(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, year);
  renderLargeBadge(el, result);
}

async function processDetailModal(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title, year } = extractFromDetailModal(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, year);
  renderLargeBadge(el, result);
}

function scan(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.tile))) {
    void processTile(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.bobCard))) {
    void processBobCard(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.detailModal))) {
    void processDetailModal(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.searchResult))) {
    void processTile(el);  // search results = same shape as tile
  }
}

let pending: number | null = null;
function scheduleScan(): void {
  if (pending != null) return;
  pending = window.setTimeout(() => {
    pending = null;
    scan();
  }, 100);
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length === 0) continue;
    scheduleScan();
    return;
  }
});
observer.observe(document.body, { childList: true, subtree: true });

scan();
