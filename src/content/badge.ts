import type { CSFDResult } from "../shared/types";

const BADGE_ATTR = "data-csfd-badge";

const SMALL_STYLES = `
  :host { all: initial; position: absolute; top: 6px; right: 6px; z-index: 9999;
          pointer-events: none; font-family: system-ui, sans-serif; }
  .badge { background: rgba(186, 3, 5, 0.92); color: white; font-weight: 700;
           font-size: 12px; padding: 3px 6px; border-radius: 12px;
           min-width: 28px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .badge.unknown { background: rgba(80,80,80,0.85); }
`;

const LARGE_STYLES = `
  :host { all: initial; display: block; margin: 8px 0;
          font-family: system-ui, sans-serif; color: #fff; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
         font-size: 14px; }
  .pct { background: #ba0305; color: #fff; padding: 4px 10px; border-radius: 4px;
         font-weight: 700; }
  .meta { color: rgba(255,255,255,0.85); }
  a { color: #fff; text-decoration: underline; }
`;

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.setAttribute(BADGE_ATTR, "1");
  return host;
}

export function renderSmallBadge(parent: HTMLElement, result: CSFDResult | null): void {
  if (parent.querySelector(`[${BADGE_ATTR}]`)) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const host = makeHost();
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${SMALL_STYLES}</style>` +
    (result
      ? `<div class="badge">${result.rating}%</div>`
      : `<div class="badge unknown">?</div>`);
  parent.appendChild(host);
}

export function renderLargeBadge(parent: HTMLElement, result: CSFDResult | null): void {
  if (parent.querySelector(`[${BADGE_ATTR}="large"]`)) return;
  const host = makeHost();
  host.setAttribute(BADGE_ATTR, "large");
  const root = host.attachShadow({ mode: "open" });
  if (!result) {
    root.innerHTML = `<style>${LARGE_STYLES}</style><div class="row meta">ČSFD: nenalezeno</div>`;
  } else {
    const genres = result.genres.join(", ");
    const votes = result.votes.toLocaleString("cs-CZ");
    root.innerHTML =
      `<style>${LARGE_STYLES}</style>` +
      `<div class="row">` +
      `<span class="pct">${result.rating} % ČSFD</span>` +
      `<span class="meta">${votes} hodnocení</span>` +
      (genres ? `<span class="meta">${genres}</span>` : "") +
      `<span class="meta">orig.: ${result.origTitle}</span>` +
      `<a href="${result.csfdUrl}" target="_blank" rel="noopener">Otevřít na ČSFD ↗</a>` +
      `</div>`;
  }
  parent.appendChild(host);
}

export function hasBadge(el: HTMLElement): boolean {
  return el.querySelector(`[${BADGE_ATTR}]`) != null;
}
