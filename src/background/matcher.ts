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
