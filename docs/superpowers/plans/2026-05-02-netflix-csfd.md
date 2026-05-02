# Netflix × ČSFD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome extension (MV3) zobrazující ČSFD hodnocení u titulů na Netflix.com.

**Architecture:** Content script sleduje DOM Netflixu a vykresluje badge. Service worker provádí jediné fetchy na ČSFD, drží cache (`chrome.storage.local`) a throttle frontu. Popup je minimální HTML pro on/off + clear cache.

**Tech Stack:** TypeScript, Vite + CRXJS (MV3 build), Vitest + happy-dom (testy), Manifest V3, žádný UI framework.

**Spec:** `docs/superpowers/specs/2026-05-02-netflix-csfd-design.md`

---

## File structure

```
netflix-csfd/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── content/
│   │   ├── index.ts              # entry: MutationObserver, orchestrace
│   │   ├── netflix-selectors.ts  # všechny Netflix DOM selektory
│   │   ├── extract-title.ts      # title/year extraction per kontext
│   │   ├── badge.ts              # Shadow DOM badge (small + large variant)
│   │   └── lookup-client.ts      # chrome.runtime.sendMessage wrapper
│   ├── background/
│   │   ├── index.ts              # entry: message handler
│   │   ├── csfd-fetcher.ts       # fetch search/detail (mockable)
│   │   ├── csfd-parser.ts        # parse search + detail (DOMParser)
│   │   ├── matcher.ts            # title similarity, year match, scoring
│   │   ├── queue.ts              # throttle, dedup, retries, circuit breaker
│   │   └── cache.ts              # chrome.storage.local wrapper, eviction
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts              # on/off, clear cache
│   └── shared/
│       ├── types.ts              # message + result types
│       └── normalize.ts          # title normalization
├── tests/
│   ├── normalize.test.ts
│   ├── matcher.test.ts
│   ├── csfd-parser.test.ts
│   ├── cache.test.ts
│   ├── queue.test.ts
│   ├── extract-title.test.ts
│   └── fixtures/
│       ├── csfd/
│       │   ├── search-pulp-fiction.html
│       │   ├── search-no-results.html
│       │   └── detail-pulp-fiction.html
│       └── netflix/
│           └── tile-grid.html
├── docs/
│   ├── PRIVACY.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── public/
│   └── icons/                    # 16, 32, 48, 128
└── README.md
```

**Boundaries:**
- `src/shared/` — bez závislostí na chrome.* nebo DOM (jen čisté funkce + typy).
- `src/background/` — používá `chrome.storage`, `fetch`, `DOMParser`. Nepřistupuje k Netflix DOMu.
- `src/content/` — používá `document`, `MutationObserver`, posílá messages. Žádný fetch ani parsing HTML.
- Selektory CSFD a Netflix jsou izolované v jednotlivých souborech (snadno se mění při změnách webů).

---

## Task 1: Bootstrap projektu (npm init, Vite, CRXJS, TS)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Inicializovat npm a nainstalovat dependencies**

```bash
cd /Users/adamzalesak/Projects/netflix-csfd
npm init -y
npm install --save-dev typescript vite @crxjs/vite-plugin@^2.0.0-beta.25 \
  @types/chrome vitest happy-dom @vitest/ui
```

- [ ] **Step 2: Vytvořit `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Vytvořit `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Vytvořit `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
.vite/
```

- [ ] **Step 5: Update `package.json` scripts**

V `package.json` nastav `"type": "module"` a scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts .gitignore package-lock.json
git commit -m "chore: bootstrap project with Vite + CRXJS + TS"
```

---

## Task 2: Manifest V3

**Files:**
- Create: `manifest.json`
- Create: `public/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` (placeholder)

- [ ] **Step 1: Vytvořit ikony (placeholder, 1×1 px PNG)**

```bash
mkdir -p public/icons
# vytvoř 4 prázdné PNG (placeholder - nahradí se hotovou ikonou později)
for size in 16 32 48 128; do
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x03\x00\x05\xfe\x02\xfe\xa3jv\x9c\x00\x00\x00\x00IEND\xaeB`\x82' > "public/icons/icon${size}.png"
done
```

- [ ] **Step 2: Vytvořit `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Netflix × ČSFD",
  "version": "0.1.0",
  "description": "Zobrazuje hodnocení z ČSFD u filmů a seriálů na Netflix.",
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": [
    "*://*.netflix.com/*",
    "*://*.csfd.cz/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*.netflix.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  },
  "icons": {
    "16": "public/icons/icon16.png",
    "32": "public/icons/icon32.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json public/
git commit -m "chore: add MV3 manifest and placeholder icons"
```

---

## Task 3: Vitest setup + first smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Vytvořit `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Smoke test**

`tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Spustit testy**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "chore: add Vitest config + smoke test"
```

---

## Task 4: Title normalization (TDD)

**Files:**
- Create: `src/shared/normalize.ts`
- Create: `tests/normalize.test.ts`

- [ ] **Step 1: Napsat failing testy**

`tests/normalize.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { normalizeTitle } from "../src/shared/normalize";

describe("normalizeTitle", () => {
  it("lowercases", () => {
    expect(normalizeTitle("Pulp Fiction")).toBe("pulp fiction");
  });

  it("strips diacritics", () => {
    expect(normalizeTitle("Žluťoučký kůň")).toBe("zlutoucky kun");
  });

  it("removes year in parens", () => {
    expect(normalizeTitle("Inception (2010)")).toBe("inception");
  });

  it("strips Season N suffix", () => {
    expect(normalizeTitle("Stranger Things Season 4")).toBe("stranger things");
    expect(normalizeTitle("The Crown Series 5")).toBe("the crown");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  Pulp   Fiction  ")).toBe("pulp fiction");
  });

  it("strips punctuation but keeps colons", () => {
    expect(normalizeTitle("Sherlock Holmes: A Game of Shadows!"))
      .toBe("sherlock holmes a game of shadows");
  });
});
```

- [ ] **Step 2: Spustit, ověřit že selže**

Run: `npm test -- normalize`
Expected: FAIL — `Cannot find module '../src/shared/normalize'`.

- [ ] **Step 3: Implementace**

`src/shared/normalize.ts`:
```typescript
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
```

- [ ] **Step 4: Spustit testy**

Run: `npm test -- normalize`
Expected: PASS — všech 6 testů.

- [ ] **Step 5: Commit**

```bash
git add src/shared/normalize.ts tests/normalize.test.ts
git commit -m "feat: title normalization for matching"
```

---

## Task 5: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Vytvořit typy**

`src/shared/types.ts`:
```typescript
export type CSFDResult = {
  rating: number;        // 0–100
  votes: number;
  origTitle: string;
  year: number;
  genres: string[];
  csfdUrl: string;
};

export type LookupRequest = {
  type: "lookup";
  key: string;            // normalized title + "|" + year
  title: string;          // raw title from Netflix
  year: number | null;
};

export type LookupResponse =
  | { ok: true; result: CSFDResult | null }   // null = no match (cached negative)
  | { ok: false; error: string };

export type ClearCacheRequest = { type: "clear-cache" };
export type ClearCacheResponse = { ok: true };

export type Message = LookupRequest | ClearCacheRequest;
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: shared message + result types"
```

---

## Task 6: Title similarity (Dice coefficient, TDD)

**Files:**
- Create: `src/background/matcher.ts`
- Add to: `tests/matcher.test.ts`

- [ ] **Step 1: Failing testy**

`tests/matcher.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { titleSimilarity } from "../src/background/matcher";

describe("titleSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(titleSimilarity("pulp fiction", "pulp fiction")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(titleSimilarity("abc", "xyz")).toBe(0);
  });

  it("returns high similarity for near-identical", () => {
    expect(titleSimilarity("pulp fiction", "pulpfiction")).toBeGreaterThan(0.7);
  });

  it("handles short strings", () => {
    expect(titleSimilarity("up", "up")).toBe(1);
    expect(titleSimilarity("up", "down")).toBe(0);
  });

  it("returns 0 when one is empty", () => {
    expect(titleSimilarity("", "anything")).toBe(0);
    expect(titleSimilarity("anything", "")).toBe(0);
  });
});
```

- [ ] **Step 2: Spustit, fail**

Run: `npm test -- matcher`
Expected: FAIL — module nenalezen.

- [ ] **Step 3: Implementace**

`src/background/matcher.ts`:
```typescript
function bigrams(s: string): string[] {
  if (s.length < 2) return s.length === 1 ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.length === 0 || bb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let intersection = 0;
  for (const g of bb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      intersection++;
      counts.set(g, c - 1);
    }
  }
  return (2 * intersection) / (ba.length + bb.length);
}
```

- [ ] **Step 4: Run testy**

Run: `npm test -- matcher`
Expected: PASS — 5 testů.

- [ ] **Step 5: Commit**

```bash
git add src/background/matcher.ts tests/matcher.test.ts
git commit -m "feat: Dice coefficient title similarity"
```

---

## Task 7: Match scoring + best match selection (TDD)

**Files:**
- Modify: `src/background/matcher.ts`
- Modify: `tests/matcher.test.ts`

- [ ] **Step 1: Přidat failing testy**

Append do `tests/matcher.test.ts`:
```typescript
import { scoreCandidate, pickBestMatch } from "../src/background/matcher";

describe("scoreCandidate", () => {
  it("returns 1 when title and year match exactly", () => {
    const s = scoreCandidate(
      { titleNormalized: "pulp fiction", year: 1994 },
      { titleNormalized: "pulp fiction", year: 1994 }
    );
    expect(s).toBe(1);
  });

  it("gives 0.5 weight to year ±1", () => {
    const s = scoreCandidate(
      { titleNormalized: "pulp fiction", year: 1994 },
      { titleNormalized: "pulp fiction", year: 1995 }
    );
    // title=1, year_match=0.5 → 0.7 + 0.15 = 0.85
    expect(s).toBeCloseTo(0.85, 2);
  });

  it("year mismatch >1 = 0 from year component", () => {
    const s = scoreCandidate(
      { titleNormalized: "pulp fiction", year: 1994 },
      { titleNormalized: "pulp fiction", year: 2010 }
    );
    expect(s).toBeCloseTo(0.7, 2);
  });

  it("missing year = 0 from year component", () => {
    const s = scoreCandidate(
      { titleNormalized: "pulp fiction", year: null },
      { titleNormalized: "pulp fiction", year: 1994 }
    );
    expect(s).toBeCloseTo(0.7, 2);
  });
});

describe("pickBestMatch", () => {
  const query = { titleNormalized: "pulp fiction", year: 1994 };

  it("picks highest scorer above threshold", () => {
    const candidates = [
      { titleNormalized: "pulp fiction", year: 1994, payload: "A" },
      { titleNormalized: "pulp fictional", year: 1994, payload: "B" },
    ];
    const best = pickBestMatch(query, candidates, 0.6);
    expect(best?.payload).toBe("A");
  });

  it("returns null when nothing above threshold", () => {
    const candidates = [
      { titleNormalized: "completely different", year: 2020, payload: "X" },
    ];
    const best = pickBestMatch(query, candidates, 0.6);
    expect(best).toBeNull();
  });

  it("returns null for empty candidates", () => {
    expect(pickBestMatch(query, [], 0.6)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- matcher`
Expected: FAIL — `scoreCandidate`, `pickBestMatch` nedefinováno.

- [ ] **Step 3: Implementace**

Append do `src/background/matcher.ts`:
```typescript
export type MatchInput = {
  titleNormalized: string;
  year: number | null;
};

export function scoreCandidate(query: MatchInput, candidate: MatchInput): number {
  const titleScore = titleSimilarity(query.titleNormalized, candidate.titleNormalized);
  let yearScore = 0;
  if (query.year != null && candidate.year != null) {
    const diff = Math.abs(query.year - candidate.year);
    if (diff === 0) yearScore = 1;
    else if (diff === 1) yearScore = 0.5;
  }
  return titleScore * 0.7 + yearScore * 0.3;
}

export function pickBestMatch<T extends MatchInput>(
  query: MatchInput,
  candidates: T[],
  threshold: number
): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreCandidate(query, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= threshold ? best : null;
}
```

- [ ] **Step 4: Run testy**

Run: `npm test -- matcher`
Expected: PASS — všech 9 testů (5 + 4 + 2 nové scénáře).

- [ ] **Step 5: Commit**

```bash
git add src/background/matcher.ts tests/matcher.test.ts
git commit -m "feat: match scoring (title + year) and best-match selection"
```

---

## Task 8: ČSFD search results parser (TDD s fixturou)

**Files:**
- Create: `tests/fixtures/csfd/search-pulp-fiction.html`
- Create: `tests/fixtures/csfd/search-no-results.html`
- Create: `src/background/csfd-parser.ts`
- Create: `tests/csfd-parser.test.ts`

> **Poznámka:** Fixtury jsou syntetické (zachycují podstatu CSFD HTML struktury). Při skutečné integraci stáhni reálnou HTML stránku z `https://www.csfd.cz/hledat/?q=pulp+fiction`, nahraď fixturu, a pokud parser selže, uprav selektory v `csfd-parser.ts`. Testy potom rozhodnou, jestli změna sedí.

- [ ] **Step 1: Fixtura — search hits**

`tests/fixtures/csfd/search-pulp-fiction.html`:
```html
<!DOCTYPE html><html><body>
<section class="main-movies">
  <article class="article-content">
    <header><h3 class="film-title-norating">
      <a class="film-title-name" href="/film/8364-pulp-fiction/historky-z-podsveti/">Pulp Fiction: Historky z podsvětí</a>
      <span class="film-title-info"><span class="info">(1994)</span></span>
    </h3></header>
    <p class="film-origins-genres"><span>USA, 1994, 154 min</span></p>
  </article>
  <article class="article-content">
    <header><h3 class="film-title-norating">
      <a class="film-title-name" href="/film/12345-different-movie/">Different Movie</a>
      <span class="film-title-info"><span class="info">(2001)</span></span>
    </h3></header>
  </article>
</section>
</body></html>
```

- [ ] **Step 2: Fixtura — no results**

`tests/fixtures/csfd/search-no-results.html`:
```html
<!DOCTYPE html><html><body>
<section class="main-movies"></section>
<p class="no-results">Bohužel nic nenalezeno.</p>
</body></html>
```

- [ ] **Step 3: Failing testy**

`tests/csfd-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSearchResults } from "../src/background/csfd-parser";

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures/csfd", name), "utf8");
}

describe("parseSearchResults", () => {
  it("extracts film candidates with title, year, url", () => {
    const html = loadFixture("search-pulp-fiction.html");
    const results = parseSearchResults(html);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Pulp Fiction: Historky z podsvětí",
      year: 1994,
      url: "https://www.csfd.cz/film/8364-pulp-fiction/historky-z-podsveti/",
    });
    expect(results[1]?.title).toBe("Different Movie");
    expect(results[1]?.year).toBe(2001);
  });

  it("returns empty array on no-results page", () => {
    const html = loadFixture("search-no-results.html");
    expect(parseSearchResults(html)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run, fail**

Run: `npm test -- csfd-parser`
Expected: FAIL — module nenalezen.

- [ ] **Step 5: Implementace `parseSearchResults`**

`src/background/csfd-parser.ts`:
```typescript
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
```

- [ ] **Step 6: Run testy**

Run: `npm test -- csfd-parser`
Expected: PASS — 2 testy.

- [ ] **Step 7: Commit**

```bash
git add src/background/csfd-parser.ts tests/csfd-parser.test.ts tests/fixtures/csfd/
git commit -m "feat: parse ČSFD search results"
```

---

## Task 9: ČSFD detail page parser (TDD)

**Files:**
- Create: `tests/fixtures/csfd/detail-pulp-fiction.html`
- Modify: `src/background/csfd-parser.ts`
- Modify: `tests/csfd-parser.test.ts`

> **Poznámka:** Stejně jako Task 8 — syntetická fixtura. Při integraci ověř proti reálnému CSFD detailu.

- [ ] **Step 1: Fixtura**

`tests/fixtures/csfd/detail-pulp-fiction.html`:
```html
<!DOCTYPE html><html><body>
<div class="film-header-name">
  <h1>Pulp Fiction: Historky z podsvětí</h1>
  <div class="film-names">
    <ul><li class="en"><img alt="USA"><h3>Pulp Fiction</h3></li></ul>
  </div>
</div>
<div class="film-rating-average">87%</div>
<div class="rating-total"><a href="#">12 345 hodnocení</a></div>
<div class="origin"><span>USA, </span><span itemprop="dateCreated">1994</span><span>, 154 min</span></div>
<div class="genres">Krimi / Drama</div>
</body></html>
```

- [ ] **Step 2: Failing test**

Append do `tests/csfd-parser.test.ts`:
```typescript
import { parseDetailPage } from "../src/background/csfd-parser";

describe("parseDetailPage", () => {
  it("extracts rating, votes, origTitle, year, genres", () => {
    const html = loadFixture("detail-pulp-fiction.html");
    const detail = parseDetailPage(html);
    expect(detail).toEqual({
      rating: 87,
      votes: 12345,
      origTitle: "Pulp Fiction",
      year: 1994,
      genres: ["Krimi", "Drama"],
    });
  });

  it("returns null when rating is missing", () => {
    const html = "<html><body></body></html>";
    expect(parseDetailPage(html)).toBeNull();
  });
});
```

- [ ] **Step 3: Run, fail**

Run: `npm test -- csfd-parser`
Expected: FAIL — `parseDetailPage` nedefinováno.

- [ ] **Step 4: Implementace**

Append do `src/background/csfd-parser.ts`:
```typescript
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
```

- [ ] **Step 5: Run testy**

Run: `npm test -- csfd-parser`
Expected: PASS — 4 testy.

- [ ] **Step 6: Commit**

```bash
git add src/background/csfd-parser.ts tests/csfd-parser.test.ts tests/fixtures/csfd/detail-pulp-fiction.html
git commit -m "feat: parse ČSFD detail page"
```

---

## Task 10: ČSFD fetcher (mockable wrapper)

**Files:**
- Create: `src/background/csfd-fetcher.ts`

- [ ] **Step 1: Implementace**

`src/background/csfd-fetcher.ts`:
```typescript
const CSFD_BASE = "https://www.csfd.cz";

export type FetchFn = (url: string) => Promise<{ status: number; body: string }>;

export const realFetch: FetchFn = async (url) => {
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
    credentials: "omit",
  });
  const body = await res.text();
  return { status: res.status, body };
};

export function searchUrl(title: string): string {
  return `${CSFD_BASE}/hledat/?q=${encodeURIComponent(title)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/background/csfd-fetcher.ts
git commit -m "feat: ČSFD fetcher abstraction (mockable)"
```

---

## Task 11: Cache wrapper (TDD, chrome.storage mock)

**Files:**
- Create: `src/background/cache.ts`
- Create: `tests/cache.test.ts`

- [ ] **Step 1: Chrome.storage mock + failing testy**

`tests/cache.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cache } from "../src/background/cache";
import type { CSFDResult } from "../src/shared/types";

type Storage = { [k: string]: unknown };

function makeStorageMock() {
  let store: Storage = {};
  return {
    store,
    api: {
      local: {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return { ...store };
          if (typeof keys === "string") return keys in store ? { [keys]: store[keys] } : {};
          const out: Storage = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (items: Storage) => { Object.assign(store, items); }),
        remove: vi.fn(async (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete store[k];
        }),
        getBytesInUse: vi.fn(async () => JSON.stringify(store).length),
      },
    },
    reset() { for (const k of Object.keys(store)) delete store[k]; },
  };
}

const sampleResult: CSFDResult = {
  rating: 87, votes: 12345, origTitle: "Pulp Fiction", year: 1994,
  genres: ["Krimi"], csfdUrl: "https://www.csfd.cz/film/8364/",
};

describe("Cache", () => {
  let mock: ReturnType<typeof makeStorageMock>;
  let cache: Cache;

  beforeEach(() => {
    mock = makeStorageMock();
    cache = new Cache(mock.api as unknown as typeof chrome.storage, () => Date.now());
  });

  it("set then get returns the value", async () => {
    await cache.set("key1", sampleResult);
    const got = await cache.get("key1");
    expect(got).toEqual(sampleResult);
  });

  it("returns undefined for missing key", async () => {
    expect(await cache.get("nope")).toBeUndefined();
  });

  it("returns undefined for expired entry", async () => {
    let now = 1_000_000;
    cache = new Cache(mock.api as unknown as typeof chrome.storage, () => now);
    await cache.set("k", sampleResult, 1000);  // 1s TTL
    now += 2000;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("setNegative caches null with shorter TTL", async () => {
    await cache.setNegative("k");
    const raw = await cache.getRaw("k");
    expect(raw?.result).toBeNull();
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- cache`
Expected: FAIL — module nenalezen.

- [ ] **Step 3: Implementace**

`src/background/cache.ts`:
```typescript
import type { CSFDResult } from "../shared/types";

export type CacheEntry = {
  result: CSFDResult | null;
  cachedAt: number;
  ttlMs: number;
};

const TTL_HIT_MS = 30 * 24 * 60 * 60 * 1000;     // 30 days
const TTL_MISS_MS = 7 * 24 * 60 * 60 * 1000;     // 7 days
const KEY_PREFIX = "lookup:";

export class Cache {
  constructor(
    private storage: typeof chrome.storage,
    private now: () => number = () => Date.now()
  ) {}

  private k(key: string): string { return KEY_PREFIX + key; }

  async getRaw(key: string): Promise<CacheEntry | undefined> {
    const got = await this.storage.local.get(this.k(key));
    return got[this.k(key)] as CacheEntry | undefined;
  }

  async get(key: string): Promise<CSFDResult | null | undefined> {
    const entry = await this.getRaw(key);
    if (!entry) return undefined;
    if (this.now() - entry.cachedAt > entry.ttlMs) return undefined;
    return entry.result;
  }

  async set(key: string, result: CSFDResult, ttlMs: number = TTL_HIT_MS): Promise<void> {
    const entry: CacheEntry = { result, cachedAt: this.now(), ttlMs };
    await this.storage.local.set({ [this.k(key)]: entry });
  }

  async setNegative(key: string): Promise<void> {
    const entry: CacheEntry = { result: null, cachedAt: this.now(), ttlMs: TTL_MISS_MS };
    await this.storage.local.set({ [this.k(key)]: entry });
  }

  async clear(): Promise<void> {
    const all = await this.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(KEY_PREFIX));
    if (keys.length) await this.storage.local.remove(keys);
  }
}
```

- [ ] **Step 4: Run testy**

Run: `npm test -- cache`
Expected: PASS — 4 testy.

- [ ] **Step 5: Commit**

```bash
git add src/background/cache.ts tests/cache.test.ts
git commit -m "feat: chrome.storage cache with TTL + negative cache"
```

---

## Task 12: Cache eviction (LRU 20% při >4 MB)

**Files:**
- Modify: `src/background/cache.ts`
- Modify: `tests/cache.test.ts`

- [ ] **Step 1: Failing test**

Append do `tests/cache.test.ts`:
```typescript
describe("Cache eviction", () => {
  it("evicts oldest 20% when over budget", async () => {
    const mock = makeStorageMock();
    let now = 1000;
    const cache = new Cache(mock.api as unknown as typeof chrome.storage, () => now);
    // tlustá fixture - velký bytes-in-use
    mock.api.local.getBytesInUse = vi.fn(async () => 5_000_000);

    for (let i = 0; i < 10; i++) {
      now += 1000;
      await cache.set("k" + i, sampleResult);
    }
    await cache.maybeEvict(4_000_000);

    // 20 % z 10 = 2 nejstarší (k0, k1) jsou pryč
    expect(await cache.getRaw("k0")).toBeUndefined();
    expect(await cache.getRaw("k1")).toBeUndefined();
    expect(await cache.getRaw("k2")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- cache`
Expected: FAIL — `maybeEvict` neexistuje.

- [ ] **Step 3: Implementace**

Append do `src/background/cache.ts`:
```typescript
export class Cache {
  // ... (existující kód)

  async maybeEvict(budgetBytes: number): Promise<void> {
    const used = await this.storage.local.getBytesInUse(null);
    if (used <= budgetBytes) return;
    const all = await this.storage.local.get(null) as Record<string, unknown>;
    const entries = Object.entries(all)
      .filter(([k]) => k.startsWith(KEY_PREFIX))
      .map(([k, v]) => [k, (v as CacheEntry).cachedAt] as const)
      .sort((a, b) => a[1] - b[1]);  // oldest first
    const evictCount = Math.max(1, Math.floor(entries.length * 0.2));
    const keysToRemove = entries.slice(0, evictCount).map(([k]) => k);
    if (keysToRemove.length) await this.storage.local.remove(keysToRemove);
  }
}
```

Také přepiš `set` aby volal `maybeEvict` (občas, ne při každém setu — drahé). Použij counter:

```typescript
private setCount = 0;
private static readonly EVICT_INTERVAL = 50;
private static readonly EVICT_BUDGET = 4 * 1024 * 1024;

async set(key: string, result: CSFDResult, ttlMs: number = TTL_HIT_MS): Promise<void> {
  const entry: CacheEntry = { result, cachedAt: this.now(), ttlMs };
  await this.storage.local.set({ [this.k(key)]: entry });
  this.setCount++;
  if (this.setCount % Cache.EVICT_INTERVAL === 0) {
    await this.maybeEvict(Cache.EVICT_BUDGET);
  }
}
```

- [ ] **Step 4: Run testy**

Run: `npm test -- cache`
Expected: PASS — 5 testů.

- [ ] **Step 5: Commit**

```bash
git add src/background/cache.ts tests/cache.test.ts
git commit -m "feat: cache LRU eviction at >4 MB"
```

---

## Task 13: Throttle queue — concurrency + min delay (TDD)

**Files:**
- Create: `src/background/queue.ts`
- Create: `tests/queue.test.ts`

- [ ] **Step 1: Failing test**

`tests/queue.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { ThrottleQueue } from "../src/background/queue";

describe("ThrottleQueue", () => {
  it("limits concurrent executions", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 2, minDelayMs: 0, maxRetries: 0 });
    let inFlight = 0;
    let maxObserved = 0;
    const task = async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise(r => setTimeout(r, 10));
      inFlight--;
      return 1;
    };
    await Promise.all([q.run("a", task), q.run("b", task), q.run("c", task), q.run("d", task)]);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("dedups same key", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 4, minDelayMs: 0, maxRetries: 0 });
    const fn = vi.fn(async () => 42);
    const [a, b, c] = await Promise.all([
      q.run("samekey", fn),
      q.run("samekey", fn),
      q.run("samekey", fn),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([42, 42, 42]);
  });

  it("retries on failure with backoff", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 1, minDelayMs: 0, maxRetries: 2 });
    let calls = 0;
    const fn = async () => { calls++; if (calls < 3) throw new Error("nope"); return "ok"; };
    const result = await q.run("k", fn);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("propagates failure after max retries", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 1, minDelayMs: 0, maxRetries: 1 });
    const fn = async () => { throw new Error("permanent"); };
    await expect(q.run("k", fn)).rejects.toThrow("permanent");
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- queue`
Expected: FAIL — module nenalezen.

- [ ] **Step 3: Implementace**

`src/background/queue.ts`:
```typescript
type Task<T> = () => Promise<T>;

export type QueueOptions = {
  maxConcurrent: number;
  minDelayMs: number;
  maxRetries: number;
};

export class ThrottleQueue {
  private active = 0;
  private lastStartAt = 0;
  private waiting: Array<() => void> = [];
  private inFlight = new Map<string, Promise<unknown>>();
  private circuitOpenUntil = 0;

  constructor(private opts: QueueOptions) {}

  isCircuitOpen(now: number = Date.now()): boolean {
    return now < this.circuitOpenUntil;
  }

  openCircuit(durationMs: number): void {
    this.circuitOpenUntil = Date.now() + durationMs;
  }

  async run<T>(key: string, task: Task<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const p = this.execute(task).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private async execute<T>(task: Task<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await this.withRetries(task);
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    while (this.active >= this.opts.maxConcurrent) {
      await new Promise<void>(res => this.waiting.push(res));
    }
    const sinceLast = Date.now() - this.lastStartAt;
    if (sinceLast < this.opts.minDelayMs) {
      await new Promise(r => setTimeout(r, this.opts.minDelayMs - sinceLast));
    }
    this.active++;
    this.lastStartAt = Date.now();
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }

  private async withRetries<T>(task: Task<T>): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.opts.maxRetries) {
      try {
        return await task();
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt > this.opts.maxRetries) break;
        const backoff = 1000 * Math.pow(4, attempt - 1);  // 1s, 4s
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }
}
```

- [ ] **Step 4: Run testy**

Run: `npm test -- queue`
Expected: PASS — 4 testy.

- [ ] **Step 5: Commit**

```bash
git add src/background/queue.ts tests/queue.test.ts
git commit -m "feat: throttle queue with concurrency, dedup, retries"
```

---

## Task 14: Service worker entry — message handler & lookup pipeline

**Files:**
- Create: `src/background/index.ts`

- [ ] **Step 1: Implementace**

`src/background/index.ts`:
```typescript
import { Cache } from "./cache";
import { ThrottleQueue } from "./queue";
import { realFetch, searchUrl } from "./csfd-fetcher";
import { parseSearchResults, parseDetailPage } from "./csfd-parser";
import { pickBestMatch } from "./matcher";
import { normalizeTitle } from "../shared/normalize";
import type { Message, LookupRequest, LookupResponse, CSFDResult } from "../shared/types";

const cache = new Cache(chrome.storage);
const queue = new ThrottleQueue({ maxConcurrent: 2, minDelayMs: 500, maxRetries: 2 });

let consecutiveRateLimits = 0;
const CIRCUIT_TRIP = 2;
const CIRCUIT_DURATION_MS = 60_000;

async function lookup(req: LookupRequest): Promise<LookupResponse> {
  const cached = await cache.get(req.key);
  if (cached !== undefined) return { ok: true, result: cached };

  if (queue.isCircuitOpen()) return { ok: false, error: "circuit-open" };

  try {
    const result = await queue.run(req.key, async () => doLookup(req));
    if (result) await cache.set(req.key, result);
    else await cache.setNegative(req.key);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function doLookup(req: LookupRequest): Promise<CSFDResult | null> {
  const search = await realFetch(searchUrl(req.title));
  if (search.status === 429 || search.status === 503) {
    consecutiveRateLimits++;
    if (consecutiveRateLimits >= CIRCUIT_TRIP) queue.openCircuit(CIRCUIT_DURATION_MS);
    throw new Error(`rate-limited:${search.status}`);
  }
  consecutiveRateLimits = 0;
  if (search.status !== 200) throw new Error(`search:${search.status}`);

  const candidates = parseSearchResults(search.body).map(c => ({
    titleNormalized: normalizeTitle(c.title),
    year: c.year,
    payload: c,
  }));
  const queryNorm = { titleNormalized: normalizeTitle(req.title), year: req.year };
  const best = pickBestMatch(queryNorm, candidates, 0.6);
  if (!best) return null;

  const detail = await realFetch(best.payload.url);
  if (detail.status !== 200) throw new Error(`detail:${detail.status}`);
  const parsed = parseDetailPage(detail.body);
  if (!parsed) return null;

  return { ...parsed, csfdUrl: best.payload.url };
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === "lookup") {
    lookup(msg).then(sendResponse);
    return true;  // async
  }
  if (msg.type === "clear-cache") {
    cache.clear().then(() => sendResponse({ ok: true }));
    return true;
  }
});
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds, `dist/` obsahuje service worker bundle. (Tato úloha nemá unit testy — integrace bude testovaná manuálně po Tasku 22.)

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "feat: service worker message handler + lookup pipeline"
```

---

## Task 15: Netflix selectors module

**Files:**
- Create: `src/content/netflix-selectors.ts`

- [ ] **Step 1: Implementace**

`src/content/netflix-selectors.ts`:
```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/content/netflix-selectors.ts
git commit -m "feat: Netflix DOM selectors module"
```

---

## Task 16: Title extraction (TDD)

**Files:**
- Create: `src/content/extract-title.ts`
- Create: `tests/extract-title.test.ts`
- Create: `tests/fixtures/netflix/tile-grid.html`

- [ ] **Step 1: Fixtura**

`tests/fixtures/netflix/tile-grid.html`:
```html
<div class="title-card-container">
  <a aria-label="Pulp Fiction" href="/title/12345">
    <img alt="Pulp Fiction" src="x.jpg" />
  </a>
</div>
<div class="bob-card">
  <h3 class="bob-title">Inception</h3>
  <div class="bob-overview-meta">
    <span>2010</span><span>148 min</span>
  </div>
</div>
<div class="detail-modal">
  <h3>The Dark Knight</h3>
  <div class="previewModal--detailsMetadata">
    <span>2008</span><span>152 min</span>
  </div>
</div>
```

- [ ] **Step 2: Failing testy**

`tests/extract-title.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractFromTile, extractFromBobCard, extractFromDetailModal } from "../src/content/extract-title";

function loadDom(): Document {
  const html = readFileSync(resolve(__dirname, "fixtures/netflix/tile-grid.html"), "utf8");
  document.body.innerHTML = html;
  return document;
}

describe("extract title", () => {
  beforeEach(() => loadDom());

  it("extractFromTile returns title without year", () => {
    const tile = document.querySelector(".title-card-container") as HTMLElement;
    expect(extractFromTile(tile)).toEqual({ title: "Pulp Fiction", year: null });
  });

  it("extractFromBobCard returns title + year", () => {
    const card = document.querySelector(".bob-card") as HTMLElement;
    expect(extractFromBobCard(card)).toEqual({ title: "Inception", year: 2010 });
  });

  it("extractFromDetailModal returns title + year", () => {
    const modal = document.querySelector(".detail-modal") as HTMLElement;
    expect(extractFromDetailModal(modal)).toEqual({ title: "The Dark Knight", year: 2008 });
  });

  it("returns null title when not found", () => {
    document.body.innerHTML = "<div></div>";
    const empty = document.querySelector("div") as HTMLElement;
    expect(extractFromTile(empty)).toEqual({ title: null, year: null });
  });
});
```

- [ ] **Step 3: Run, fail**

Run: `npm test -- extract-title`
Expected: FAIL — module nenalezen.

- [ ] **Step 4: Implementace**

`src/content/extract-title.ts`:
```typescript
import { TITLE_SOURCES, META_SOURCES } from "./netflix-selectors";

export type Extracted = {
  title: string | null;
  year: number | null;
};

function firstText(root: HTMLElement, selectors: readonly string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    if (sel === "[aria-label]") {
      const v = el.getAttribute("aria-label");
      if (v?.trim()) return v.trim();
    } else if (sel === "img[alt]") {
      const v = el.getAttribute("alt");
      if (v?.trim()) return v.trim();
    } else {
      const v = el.textContent?.trim();
      if (v) return v;
    }
  }
  return null;
}

function findYear(root: HTMLElement, selectors: readonly string[]): number | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const match = el.textContent?.match(/\b(19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

export function extractFromTile(el: HTMLElement): Extracted {
  return { title: firstText(el, TITLE_SOURCES.tile), year: null };
}

export function extractFromBobCard(el: HTMLElement): Extracted {
  return {
    title: firstText(el, TITLE_SOURCES.bobCard),
    year: findYear(el, META_SOURCES.bobCard),
  };
}

export function extractFromDetailModal(el: HTMLElement): Extracted {
  return {
    title: firstText(el, TITLE_SOURCES.detailModal),
    year: findYear(el, META_SOURCES.detailModal),
  };
}
```

- [ ] **Step 5: Run testy**

Run: `npm test -- extract-title`
Expected: PASS — 4 testy.

- [ ] **Step 6: Commit**

```bash
git add src/content/extract-title.ts tests/extract-title.test.ts tests/fixtures/netflix/
git commit -m "feat: title/year extraction per Netflix UI context"
```

---

## Task 17: Lookup client (message bridge)

**Files:**
- Create: `src/content/lookup-client.ts`

- [ ] **Step 1: Implementace**

`src/content/lookup-client.ts`:
```typescript
import { normalizeTitle } from "../shared/normalize";
import type { LookupRequest, LookupResponse, CSFDResult } from "../shared/types";

export function makeKey(title: string, year: number | null): string {
  return `${normalizeTitle(title)}|${year ?? "?"}`;
}

export async function lookup(title: string, year: number | null): Promise<CSFDResult | null> {
  const req: LookupRequest = { type: "lookup", key: makeKey(title, year), title, year };
  const res: LookupResponse = await chrome.runtime.sendMessage(req);
  if (!res.ok) return null;
  return res.result;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content/lookup-client.ts
git commit -m "feat: content-script lookup client"
```

---

## Task 18: Badge rendering (Shadow DOM)

**Files:**
- Create: `src/content/badge.ts`

- [ ] **Step 1: Implementace**

`src/content/badge.ts`:
```typescript
import type { CSFDResult } from "../shared/types";

const BADGE_ATTR = "data-csfd-badge";

const SMALL_STYLES = `
  :host { all: initial; position: absolute; top: 6px; right: 6px; z-index: 9999;
          pointer-events: none; font-family: system-ui, sans-serif; }
  .badge { background: rgba(186, 3, 5, 0.92); color: white; font-weight: 700;
           font-size: 12px; padding: 3px 6px; border-radius: 12px;
           min-width: 28px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .badge.unknown { background: rgba(80,80,80,0.85); }
`;

const LARGE_STYLES = `
  :host { all: initial; display: block; margin: 8px 0;
          font-family: system-ui, sans-serif; color: #fff; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
         font-size: 14px; }
  .pct { background: #ba0305; color: #fff; padding: 4px 10px; border-radius: 4px;
         font-weight: 700; }
  .meta { color: rgba(255,255,255,0.85); }
  a { color: #fff; text-decoration: underline; }
`;

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.setAttribute(BADGE_ATTR, "1");
  return host;
}

export function renderSmallBadge(parent: HTMLElement, result: CSFDResult | null): void {
  if (parent.querySelector(`[${BADGE_ATTR}]`)) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const host = makeHost();
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${SMALL_STYLES}</style>` +
    (result
      ? `<div class="badge">${result.rating}%</div>`
      : `<div class="badge unknown">?</div>`);
  parent.appendChild(host);
}

export function renderLargeBadge(parent: HTMLElement, result: CSFDResult | null): void {
  if (parent.querySelector(`[${BADGE_ATTR}="large"]`)) return;
  const host = makeHost();
  host.setAttribute(BADGE_ATTR, "large");
  const root = host.attachShadow({ mode: "open" });
  if (!result) {
    root.innerHTML = `<style>${LARGE_STYLES}</style><div class="row meta">ČSFD: nenalezeno</div>`;
  } else {
    const genres = result.genres.join(", ");
    const votes = result.votes.toLocaleString("cs-CZ");
    root.innerHTML =
      `<style>${LARGE_STYLES}</style>` +
      `<div class="row">` +
      `<span class="pct">${result.rating} % ČSFD</span>` +
      `<span class="meta">${votes} hodnocení</span>` +
      (genres ? `<span class="meta">${genres}</span>` : "") +
      `<span class="meta">orig.: ${result.origTitle}</span>` +
      `<a href="${result.csfdUrl}" target="_blank" rel="noopener">Otevřít na ČSFD ↗</a>` +
      `</div>`;
  }
  parent.appendChild(host);
}

export function hasBadge(el: HTMLElement): boolean {
  return el.querySelector(`[${BADGE_ATTR}]`) != null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content/badge.ts
git commit -m "feat: badge rendering (small + large) in Shadow DOM"
```

---

## Task 19: Content script orchestrace

**Files:**
- Create: `src/content/index.ts`

- [ ] **Step 1: Implementace**

`src/content/index.ts`:
```typescript
import { SELECTORS } from "./netflix-selectors";
import { extractFromTile, extractFromBobCard, extractFromDetailModal } from "./extract-title";
import { renderSmallBadge, renderLargeBadge, hasBadge } from "./badge";
import { lookup } from "./lookup-client";

const PROCESSED = new WeakSet<HTMLElement>();

async function processTile(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el) || hasBadge(el)) return;
  const { title } = extractFromTile(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, null);
  renderSmallBadge(el, result);
}

async function processBobCard(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title, year } = extractFromBobCard(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, year);
  renderLargeBadge(el, result);
}

async function processDetailModal(el: HTMLElement): Promise<void> {
  if (PROCESSED.has(el)) return;
  const { title, year } = extractFromDetailModal(el);
  if (!title) return;
  PROCESSED.add(el);
  const result = await lookup(title, year);
  renderLargeBadge(el, result);
}

function scan(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.tile))) {
    void processTile(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.bobCard))) {
    void processBobCard(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.detailModal))) {
    void processDetailModal(el);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.searchResult))) {
    void processTile(el);  // search results = same shape as tile
  }
}

let pending: number | null = null;
function scheduleScan(): void {
  if (pending != null) return;
  pending = window.setTimeout(() => {
    pending = null;
    scan();
  }, 100);
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length === 0) continue;
    scheduleScan();
    return;
  }
});
observer.observe(document.body, { childList: true, subtree: true });

scan();
```

- [ ] **Step 2: Build a otestuj že nepadá**

Run: `npm run build`
Expected: PASS — bez TS errorů.

Run: `npm test`
Expected: všechny testy stále PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: content-script orchestration with MutationObserver"
```

---

## Task 20: Popup (on/off, clear cache)

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.ts`

- [ ] **Step 1: HTML**

`src/popup/popup.html`:
```html
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <title>Netflix × ČSFD</title>
  <style>
    body { font-family: system-ui, sans-serif; width: 240px; padding: 12px; margin: 0;
           background: #141414; color: #fff; }
    h1 { font-size: 14px; margin: 0 0 12px; }
    button { display: block; width: 100%; margin: 6px 0; padding: 8px; cursor: pointer;
             background: #ba0305; color: #fff; border: 0; border-radius: 4px; font-size: 13px; }
    button.ghost { background: transparent; border: 1px solid #444; }
    .status { font-size: 11px; color: #888; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Netflix × ČSFD</h1>
  <button id="toggle">Načítám…</button>
  <button id="clear" class="ghost">Vyčistit cache</button>
  <div class="status" id="status"></div>
  <script type="module" src="./popup.ts"></script>
</body>
</html>
```

- [ ] **Step 2: TS**

`src/popup/popup.ts`:
```typescript
const ENABLED_KEY = "settings:enabled";

async function getEnabled(): Promise<boolean> {
  const got = await chrome.storage.local.get(ENABLED_KEY);
  return got[ENABLED_KEY] !== false;
}

async function setEnabled(v: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: v });
}

const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLDivElement;

async function refresh(): Promise<void> {
  const on = await getEnabled();
  toggleBtn.textContent = on ? "Zapnuto — kliknutím vypnout" : "Vypnuto — kliknutím zapnout";
}

toggleBtn.addEventListener("click", async () => {
  await setEnabled(!(await getEnabled()));
  await refresh();
  status.textContent = "Reloadni Netflix tab.";
});

clearBtn.addEventListener("click", async () => {
  status.textContent = "Mažu…";
  await chrome.runtime.sendMessage({ type: "clear-cache" });
  status.textContent = "Cache vymazána.";
});

void refresh();
```

- [ ] **Step 3: Wire up enabled-flag do content scriptu**

Edit `src/content/index.ts` — na začátku přidej guard:

```typescript
async function isEnabled(): Promise<boolean> {
  const got = await chrome.storage.local.get("settings:enabled");
  return got["settings:enabled"] !== false;
}

(async () => {
  if (!(await isEnabled())) return;
  // existující kód: scan() + observer setup
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
```

(Přesuň `observer.observe` a `scan()` dovnitř IIFE; deklaraci `observer` ponech mimo.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/popup/ src/content/index.ts
git commit -m "feat: popup (on/off + clear cache) and enabled flag"
```

---

## Task 21: Privacy policy + README

**Files:**
- Create: `docs/PRIVACY.md`
- Create: `README.md`

- [ ] **Step 1: PRIVACY.md**

`docs/PRIVACY.md`:
```markdown
# Privacy Policy — Netflix × ČSFD

**Naposledy aktualizováno:** 2026-05-02

Toto rozšíření nesbírá, neuchovává ani neodesílá žádná osobní data o uživateli.

## Jaká data zpracovává

- **Lokálně v prohlížeči:** rozšíření čte z DOM stránky Netflix.com názvy a roky filmů/seriálů, které právě prohlížíš. Tyto názvy jsou použity pouze k vyhledání hodnocení na ČSFD.
- **Cache:** výsledky z ČSFD (rating, žánr, originální název, URL) se ukládají lokálně v `chrome.storage.local`. Cache neopouští tvé zařízení a nikam se neodesílá.

## Síťové požadavky

- `*.netflix.com` — pouze čtení DOMu na otevřené stránce; rozšíření neposílá data zpět Netflixu.
- `*.csfd.cz` — vyhledávací požadavky a fetch detailní stránky filmu; požadavky nejsou autentizované, neobsahují identifikátor uživatele.

## Co rozšíření **nedělá**

- Neposílá analytics, telemetrii ani jiná data třetí straně.
- Nepoužívá cookies pro tracking.
- Nepřistupuje k jiným tabům než Netflix.com.
- Nepřistupuje k souborům, kameře, mikrofonu ani jiným systémovým prostředkům.

## Kontakt

Issues a otázky: GitHub repository (URL doplnit po publikaci).
```

- [ ] **Step 2: README.md**

`README.md`:
```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/PRIVACY.md README.md
git commit -m "docs: privacy policy + README"
```

---

## Task 22: Manuální QA na Netflix.com

> **Bez automatizace — ruční ověření že rozšíření funguje. Toto je jediný "real-world" test pluginu před publikací.**

- [ ] **Step 1: Build a načtení**

```bash
npm run build
```

V Chromu: `chrome://extensions/` → *Developer mode* on → *Load unpacked* → `dist/`.

- [ ] **Step 2: Otevři netflix.com (přihlášený)**

- [ ] **Step 3: Browse grid — checklist**
  - Tile má červený badge s procenty vpravo nahoře.
  - Badge se zobrazuje na všech viditelných tilech do ~10 s (cache miss).
  - Druhý load Netflixu → badges téměř okamžitě (cache hit).
  - DevTools → Network: requesty na csfd.cz jsou rozumně řídké (žádný flood).

- [ ] **Step 4: Hover preview**
  - Najedi myší na tile → Bob card → uvnitř velký panel pod Netflix metadaty s `87 % ČSFD · 12 345 hodnocení · žánr · originální název · odkaz`.

- [ ] **Step 5: Detail modal**
  - Klikni na tile → otevře se modal → uvnitř velký panel.

- [ ] **Step 6: Search**
  - Vyhledej "Pulp Fiction" → tile výsledku má badge.

- [ ] **Step 7: Popup**
  - Klikni na ikonu rozšíření → toggle Vypnout → reload Netflix → žádné badges. Toggle Zapnout → reload → badges.
  - Klikni *Vyčistit cache* → další view stahuje znova z ČSFD.

- [ ] **Step 8: Service worker logy**
  - `chrome://extensions/` → *Service worker (Inspect)* → Console: žádné neošetřené errory (rate limit warnings povoleny).

- [ ] **Step 9: Pokud něco selže**

Nejčastější příčiny:
- **Žádné badges nikde**: zkontroluj `chrome://extensions/` errory; zkontroluj že content script je registrován (`Service worker (Inspect)` → Sources → content/index.js).
- **Netflix selektory neseděly**: otevři Netflix DevTools, najdi tile, prozkoumej DOM, uprav `src/content/netflix-selectors.ts` a/nebo `src/content/extract-title.ts`. Spusť `npm test`. Build, reload extension.
- **CSFD parser selhal**: stáhni reálnou HTML z `https://www.csfd.cz/hledat/?q=pulp+fiction` (pravým tlačítkem → *Save as* → HTML only), nahraď fixturu `tests/fixtures/csfd/search-pulp-fiction.html`, spusť testy. Pokud selžou, uprav selektory v `src/background/csfd-parser.ts`. Stejně pro detail page.

- [ ] **Step 10: Final commit po případných úpravách**

Pokud jsi musel opravovat selektory:
```bash
git add -p
git commit -m "fix: real-world Netflix/ČSFD selector adjustments"
```

---

## Self-review

**Spec coverage:**
- ✅ §1 Shrnutí — dosaženo Tasky 1-22.
- ✅ §2 Tech stack — Task 1, 3.
- ✅ §3 Architektura — Tasky 14, 19, 20.
- ✅ §3.1 Manifest — Task 2.
- ✅ §4 Životní cyklus — Tasky 14 (background) + 19 (content).
- ✅ §5 CSFD scraping & matching — Tasky 6-10.
- ✅ §6 Cache & throttling — Tasky 11-13.
- ✅ §7 UI / DOM injection — Tasky 15-19.
- ✅ §8 Struktura projektu — výše.
- ✅ §9 Privacy & ToS — Task 21.
- ✅ §10 Testování — testy v Task 4-13, 16; manuální QA v Task 22.
- §11 Open questions — explicitně mimo MVP.

**Type consistency:**
- `CSFDResult` je definován v Tasku 5, používá se v Taskách 11, 14, 17, 18 — stejné property names.
- `LookupRequest`/`LookupResponse` definovány Task 5, použity Task 14 (handler) a Task 17 (klient).
- `SearchCandidate` (Task 8) → mapuje se na `MatchInput` (Task 7) v Tasku 14.

**Placeholder scan:**
- Žádné TBD/TODO.
- Selektory CSFD a Netflix jsou syntetické a explicitně dokumentované jako "ověř proti reálnému HTML při QA" (Task 22 step 9).
- Ikony jsou explicitní 1×1 placeholder PNGs (Task 2 step 1) s plánem pozdější náhrady.
