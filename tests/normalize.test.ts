import { describe, it, expect } from "vitest";
import { normalizeTitle } from "../src/shared/normalize";

describe("normalizeTitle", () => {
  it("lowercases", () => {
    expect(normalizeTitle("Pulp Fiction")).toBe("pulp fiction");
  });

  it("strips diacritics", () => {
    expect(normalizeTitle("Žluťoučký kůň")).toBe("zlutoucky kun");
  });

  it("removes year in parens", () => {
    expect(normalizeTitle("Inception (2010)")).toBe("inception");
  });

  it("strips Season N suffix", () => {
    expect(normalizeTitle("Stranger Things Season 4")).toBe("stranger things");
    expect(normalizeTitle("The Crown Series 5")).toBe("the crown");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  Pulp   Fiction  ")).toBe("pulp fiction");
  });

  it("strips punctuation but keeps colons", () => {
    expect(normalizeTitle("Sherlock Holmes: A Game of Shadows!"))
      .toBe("sherlock holmes a game of shadows");
  });

  it("strips any parenthetical content (CSFD often tags variants)", () => {
    expect(normalizeTitle("Papírový dům (Netflix verze)")).toBe("papirovy dum");
    expect(normalizeTitle("The Office (US)")).toBe("the office");
    expect(normalizeTitle("Some Show (TV seriál)")).toBe("some show");
  });
});
