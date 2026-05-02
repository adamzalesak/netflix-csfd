import { TITLE_SOURCES, META_SOURCES } from "./netflix-selectors";

export type Extracted = {
  title: string | null;
  year: number | null;
};

function firstText(root: HTMLElement, selectors: readonly string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    if (sel === "[aria-label]") {
      const v = el.getAttribute("aria-label");
      if (v?.trim()) return v.trim();
    } else if (sel === "img[alt]") {
      const v = el.getAttribute("alt");
      if (v?.trim()) return v.trim();
    } else {
      const v = el.textContent?.trim();
      if (v) return v;
    }
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
