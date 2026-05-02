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
