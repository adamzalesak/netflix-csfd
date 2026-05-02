const CSFD_BASE = "https://www.csfd.cz";

export type FetchFn = (url: string) => Promise<{ status: number; body: string }>;

export const realFetch: FetchFn = async (url) => {
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
    credentials: "include",
  });
  const body = await res.text();
  return { status: res.status, body };
};

export function isAntiBotChallenge(body: string): boolean {
  return body.includes("anubis_challenge") || body.includes("Making sure you");
}

export function searchUrl(title: string): string {
  return `${CSFD_BASE}/hledat/?q=${encodeURIComponent(title)}`;
}
