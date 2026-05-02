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
