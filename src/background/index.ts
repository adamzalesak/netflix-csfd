import { Cache } from "./cache";
import { ThrottleQueue } from "./queue";
import { realFetch, searchUrl, isAntiBotChallenge } from "./csfd-fetcher";
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
  if (cached !== undefined) {
    console.log("[CSFD] cache hit", req.title, "→", cached ? `${cached.rating}%` : "no-match");
    return { ok: true, result: cached };
  }

  if (queue.isCircuitOpen()) {
    console.warn("[CSFD] circuit open, skip", req.title);
    return { ok: false, error: "circuit-open" };
  }

  try {
    const result = await queue.run(req.key, async () => doLookup(req));
    if (result) await cache.set(req.key, result);
    else await cache.setNegative(req.key);
    return { ok: true, result };
  } catch (err) {
    console.error("[CSFD] lookup failed", req.title, err);
    return { ok: false, error: String(err) };
  }
}

async function doLookup(req: LookupRequest): Promise<CSFDResult | null> {
  const url = searchUrl(req.title);
  console.log("[CSFD] search", req.title, req.year, "→", url);
  const search = await realFetch(url);
  console.log("[CSFD] search response", search.status, "bodyLen=", search.body.length);

  if (search.status === 429 || search.status === 503) {
    consecutiveRateLimits++;
    if (consecutiveRateLimits >= CIRCUIT_TRIP) queue.openCircuit(CIRCUIT_DURATION_MS);
    throw new Error(`rate-limited:${search.status}`);
  }
  consecutiveRateLimits = 0;
  if (search.status !== 200) throw new Error(`search:${search.status}`);
  if (isAntiBotChallenge(search.body)) {
    console.warn("[CSFD] anti-bot challenge detected — first 300 chars:", search.body.slice(0, 300));
    queue.openCircuit(CIRCUIT_DURATION_MS);
    throw new Error("anti-bot-challenge");
  }

  const rawCandidates = parseSearchResults(search.body);
  console.log("[CSFD] parsed", rawCandidates.length, "candidates", rawCandidates.slice(0, 3));
  if (rawCandidates.length === 0) {
    const bodyStart = search.body.indexOf("<body");
    const sample = bodyStart >= 0 ? search.body.slice(bodyStart, bodyStart + 3000) : "(no <body)";
    console.warn("[CSFD] zero candidates — body sample:\n" + sample);
    const filmLinks = search.body.match(/<a[^>]+href="\/film\/[^"]+"[^>]*>[^<]{0,200}<\/a>/g);
    console.warn("[CSFD] film links found:", filmLinks?.slice(0, 3));
  }

  const candidates = rawCandidates.map(c => ({
    titleNormalized: normalizeTitle(c.title),
    year: c.year,
    payload: c,
  }));
  const queryNorm = { titleNormalized: normalizeTitle(req.title), year: req.year };
  const best = pickBestMatch(queryNorm, candidates, 0.6);
  console.log("[CSFD] best match", req.title, "→", best?.payload ?? "none");
  if (!best) return null;

  console.log("[CSFD] detail fetch", best.payload.url);
  const detail = await realFetch(best.payload.url);
  console.log("[CSFD] detail response", detail.status, "bodyLen=", detail.body.length);
  if (detail.status !== 200) throw new Error(`detail:${detail.status}`);
  if (isAntiBotChallenge(detail.body)) {
    queue.openCircuit(CIRCUIT_DURATION_MS);
    throw new Error("anti-bot-challenge-detail");
  }
  const parsed = parseDetailPage(detail.body);
  console.log("[CSFD] detail parsed", parsed);
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
