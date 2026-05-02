# Netflix × ČSFD

Chrome rozšíření zobrazující hodnocení z [ČSFD](https://www.csfd.cz/) u filmů a seriálů na [Netflix](https://www.netflix.com/).

## Vývoj

```bash
npm install
npm run dev          # vite watch
npm test             # unit testy
npm run build        # produkční build → dist/
```

## Načtení do Chromu (dev)

1. `npm run build`
2. Otevři `chrome://extensions/` → zapni *Developer mode*
3. *Load unpacked* → vyber složku `dist/`
4. Otevři Netflix.com a podívej se na badge u titulů.

## Architektura

- **Content script** sleduje DOM Netflixu (MutationObserver), extrahuje název + rok, požádá service worker o data, vykreslí badge v Shadow DOM.
- **Service worker** drží cache (`chrome.storage.local`, 30 d hit / 7 d miss), throttle frontu (max 2 paralelní requesty, 500 ms mezi nimi, dedup podle klíče), provádí fetch na ČSFD a parsuje HTML.
- **Popup** umožňuje rozšíření vypnout a vyčistit cache.

Detailní design: [`docs/superpowers/specs/2026-05-02-netflix-csfd-design.md`](docs/superpowers/specs/2026-05-02-netflix-csfd-design.md).

## Privacy

[`docs/PRIVACY.md`](docs/PRIVACY.md).

## Licence

MIT (zatím nepoužíváno; doplnit při publikaci).
