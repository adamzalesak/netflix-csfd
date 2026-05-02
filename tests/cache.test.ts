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
