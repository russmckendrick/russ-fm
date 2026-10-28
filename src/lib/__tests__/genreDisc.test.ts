import { describe, expect, it } from "vitest";
import { DISC, hitDisc, layoutDisc } from "../genreDisc";
import { familyOf } from "../genreFamilies";

describe("layoutDisc", () => {
  const sizes = [586, 464, 354, 217, 253, 82, 105, 264, 290, 98, 361, 645];
  const layout = layoutDisc(sizes);

  it("places every record exactly once", () => {
    layout.slices.forEach((slice, i) => {
      const placed = slice.rows.reduce((sum, row) => sum + row.count, 0);
      expect(placed).toBe(sizes[i]);
      slice.rows.forEach((row, r) => {
        const before = slice.rows.slice(0, r).reduce((sum, x) => sum + x.count, 0);
        expect(row.first).toBe(before);
      });
    });
  });

  it("keeps the music between the rim and the label, inside each slice", () => {
    for (const slice of layout.slices) {
      for (const row of slice.rows) {
        expect(row.r).toBeLessThanOrEqual(DISC.music + 1e-9);
        expect(row.r - layout.pitch / 2).toBeGreaterThan(DISC.label);
        expect(row.start).toBeGreaterThanOrEqual(slice.a0 - 1e-9);
        expect(row.start + row.count * row.step).toBeLessThanOrEqual(slice.a1 + 1e-9);
      }
    }
  });

  it("still fits a collection twice the size", () => {
    const big = layoutDisc(sizes.map((n) => n * 2));
    big.slices.forEach((slice, i) => {
      expect(slice.rows.reduce((sum, row) => sum + row.count, 0)).toBe(sizes[i] * 2);
    });
  });

  it("finds the tile under a point", () => {
    const slice = layout.slices[3];
    const row = slice.rows[1];
    const a = row.start + row.step * 2.5;
    const hit = hitDisc(layout, Math.cos(a) * row.r, Math.sin(a) * row.r, null, 0);
    expect(hit).toEqual({ slice: 3, index: row.first + 2 });
    expect(hitDisc(layout, 0, 0, null, 0)).toBeNull();
  });
});

describe("familyOf", () => {
  it("files a record by its first claimed style, then its genre names", () => {
    expect(familyOf({ styles: ["Prog Rock", "Alternative Rock"], genre_names: ["Rock"] })).toBe("prog");
    expect(familyOf({ styles: ["Unknown Style"], genre_names: ["Electronic"] })).toBe("elec");
    expect(familyOf({ styles: [], genre_names: ["Rock"] })).toBe("hard");
  });
});
