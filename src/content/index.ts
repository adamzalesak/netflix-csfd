import { SELECTORS } from "./netflix-selectors";
import { extractFromTile, extractFromBobCard, extractFromDetailModal } from "./extract-title";
import { renderSmallBadge, renderLargeBadge } from "./badge";
import { lookup } from "./lookup-client";

const PROCESSED = new WeakSet<HTMLElement>();

// Modern Netflix hover preview ("MINI_MODAL") nezobrazuje název filmu.
// Trackujeme poslední tile, na kterém uživatel hoveroval, a jeho title
// použijeme jako fallback v processBobCard / processDetailModal.
let lastHover: { title: string; year: number | null } | null = null;

function trackHover(target: HTMLElement | null): void {
  if (!target?.closest) return;
  const tile = target.closest(SELECTORS.tile) as HTMLElement | null;
  if (!tile) return;
  // Tile uvnitř bob/detail modalu = doporučení / epizoda — ne to, co user
  // právě prohlíží na hlavní stránce. Nesmí přepsat lastHover.
  if (tile.closest(SELECTORS.bobCard) || tile.closest(SELECTORS.detailModal)) return;
  const { title } = extractFromTile(tile);
  if (title) lastHover = { title, year: null };
}

document.addEventListener("mouseover", (ev) => trackHover(ev.target as HTMLElement), true);
document.addEventListener("click", (ev) => trackHover(ev.target as HTMLElement), true);

async function processTile(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title } = extractFromTile(el);
  if (!title) return;
  PROCESSED.add(el);
  renderSmallBadge(el, { kind: "loading" });
  const result = await lookup(title, null);
  renderSmallBadge(el, { kind: "result", result });
}

async function processBobCard(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const fromModal = extractFromBobCard(el);
  const title = fromModal.title ?? lastHover?.title ?? null;
  const year = fromModal.year ?? lastHover?.year ?? null;
  if (!title) return;
  PROCESSED.add(el);
  renderLargeBadge(el, { kind: "loading" });
  const result = await lookup(title, year);
  renderLargeBadge(el, { kind: "result", result });
}

async function processDetailModal(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const fromModal = extractFromDetailModal(el);
  const title = fromModal.title ?? lastHover?.title ?? null;
  const year = fromModal.year ?? lastHover?.year ?? null;
  if (!title) return;
  PROCESSED.add(el);
  renderLargeBadge(el, { kind: "loading" });
  const result = await lookup(title, year);
  renderLargeBadge(el, { kind: "result", result });
}

function outermost(elements: HTMLElement[]): HTMLElement[] {
  const set = new Set(elements);
  return elements.filter(el => {
    let p = el.parentElement;
    while (p) {
      if (set.has(p)) return false;
      p = p.parentElement;
    }
    return true;
  });
}

function queryAll(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}


function scan(root: ParentNode = document): void {
  const tiles = outermost([
    ...queryAll(root, SELECTORS.tile),
    ...queryAll(root, SELECTORS.searchResult),
  ]);
  const bobs = outermost(queryAll(root, SELECTORS.bobCard));
  const modals = outermost(queryAll(root, SELECTORS.detailModal));
  console.log("[CSFD] scan:", { tiles: tiles.length, bobs: bobs.length, modals: modals.length });
  for (const el of tiles) void processTile(el);
  for (const el of bobs) void processBobCard(el);
  for (const el of modals) void processDetailModal(el);
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

async function isEnabled(): Promise<boolean> {
  const got = await chrome.storage.local.get("settings:enabled");
  return got["settings:enabled"] !== false;
}

(async () => {
  if (!(await isEnabled())) return;
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
