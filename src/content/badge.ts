import type { CSFDResult } from "../shared/types";

const BADGE_ATTR = "data-csfd-badge";
const SMALL_VALUE = "1";
const LARGE_VALUE = "large";

const SMALL_STYLES = `
  :host { all: initial; position: absolute; top: 6px; right: 6px; z-index: 9999;
          pointer-events: none; font-family: system-ui, sans-serif; }
  .badge { background: rgba(186, 3, 5, 0.92); color: white; font-weight: 700;
           font-size: 12px; padding: 3px 6px; border-radius: 12px;
           min-width: 28px; height: 18px; box-sizing: content-box;
           display: inline-flex; align-items: center; justify-content: center;
           box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .badge.unknown { background: rgba(80,80,80,0.85); }
  .badge.loading { background: rgba(50,50,50,0.85); padding: 3px; min-width: 22px; }
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.25);
             border-top-color: #fff; border-radius: 50%;
             animation: csfd-spin 0.8s linear infinite; }
  @keyframes csfd-spin { to { transform: rotate(360deg); } }
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
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.25);
             border-top-color: #fff; border-radius: 50%;
             animation: csfd-spin 0.8s linear infinite; }
  @keyframes csfd-spin { to { transform: rotate(360deg); } }
`;

export type SmallBadgeState =
  | { kind: "loading" }
  | { kind: "result"; result: CSFDResult | null };

export type LargeBadgeState =
  | { kind: "loading" }
  | { kind: "result"; result: CSFDResult | null };

type Host = { host: HTMLDivElement; root: ShadowRoot };

function getOrCreateHost(parent: HTMLElement, value: string): Host {
  const existing = parent.querySelectorAll<HTMLDivElement>(`[${BADGE_ATTR}="${value}"]`);
  if (existing.length > 0) {
    for (let i = 1; i < existing.length; i++) existing[i]!.remove();
    const host = existing[0]!;
    return { host, root: host.shadowRoot! };
  }
  const host = document.createElement("div");
  host.setAttribute(BADGE_ATTR, value);
  parent.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  return { host, root };
}

export function renderSmallBadge(parent: HTMLElement, state: SmallBadgeState): void {
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const { root } = getOrCreateHost(parent, SMALL_VALUE);
  let body: string;
  if (state.kind === "loading") {
    body = `<div class="badge loading"><div class="spinner"></div></div>`;
  } else if (state.result) {
    body = `<div class="badge">${state.result.rating}%</div>`;
  } else {
    body = `<div class="badge unknown">?</div>`;
  }
  root.innerHTML = `<style>${SMALL_STYLES}</style>${body}`;
}

export function renderLargeBadge(parent: HTMLElement, state: LargeBadgeState): void {
  const { root } = getOrCreateHost(parent, LARGE_VALUE);
  let body: string;
  if (state.kind === "loading") {
    body = `<div class="row meta"><div class="spinner"></div><span>ČSFD: načítám…</span></div>`;
  } else if (!state.result) {
    body = `<div class="row meta">ČSFD: nenalezeno</div>`;
  } else {
    const r = state.result;
    const genres = r.genres.join(", ");
    const votes = r.votes.toLocaleString("cs-CZ");
    body =
      `<div class="row">` +
      `<span class="pct">${r.rating} % ČSFD</span>` +
      `<span class="meta">${votes} hodnocení</span>` +
      (genres ? `<span class="meta">${genres}</span>` : "") +
      `<span class="meta">orig.: ${r.origTitle}</span>` +
      `<a href="${r.csfdUrl}" target="_blank" rel="noopener">Otevřít na ČSFD ↗</a>` +
      `</div>`;
  }
  root.innerHTML = `<style>${LARGE_STYLES}</style>${body}`;
}

export function hasBadge(el: HTMLElement): boolean {
  return el.querySelector(`[${BADGE_ATTR}]`) != null;
}
