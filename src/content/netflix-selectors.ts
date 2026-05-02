// Všechny Netflix DOM selektory na jednom místě.
// Když Netflix změní DOM, mění se jen tento soubor + extract-title.ts.

export const SELECTORS = {
  // grid tile (browse, kategorie, "moje seznam")
  tile: '.title-card-container, [data-uia*="title-card"], .slider-item .title-card',

  // hover preview ("mini modal") — velký panel co vyjede z tile při hover
  bobCard: '[data-uia="modal-motion-container-MINI_MODAL"]',

  // detail modal (po kliknutí)
  detailModal: '[data-uia="modal-motion-container-DETAIL_MODAL"]',

  // search results
  searchResult: '.search-result-card, [data-uia*="search-result"]',

  // billboard (hlavní propagovaný film nahoře na browse)
  billboard: '.billboard, [data-uia="billboard-row"]',
} as const;

export const TITLE_SOURCES = {
  // grid: title je v aria-label nebo alt obrázku
  tile: ['[aria-label]', 'img[alt]'],
  // bob card: hlavička
  bobCard: ['.bob-title', '.previewModal--player_title h3', 'h3'],
  detailModal: ['.previewModal--player_container h3', 'h3.title-title', 'h3'],
  searchResult: ['[aria-label]', 'h3'],
  // billboard: title je obrázek (logo) s alt atributem
  billboard: ['[data-uia="billboard-title"] img', '.billboard-title img', '.billboard-title'],
} as const;

export const META_SOURCES = {
  // year + délka v meta řádku
  bobCard: ['.bob-overview-meta', '[data-uia="overview-meta"]'],
  detailModal: ['.previewModal--detailsMetadata', '.about-container'],
} as const;
