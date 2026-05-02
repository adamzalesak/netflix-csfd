import { TITLE_SOURCES, META_SOURCES } from "./netflix-selectors";

export type Extracted = {
  title: string | null;
  year: number | null;
};

function textOf(el: Element): string | null {
  if (el.tagName === "IMG") {
    const v = el.getAttribute("alt") ?? el.getAttribute("title");
    if (v?.trim()) return v.trim();
  }
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const tc = el.textContent?.trim();
  return tc || null;
}

function firstText(root: HTMLElement, selectors: readonly string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const t = textOf(el);
    if (t) return t;
  }
  return null;
}

function findYear(root: HTMLElement, selectors: readonly string[]): number | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    // Iterate descendants so adjacent spans like <span>2010</span><span>148 min</span>
    // don't get concatenated into "2010148" before regex matching.
    const candidates: string[] = [];
    candidates.push(el.textContent ?? "");
    for (const child of Array.from(el.querySelectorAll("*"))) {
      candidates.push(child.textContent ?? "");
    }
    for (const text of candidates) {
      const match = text.match(/\b(19|20)\d{2}\b/);
      if (match) return Number(match[0]);
    }
  }
  return null;
}

export function extractFromTile(el: HTMLElement): Extracted {
  return { title: firstText(el, TITLE_SOURCES.tile), year: null };
}

export function extractFromBillboard(el: HTMLElement): Extracted {
  return { title: firstText(el, TITLE_SOURCES.billboard), year: null };
}

export function extractFromBobCard(el: HTMLElement): Extracted {
  return {
    title: firstText(el, TITLE_SOURCES.bobCard),
    year: findYear(el, META_SOURCES.bobCard),
  };
}

export function extractFromDetailModal(el: HTMLElement): Extracted {
  return {
    title: firstText(el, TITLE_SOURCES.detailModal),
    year: findYear(el, META_SOURCES.detailModal),
  };
}
