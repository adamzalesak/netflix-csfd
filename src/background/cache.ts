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
