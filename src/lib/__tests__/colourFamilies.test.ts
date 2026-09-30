import { describe, expect, it } from "vitest";
import type { AlbumColorPalette } from "@/hooks/useAlbumColors";
import { familyJumps } from "../colourFamilies";
import { colourFamily } from "../sleeveColour";

const pal = (flood: string, hueDeg: number, vivid = 1): AlbumColorPalette => ({
  v: 2, flood, ink: "#0e0d0c", ground: "#1c1916", glow: flood, secondary: null, hue: hueDeg / 360, vivid,
});

describe("colourFamily", () => {
  it("names bold sleeves by hue, wrapping pink round both ends", () => {
    expect(colourFamily(pal("#df327c", 5))).toBe("pink");
    expect(colourFamily(pal("#fd42c0", 340))).toBe("pink");
    expect(colourFamily(pal("#d04b43", 27))).toBe("red");
    expect(colourFamily(pal("#e5912f", 60))).toBe("orange");
    expect(colourFamily(pal("#dcb807", 95))).toBe("yellow");
    expect(colourFamily(pal("#5caa5f", 140))).toBe("green");
    expect(colourFamily(pal("#01929c", 200))).toBe("teal");
    expect(colourFamily(pal("#29519c", 255))).toBe("blue");
    expect(colourFamily(pal("#775791", 300))).toBe("purple");
  });

  it("puts monochrome sleeves and missing palettes in mono", () => {
    expect(colourFamily(pal("#d2d5df", 250, 0))).toBe("mono");
    expect(colourFamily(undefined)).toBe("mono");
  });
});

describe("familyJumps", () => {
  it("finds where each family starts and how many records it has, in list order", () => {
    const colours = {
      a: pal("#df327c", 5),
      b: pal("#d04b43", 27),
      c: pal("#f21e24", 30),
      d: pal("#29519c", 255),
      e: pal("#fd42c0", 340),
      f: pal("#d2d5df", 0, 0),
    };
    const jumps = familyJumps(["a", "b", "c", "d", "e", "f", "missing"], colours);
    expect(jumps.map(j => [j.id, j.index, j.count])).toEqual([
      ["pink", 0, 2],
      ["red", 1, 2],
      ["blue", 3, 1],
      ["mono", 5, 2],
    ]);
  });
});
