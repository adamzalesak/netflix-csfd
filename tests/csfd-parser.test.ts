import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSearchResults } from "../src/background/csfd-parser";

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures/csfd", name), "utf8");
}

describe("parseSearchResults", () => {
  it("extracts film candidates with title, year, url", () => {
    const html = loadFixture("search-pulp-fiction.html");
    const results = parseSearchResults(html);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Pulp Fiction: Historky z podsvětí",
      year: 1994,
      url: "https://www.csfd.cz/film/8364-pulp-fiction/historky-z-podsveti/",
    });
    expect(results[1]?.title).toBe("Different Movie");
    expect(results[1]?.year).toBe(2001);
  });

  it("returns empty array on no-results page", () => {
    const html = loadFixture("search-no-results.html");
    expect(parseSearchResults(html)).toEqual([]);
  });
});
