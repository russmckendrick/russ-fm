import { describe, expect, it } from "vitest";
import { pressing, vinyl } from "../../../scripts/lib/wrapped-story";

describe("wrapped story: vinyl()", () => {
  it("reads a plain colour and keeps the Discogs text", () => {
    expect(vinyl("Red (Battery Brick)")).toEqual({ n: "Red (Battery Brick)", hex: ["#c81d25"], glass: false, see: false, pat: null });
  });

  it("marks clear as glass and translucent as see-through", () => {
    expect(vinyl("Clear")).toMatchObject({ glass: true, see: true });
    expect(vinyl("Blue Translucent")).toMatchObject({ glass: false, see: true, hex: ["#1f4fb5"] });
  });

  it("finds the pattern and up to three colours", () => {
    expect(vinyl("Yellow And Red Marble")).toMatchObject({ pat: "marble", hex: ["#f0c419", "#c81d25"] });
  });

  it("returns null for black and for text that names no colour", () => {
    expect(vinyl("Black")).toBeNull();
    expect(vinyl("180 Gram")).toBeNull();
  });
});

describe("wrapped story: pressing()", () => {
  it("counts discs and uses the pressing weight Discogs gives", () => {
    expect(pressing([{ name: "Vinyl", qty: "2", descriptions: ["LP", "Album"], text: "180g" }])).toEqual({ discs: 2, size: '12"', grams: 360 });
  });

  it("falls back to 140 g a 12\" and 42 g a 7\"", () => {
    expect(pressing([{ name: "Vinyl", qty: "1", descriptions: ["LP"] }])).toEqual({ discs: 1, size: '12"', grams: 140 });
    expect(pressing([{ name: "Vinyl", qty: "1", descriptions: ['7"', "Single"] }])).toEqual({ discs: 1, size: '7"', grams: 42 });
  });

  it("ignores CDs and treats a record with no vinyl entry as one 12\"", () => {
    expect(pressing([{ name: "CD", qty: "1" }])).toEqual({ discs: 1, size: '12"', grams: 140 });
  });
});
