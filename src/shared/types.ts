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
