import { normalizeTitle } from "../shared/normalize";
import type { LookupRequest, LookupResponse, CSFDResult } from "../shared/types";

export function makeKey(title: string, year: number | null): string {
  return `${normalizeTitle(title)}|${year ?? "?"}`;
}

export async function lookup(title: string, year: number | null): Promise<CSFDResult | null> {
  const req: LookupRequest = { type: "lookup", key: makeKey(title, year), title, year };
  try {
    const res: LookupResponse = await chrome.runtime.sendMessage(req);
    if (!res.ok) return null;
    return res.result;
  } catch (err) {
    console.warn("[CSFD] message channel error:", err);
    return null;
  }
}
