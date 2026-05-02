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

export function parseSearchResults(html: string): SearchCandidate[] {
  const doc = parseHtml(html);
  const articles = doc.querySelectorAll(
    "section.main-movies article, section.main-films article"
  );
  const results: SearchCandidate[] = [];
  for (const a of Array.from(articles)) {
    const link = a.querySelector("a.film-title-name, h3 a");
    if (!link) continue;
    const href = link.getAttribute("href") ?? "";
    const title = link.textContent?.trim() ?? "";
    if (!title || !href) continue;
    const yearText =
      a.querySelector(".film-title-info .info")?.textContent ??
      a.querySelector(".film-origins-genres span")?.textContent ??
      "";
    const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : null;
    const url = href.startsWith("http") ? href : CSFD_BASE + href;
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

export function parseDetailPage(html: string): DetailData | null {
  const doc = parseHtml(html);
  const ratingText =
    doc.querySelector(".film-rating-average")?.textContent ??
    doc.querySelector(".rating-average")?.textContent ?? "";
  const rating = parseIntCleanly(ratingText);
  if (rating == null) return null;

  const votesText =
    doc.querySelector(".rating-total a")?.textContent ??
    doc.querySelector(".rating-total")?.textContent ?? "";
  const votes = parseIntCleanly(votesText) ?? 0;

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
