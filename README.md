# Netflix × ČSFD

Chrome rozšíření zobrazující hodnocení z [ČSFD](https://www.csfd.cz/) u filmů a seriálů na [Netflix](https://www.netflix.com/).

## Instalace (uživatel)

1. Stáhni nejnovější `netflix-csfd-*.zip` z [Releases](../../releases/latest) a rozbal
2. V Chrome otevři `chrome://extensions/`
3. Zapni **Developer mode** vpravo nahoře
4. Klik **Load unpacked** → vyber rozbalenou složku
5. Otevři https://www.netflix.com — badges se objeví na dlaždicích, hover preview, detail modalu i billboardu

> **Pozn.:** Pokud byl uživatel někdy přihlášen na csfd.cz v tomto Chromu, plugin může používat anti-bot cookie. Pokud `?` zůstane všude, otevři jednou csfd.cz a obnov rozšíření.

## Vývoj

```bash
npm install
npm run dev          # vite watch
npm test             # unit testy
npm run build        # produkční build → dist/
```

### Načtení dev buildu do Chromu

1. `npm run build`
2. `chrome://extensions/` → *Developer mode* → *Load unpacked* → `dist/`

### Release

Push tag `v0.X.Y` → CI pipeline buildne, otestuje a vytvoří GitHub Release se zip souborem.

```bash
npm version patch  # nebo minor / major — bumpne package.json + manifest.json
git push --follow-tags
```

## Architektura

- **Content script** sleduje DOM Netflixu (MutationObserver), extrahuje název + rok, požádá service worker o data, vykreslí badge v Shadow DOM.
- **Service worker** drží cache (`chrome.storage.local`, 30 d hit / 7 d miss), throttle frontu (max 2 paralelní requesty, 500 ms mezi nimi, dedup podle klíče), provádí fetch na ČSFD a parsuje HTML.
- **Popup** umožňuje rozšíření vypnout a vyčistit cache.

Detailní design: [`docs/superpowers/specs/2026-05-02-netflix-csfd-design.md`](docs/superpowers/specs/2026-05-02-netflix-csfd-design.md).

## Privacy

[`docs/PRIVACY.md`](docs/PRIVACY.md).

## Licence

MIT (zatím nepoužíváno; doplnit při publikaci).
