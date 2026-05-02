import { SELECTORS } from "./netflix-selectors";
import { extractFromTile, extractFromBillboard } from "./extract-title";
import { renderSmallBadge, renderLargeBadge } from "./badge";
import { lookup } from "./lookup-client";

const PROCESSED = new WeakSet<HTMLElement>();

// Modern Netflix hover preview ("MINI_MODAL") a detail modal nezobrazují
// název filmu uvnitř. Trackujeme poslední hover (pro bob card) a poslední
// click (pro detail modal — to je nejsilnější signál, co uživatel vybral).
let lastHover: { title: string; year: number | null } | null = null;
let lastClick: { title: string; year: number | null; at: number } | null = null;

document.addEventListener("mouseover", (ev) => {
  const target = ev.target as HTMLElement | null;
  if (!target?.closest) return;
  const tile = target.closest(SELECTORS.tile) as HTMLElement | null;
  if (!tile) return;
  // Tile uvnitř bob/detail modalu = doporučení / epizoda — nepřepíše lastHover.
  if (tile.closest(SELECTORS.bobCard) || tile.closest(SELECTORS.detailModal)) return;
  const { title } = extractFromTile(tile);
  if (title) lastHover = { title, year: null };
}, true);

document.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement | null;
  if (!target?.closest) return;
  const tile = target.closest(SELECTORS.tile) as HTMLElement | null;
  if (tile) {
    const { title } = extractFromTile(tile);
    if (title) lastClick = { title, year: null, at: Date.now() };
    return;
  }
  // Click v billboardu (např. "Další informace") — použij billboard title.
  const billboard = target.closest(SELECTORS.billboard) as HTMLElement | null;
  if (billboard) {
    const { title } = extractFromBillboard(billboard);
    if (title) lastClick = { title, year: null, at: Date.now() };
    return;
  }
  // Click v mini-modalu mimo tile (šipka "Zobrazit informace") → promote lastHover.
  if (target.closest(SELECTORS.bobCard) && lastHover) {
    lastClick = { ...lastHover, at: Date.now() };
  }
}, true);

// Fallback pro přímý vstup přes URL (např. /title/<id>) kdy není click/hover —
// vytáhni název z document.title.
function titleFromPage(): { title: string; year: number | null } | null {
  if (!location.pathname.startsWith("/title/")) return null;
  const t = document.title.trim();
  if (!t) return null;
  const cleaned = t.replace(/\s*[|\-–]\s*Netflix.*$/i, "").trim();
  return cleaned ? { title: cleaned, year: null } : null;
}

async function processTile(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title } = extractFromTile(el);
  if (!title) return;
  PROCESSED.add(el);
  renderSmallBadge(el, { kind: "loading" });
  const result = await lookup(title, null);
  renderSmallBadge(el, { kind: "result", result });
}

// Modal elements are recyklované Netflixem — místo PROCESSED dedup po
// elementu používáme dedup po (element, title) páru.
const lastTitleByElement = new WeakMap<HTMLElement, string>();

async function processBobCard(el: HTMLElement): Promise<void> {
  if (!lastHover) return;
  const { title, year } = lastHover;
  if (lastTitleByElement.get(el) === title) return;
  lastTitleByElement.set(el, title);
  renderLargeBadge(el, { kind: "loading" });
  const result = await lookup(title, year);
  if (lastTitleByElement.get(el) !== title) return;
  renderLargeBadge(el, { kind: "result", result });
}

const BILLBOARD_PLACE_AFTER =
  '.synopsis-fade-container, .info-wrapper-fade, .titleWrapper';

async function processBillboard(el: HTMLElement): Promise<void> {
  const { title } = extractFromBillboard(el);
  if (!title) return;
  if (lastTitleByElement.get(el) === title) return;
  lastTitleByElement.set(el, title);
  renderLargeBadge(el, { kind: "loading" }, BILLBOARD_PLACE_AFTER);
  const result = await lookup(title, null);
  if (lastTitleByElement.get(el) !== title) return;
  renderLargeBadge(el, { kind: "result", result }, BILLBOARD_PLACE_AFTER);
}

async function processDetailModal(el: HTMLElement): Promise<void> {
  const click = lastClick && Date.now() - lastClick.at < 10_000 ? lastClick : null;
  const source = click ?? lastHover ?? titleFromPage();
  if (!source) return;
  const { title, year } = source;
  if (lastTitleByElement.get(el) === title) return;
  lastTitleByElement.set(el, title);
  renderLargeBadge(el, { kind: "loading" });
  const result = await lookup(title, year);
  if (lastTitleByElement.get(el) !== title) return;
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
  const billboards = outermost(queryAll(root, SELECTORS.billboard));
  for (const el of tiles) void processTile(el);
  for (const el of bobs) void processBobCard(el);
  for (const el of modals) void processDetailModal(el);
  for (const el of billboards) void processBillboard(el);
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
