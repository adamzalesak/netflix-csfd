// Všechny Netflix DOM selektory na jednom místě.
// Když Netflix změní DOM, mění se jen tento soubor + extract-title.ts.

export const SELECTORS = {
  // grid tile (browse, kategorie, "moje seznam")
  tile: '.title-card-container, [data-uia*="title-card"], .slider-item .title-card',

  // hover preview ("Bob card") — velký panel co vyjede z tile při hover
  bobCard: '.bob-card, [data-uia="bob-card"]',

  // detail modal (po kliknutí)
  detailModal: '.detail-modal, [data-uia="modal"], .previewModal',

  // search results
  searchResult: '.search-result-card, [data-uia*="search-result"]',
} as const;

export const TITLE_SOURCES = {
  // grid: title je v aria-label nebo alt obrázku
  tile: ['[aria-label]', 'img[alt]'],
  // bob card: hlavička
  bobCard: ['.bob-title', '.previewModal--player_title h3', 'h3'],
  detailModal: ['.previewModal--player_container h3', 'h3.title-title', 'h3'],
  searchResult: ['[aria-label]', 'h3'],
} as const;

export const META_SOURCES = {
  // year + délka v meta řádku
  bobCard: ['.bob-overview-meta', '[data-uia="overview-meta"]'],
  detailModal: ['.previewModal--detailsMetadata', '.about-container'],
} as const;
