import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractFromTile, extractFromBobCard, extractFromDetailModal } from "../src/content/extract-title";

function loadDom(): Document {
  const html = readFileSync(resolve(__dirname, "fixtures/netflix/tile-grid.html"), "utf8");
  document.body.innerHTML = html;
  return document;
}

describe("extract title", () => {
  beforeEach(() => loadDom());

  it("extractFromTile returns title without year", () => {
    const tile = document.querySelector(".title-card-container") as HTMLElement;
    expect(extractFromTile(tile)).toEqual({ title: "Pulp Fiction", year: null });
  });

  it("extractFromBobCard returns title + year", () => {
    const card = document.querySelector(".bob-card") as HTMLElement;
    expect(extractFromBobCard(card)).toEqual({ title: "Inception", year: 2010 });
  });

  it("extractFromDetailModal returns title + year", () => {
    const modal = document.querySelector(".detail-modal") as HTMLElement;
    expect(extractFromDetailModal(modal)).toEqual({ title: "The Dark Knight", year: 2008 });
  });

  it("returns null title when not found", () => {
    document.body.innerHTML = "<div></div>";
    const empty = document.querySelector("div") as HTMLElement;
    expect(extractFromTile(empty)).toEqual({ title: null, year: null });
  });
});
