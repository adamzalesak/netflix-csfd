export function normalizeTitle(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")           // strip diacritics
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*/g, " ")           // strip "(2010)"
    .replace(/\s+(season|series)\s+\d+\b/gi, "") // strip "Season N" / "Series N"
    .replace(/[^\w\s]/g, " ")                   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}
