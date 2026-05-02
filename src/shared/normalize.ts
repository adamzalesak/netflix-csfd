export function normalizeTitle(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")           // strip diacritics
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")           // strip "(anything)" — year, "(Netflix verze)", "(TV seriál)" etc.
    .replace(/\s+(season|series)\s+\d+\b/gi, "") // strip "Season N" / "Series N"
    .replace(/[^\w\s]/g, " ")                   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}
