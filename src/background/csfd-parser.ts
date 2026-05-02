const CSFD_BASE = "https://www.csfd.cz";

export type SearchCandidate = {
  title: string;
  year: number | null;
  url: string;
};

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
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
