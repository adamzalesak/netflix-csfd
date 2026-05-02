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
