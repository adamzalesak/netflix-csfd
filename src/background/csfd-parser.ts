import { parse, type HTMLElement as NHParseElement } from "node-html-parser";

const CSFD_BASE = "https://www.csfd.cz";

export type SearchCandidate = {
  title: string;
  year: number | null;
  url: string;
};

function parseHtml(html: string): NHParseElement {
  return parse(html);
}

function findYearInAncestors(el: NHParseElement, maxLevels: number = 5): number | null {
  let cur: NHParseElement | null = el.parentNode as NHParseElement | null;
  for (let i = 0; i < maxLevels && cur; i++) {
    const text = cur.textContent ?? "";
    const m = text.match(/\b(19|20)\d{2}\b/);
    if (m) return Number(m[0]);
    cur = cur.parentNode as NHParseElement | null;
  }
  return null;
}

export function parseSearchResults(html: string): SearchCandidate[] {
  const doc = parseHtml(html);
  const links = doc.querySelectorAll("a.film-title-name");
  const results: SearchCandidate[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("/film/")) continue;
    const title = (link.textContent ?? "").trim();
    if (!title || seen.has(href)) continue;
    seen.add(href);
    const year = findYearInAncestors(link);
    const url = CSFD_BASE + href;
    results.push({ title, year, url });
  }
  return results;
}

export type DetailData = {
  rating: number;
  votes: number;
  origTitle: string;
  year: number;
  genres: string[];
};

function parseIntCleanly(text: string): number | null {
  const m = text.replace(/\s+/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

function extractVotes(html: string, doc: NHParseElement): number {
  // 1. Reálná CSFD struktura:
  //    <div class="ratings-list">
  //      <h2>Hodnocení <span class="counter">(20&nbsp;795)</span></h2>
  const selectors = [
    ".ratings-list .counter",
    ".ratings-list h2 .counter",
    ".rating-total strong",
    ".rating-total a",
    ".rating-total",
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const n = parseIntCleanly(el.textContent ?? "");
      if (n != null && n > 0) return n;
    }
  }
  // 2. Schema.org SEO fallback
  const schema = doc.querySelector('[itemprop="ratingCount"]');
  if (schema) {
    const t = schema.getAttribute("content") ?? schema.textContent ?? "";
    const n = parseIntCleanly(t);
    if (n != null && n > 0) return n;
  }
  return 0;
}

export function parseDetailPage(html: string): DetailData | null {
  const doc = parseHtml(html);
  const ratingText =
    doc.querySelector(".film-rating-average")?.textContent ??
    doc.querySelector(".rating-average")?.textContent ?? "";
  const rating = parseIntCleanly(ratingText);
  if (rating == null) return null;

  const votes = extractVotes(html, doc);

  const origTitle =
    doc.querySelector(".film-names .en h3, .film-names li.en h3")?.textContent?.trim() ??
    doc.querySelector(".film-header-name h1")?.textContent?.trim() ?? "";

  const yearText =
    doc.querySelector(".origin [itemprop='dateCreated']")?.textContent ??
    doc.querySelector(".origin")?.textContent ?? "";
  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : 0;

  const genresText = doc.querySelector(".genres")?.textContent ?? "";
  const genres = genresText
    .split("/")
    .map(g => g.trim())
    .filter(Boolean);

  return { rating, votes, origTitle, year, genres };
}
