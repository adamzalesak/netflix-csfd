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
  private setCount = 0;
  private static readonly EVICT_INTERVAL = 50;
  private static readonly EVICT_BUDGET = 4 * 1024 * 1024;

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
    this.setCount++;
    if (this.setCount % Cache.EVICT_INTERVAL === 0) {
      await this.maybeEvict(Cache.EVICT_BUDGET);
    }
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
