# Netflix × ČSFD — Design Spec

**Datum:** 2026-05-02
**Stav:** návrh k revizi
**Cíl:** Chrome rozšíření, které u každého filmu/seriálu na Netflix zobrazí hodnocení z ČSFD.

---

## 1. Shrnutí

Chrome extension pro publikaci na Chrome Web Store. U dlaždic na Netflix.com (browse, hover preview, detail modal, výsledky vyhledávání) zobrazuje malý badge s procentuálním hodnocením z ČSFD. V hover preview a detail modalu navíc žánr, originální název a odkaz na ČSFD.

Data z ČSFD získává přímým scrapingem (search + detail page), s lokální cache a centrální throttle frontou v service workeru. Žádný vlastní backend.

**Mimo rozsah MVP:**
- Manuální override špatných matchů (uživatel uvidí špatný výsledek bez možnosti opravit).
- E2E testy na Netflix.com (jen manuální QA).
- Lokalizace UI (jen čeština).
- Synchronizace cache mezi zařízeními.

---

## 2. Tech stack

- **TypeScript** + **Vite** + **CRXJS** (Chrome MV3 plugin pro Vite, řeší manifest, hot-reload).
- **Manifest V3** (povinné pro nové extension publikace).
- **Vitest** + **happy-dom** (unit testy, žádný browser e2e).
- Žádný UI framework — popup je vanilla HTML/TS, content script vykresluje přes DOM API + Shadow DOM.

---

## 3. Architektura

Tři komponenty (standardní MV3 layout):

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Content script         │ ──msg─▶ │  Service worker          │
│  (běží na netflix.com)  │ ◀─────  │  (background)            │
│  - DOM observer         │         │  - cache (chrome.storage)│
│  - title extraction     │         │  - throttling queue      │
│  - badge injection      │         │  - CSFD search + parse   │
└─────────────────────────┘         └──────────────────────────┘
                                              ▲
                                              │  fetch (host_perm)
                                              ▼
                                       ┌─────────────┐
                                       │  csfd.cz    │
                                       └─────────────┘

┌──────────────┐
│ Popup (HTML) │   on/off, vyčistit cache, GitHub link
└──────────────┘
```

**Důvod rozdělení:**
- Content script **jen sleduje DOM a vykresluje**. Neřeší fetch ani parsování HTML.
- Service worker je **jediný klient ČSFD**. Tím je jedna centrální fronta (throttling), jedna cache, žádný CORS (service worker s `host_permissions` na `*.csfd.cz` fetchuje cross-origin volně).
- Popup je minimální HTML — žádný framework.

Komponenty komunikují přes `chrome.runtime.sendMessage` / `onMessage`.

### 3.1 Manifest (klíčové části)

```json
{
  "manifest_version": 3,
  "name": "Netflix × ČSFD",
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": [
    "*://*.netflix.com/*",
    "*://*.csfd.cz/*"
  ],
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "content_scripts": [
    {
      "matches": ["*://*.netflix.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": { "default_popup": "src/popup/popup.html" }
}
```

---

## 4. Životní cyklus titulu (data flow)

```
1. Content script: MutationObserver detekuje nový tile v DOM
2. Extract: vytáhne title (a rok, pokud je dostupný)
3. Hash key:   normalize(title) + "|" + (year || "?")
4. Pošle message → service worker:  { type: "lookup", key, title, year }
5. Service worker:
     ├── cache hit?  → vrátí { rating, votes, genre, origTitle, url }
     │                 (TTL 30 dní pro hit, 7 dní pro miss)
     │
     └── cache miss? → enqueue do throttle fronty
                       (max 2 paralelní, 500 ms mezi)
                       │
                       ▼
                       fetch csfd.cz/hledat/?q=<title>
                       │
                       ▼
                       parse search → vyber best match (similarity + year)
                       │
                       ▼
                       fetch detail page → parse rating, žánr, ...
                       │
                       ▼
                       ulož do cache, vrátí výsledek
6. Content script: zapíše badge do DOM tile.
                   V hover/detail navíc rozšířený panel.
```

**Detaily:**
- **Negative cache (7 dní):** "no match" se cachuje taky, jinak bychom CSFD bombardovali pro každý nový view neznámého filmu.
- **Re-lookup s rokem:** pokud byl první lookup jen na title (grid bez roku), a později získáme rok z hover preview, klíč se změní → uděláme přesnější lookup. Starý záznam zůstává.
- **Žádný per-tile fetch v gridu:** fronta deduplikuje stejné requesty a omezuje souběh.

---

## 5. CSFD scraping & matching

### 5.1 Search

- Endpoint: `https://www.csfd.cz/hledat/?q=<encoded title>`.
- Parsing přes `DOMParser` v service workeru. Bez regexu na HTML.
- Z filmové sekce vytáhneme: detail URL, název na CSFD, rok, (pokud je) procenta.

### 5.2 Match scoring

```
score = title_similarity(0..1) * 0.7
      + year_match            * 0.3

  year_match = 1   pokud rok přesně sedí
             = 0.5 pokud rok ±1
             = 0   pokud se liší o víc, nebo rok neznáme

threshold = 0.6  → pod tím = "no match"
```

`title_similarity` přes Dice coefficient bigramů (robust proti diakritice, závorkám, krátkým rozdílům). Před porovnáním normalizace: lowercase, strip diakritiky, strip "Season N"/"Series" suffixu, strip závorek `(2010)`.

### 5.3 Detail page

Pokud search results neobsahují všechna data (žánr, originální název), fetchneme detail URL a doparsujeme. Cachujeme dohromady jako jeden záznam.

### 5.4 Robustnost selektorů

- Všechny CSFD selektory v jednom souboru `src/background/csfd-parser.ts`.
- Každý selektor má fallback (např. `.rating .number, .star-rating-count`).
- Když parser selže, zalogujeme do `chrome.storage.session` jako diagnostiku (jen v dev buildu).
- HTML snapshoty v `tests/fixtures/csfd/*.html` — unit testy parseru proti nim. Když CSFD změní HTML, stáhneme nový snapshot, opravíme selektory, testy chrání proti regresi.

---

## 6. Cache & throttling

### 6.1 Storage backend

`chrome.storage.local` (s `unlimitedStorage` permission). Promise-based, přežívá restart service workeru.

**Schéma:**

```typescript
// klíč:    "lookup:<normalized_title>|<year_or_?>"
// hodnota:
{
  result: {
    rating: number,         // 0–100
    votes: number,
    origTitle: string,
    year: number,
    genres: string[],
    csfdUrl: string,
  } | null,                 // null = no match
  cachedAt: number,         // Date.now()
  ttlMs: number,            // 30 d hit, 7 d miss
}
```

### 6.2 Eviction

`chrome.storage` nemá auto-eviction. Při zápisu kontrolujeme `getBytesInUse`; pokud nad 4 MB (i s `unlimitedStorage` chceme rozumný strop), smažeme LRU 20 % nejstarších. Levné, běží občas.

### 6.3 Throttle queue (service worker)

```typescript
class CSFDQueue {
  maxConcurrent = 2
  minDelayMs = 500          // mezi starty requestů
  maxRetries = 2            // exp. backoff: 1 s, 4 s
  // dedup: stejný key in-flight → attach další waiter na stejný promise
}
```

**Klíčové vlastnosti:**
- **Dedup:** souběžné lookupy stejného filmu se sloučí do jednoho fetche.
- **Backpressure:** content script čeká na promise, nikoho nespamuje.
- **Circuit breaker:** 2× za sebou 429/503 → fronta pauznutá 60 s, log do diagnostiky.

### 6.4 Service worker lifecycle

MV3 service worker se uspí po ~30 s nečinnosti.
- Fronta je in-memory → po probuzení prázdná. To je OK, cache na disku přežívá.
- In-flight requesty během uspání selžou → content script má 1× retry s 2 s delayem.

---

## 7. UI / DOM injection

### 7.1 Detekce tilů

`MutationObserver` na `document.body` se subtree, debounce 100 ms, filtrované jen na mutace co přidaly Netflix tile (typicky elementy s `data-uia*="title-card"`).

### 7.2 Známé Netflix kontejnery (bude ověřeno při implementaci)

| Kontext | Selektor (přibližně) | Zdroj title |
|---|---|---|
| Browse grid | `.title-card-container, [data-uia*="title-card"]` | `aria-label` na linku, `alt` obrázku |
| Hover preview (Bob card) | `.bob-card, [data-uia="bob-card"]` | `.bob-title`, year v `.bob-overview-meta` |
| Detail modal | `.detail-modal, [data-uia="modal"]` | `.previewModal--player_container h3` |
| Search results | `.search-result-card` | `aria-label` |

Všechny Netflix selektory v `src/content/netflix-selectors.ts`. Stejný princip jako u CSFD — když se Netflix změní, jeden soubor.

### 7.3 Badge styly

- **Tile (small):** kruhový badge 28×28 px, CSFD červená (`#ba0305`), bílé číslo, polo-průhledné pozadí. `position: absolute` vpravo nahoře, `pointer-events: none` (klik propadne do Netflix).
- **Hover/detail (large):** pruh pod Netflix metadaty — `87 % CSFD · 12 345 hodnocení · Drama, Krimi · originální název: Pulp Fiction · [Otevřít na CSFD ↗]`. `pointer-events: auto`, link otevře CSFD v novém tabu.

### 7.4 Izolace

- Badge je v **Shadow DOM** → Netflix CSS nás nerozhází a my nerozhážeme Netflix.
- Anti-collision: každý badge má `data-csfd-badge="<key>"`, před injekcí kontrolujeme existenci.

---

## 8. Struktura projektu

```
netflix-csfd/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── content/
│   │   ├── index.ts              # entry, MutationObserver
│   │   ├── netflix-selectors.ts  # všechny Netflix DOM selektory
│   │   ├── extract-title.ts      # title/year per kontext
│   │   ├── badge.ts              # render badge (shadow DOM)
│   │   └── lookup-client.ts      # message bridge na SW
│   ├── background/
│   │   ├── index.ts              # entry, message handler
│   │   ├── csfd-fetcher.ts       # fetch search + detail
│   │   ├── csfd-parser.ts        # parse search + detail
│   │   ├── matcher.ts            # similarity, scoring
│   │   ├── queue.ts              # throttle, dedup, retries
│   │   └── cache.ts              # chrome.storage wrapper, eviction
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts              # on/off, clear cache
│   └── shared/
│       ├── types.ts              # message + result types
│       └── normalize.ts          # title normalization (sdíleno)
├── tests/
│   ├── matcher.test.ts
│   ├── csfd-parser.test.ts
│   ├── normalize.test.ts
│   ├── cache.test.ts
│   └── fixtures/
│       ├── csfd/
│       └── netflix/
├── docs/
│   ├── PRIVACY.md                # pro Web Store listing
│   └── superpowers/specs/
├── public/
│   └── icons/                    # 16, 32, 48, 128 px
└── README.md
```

---

## 9. Privacy & ToS

- **Žádný user tracking, žádná telemetrie.**
- Lokálně se ukládá jen cache (anonymní data — title → rating).
- Síťové cíle: `*.netflix.com` (čtení DOMu), `*.csfd.cz` (fetch).
- `docs/PRIVACY.md` popíše vše pro Web Store listing.
- Pluginu nedáváme oprávnění `tabs`, `cookies`, `webRequest` nebo cokoli, co by Web Store review zpřísnil.

**Riziko ToS ČSFD:** ČSFD nemá veřejné API. Scraping je v šedé zóně. Mitigace:
- agresivní cache (shrnuto: 1 fetch / film / 30 dní),
- throttling (max 2 paralelně, 500 ms mezi),
- circuit breaker při 429/503,
- jasný User-Agent identifikující rozšíření,
- v privacy policy zmíněno, že data pochází z csfd.cz.

Pokud ČSFD vznese námitku, plugin je připraven přepnout na backend-side proxy (mimo MVP).

---

## 10. Testování

- **Unit testy (Vitest + happy-dom):**
  - `normalize.test.ts` — diakritika, závorky, "Season N", whitespace.
  - `matcher.test.ts` — similarity, year matching, threshold.
  - `csfd-parser.test.ts` — proti HTML fixtures (search hit, search miss, detail page).
  - `cache.test.ts` — TTL, eviction LRU, dedup klíčů.
- **Manuální QA na netflix.com:**
  - Browse grid: badge se objeví na všech viditelných tilech do 5 s.
  - Hover preview: rozšířený panel s žánrem, originálním názvem.
  - Detail modal: stejně.
  - Search: badge na výsledcích.
  - Kontroly: žádný badge se nezobrazí dvakrát; scroll a Netflix re-render nesmí způsobit zacyklení.
- **Soak test:** otevři Netflix, scrolluj 5 minut, sleduj DevTools Network → max ~tucet requestů na ČSFD (díky cache + dedup).

---

## 11. Open questions / budoucí rozšíření (mimo MVP)

- Manual override špatných matchů.
- Lokalizace UI (anglicky).
- Filtr "Skrýt filmy pod X %".
- Sync cache mezi zařízeními (`chrome.storage.sync` má 100 KB limit → asi neproveditelné).
- Backend proxy varianta, pokud ČSFD scraping přestane fungovat.
- Podpora i jiných streamovacích služeb (HBO Max, Disney+).
