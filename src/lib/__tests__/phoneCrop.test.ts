import { describe, expect, it } from "vitest";
import { phoneCrop, type ArtistFanart } from "../artistImage";

/** A 1280×720 fanart with these face boxes ([x, y, w, h] fractions); columns run dark (left) to light (right). */
const fanart = (faces: ArtistFanart["faces"], columns?: string[]): ArtistFanart => ({
  file: "band-fanart01.jpg",
  width: 1280,
  height: 720,
  faces,
  people: [],
  salient: null,
  chroma: 0.3,
  columns: columns ?? Array.from({ length: 32 }, (_, i) => `#${(i * 8).toString(16).padStart(2, "0").repeat(3)}`),
});

describe("phoneCrop", () => {
  it("slides a wide photo across to centre the faces and floods from the bottom of what shows", () => {
    // Faces on the right of a 16:9 photo; bottoms dark on the left, light on the right.
    const wide = { ...fanart([[0.7, 0.3, 0.1, 0.2]]), bottoms: Array.from({ length: 32 }, (_, i) => (i < 16 ? "#000000" : "#ffffff")) };
    const c = phoneCrop(wide, 4 / 5);
    const x = Number(/^(\d+)%/.exec(c.position)?.[1]);
    expect(x).toBeGreaterThan(80);
    expect(c.flood).toBe("#ffffff");
    // Faces on the left: slid the other way.
    expect(Number(/^(\d+)%/.exec(phoneCrop(fanart([[0.1, 0.3, 0.1, 0.2]]), 4 / 5).position)?.[1])).toBeLessThan(10);
  });

  it("keeps a narrow photo's full width and has no flood without bottom colours", () => {
    const tall = { ...fanart([[0.4, 0.1, 0.2, 0.15]]), width: 600, height: 900 };
    const c = phoneCrop(tall, 4 / 5);
    expect(c.position.startsWith("50% ")).toBe(true);
    expect(c.flood).toBeNull();
  });
});
