import { describe, expect, it } from "vitest";
import { heroPhotoLayout as fanartLayout, heroPhotoOf, phoneCrop, type ArtistFanart, type ArtistImageInfo } from "../artistImage";

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

const HERO = 668;

/** Where the faces (plus room for hair) end on screen, measured from the photo's page edge. */
const facesEnd = (f: ArtistFanart, l: ReturnType<typeof fanartLayout>) => {
  const right = Math.max(...f.faces.map((b) => (l.side === "left" ? b[0] + b[2] * 1.35 : 1 - b[0] + b[2] * 0.35)));
  return l.offset + right * l.width;
};

describe("heroPhotoLayout", () => {
  it("puts the photo on its people's side and the text past the last face", () => {
    const left = fanart([[0.15, 0.3, 0.12, 0.2], [0.35, 0.32, 0.12, 0.2]]);
    const l = fanartLayout(left, 1440, HERO);
    expect(l.side).toBe("left");
    expect(l.textStart).toBeGreaterThanOrEqual(facesEnd(left, l));
    expect(l.fadeTo + l.offset).toBeLessThanOrEqual(l.textStart + 60);

    const right = fanart([[0.6, 0.3, 0.12, 0.2], [0.78, 0.32, 0.12, 0.2]]);
    expect(fanartLayout(right, 1440, HERO).side).toBe("right");
  });

  it("keeps a wide band of faces clear of the text where the page allows", () => {
    // Four faces across most of the photo (Mastodon's fanart).
    const wide = fanart([[0.219, 0.279, 0.167, 0.296], [0.429, 0.109, 0.153, 0.273], [0.606, 0.288, 0.163, 0.289], [0.424, 0.574, 0.153, 0.272]]);
    for (const viewW of [1280, 1440, 1920]) {
      const l = fanartLayout(wide, viewW, HERO);
      expect(l.offset).toBeLessThanOrEqual(0);
      expect(facesEnd(wide, l)).toBeLessThanOrEqual(l.textStart);
      // The outermost face stays on the page.
      expect(l.offset + Math.min(...wide.faces.map((b) => (l.side === "left" ? b[0] : 1 - b[0] - b[2]))) * l.width).toBeGreaterThanOrEqual(0);
    }
    // At the narrowest desktop the text column gives way, but never below 320px.
    const narrow = fanartLayout(wide, 1024, HERO);
    expect(1024 - 56 - narrow.textStart).toBeGreaterThanOrEqual(320);
  });

  it("is always the flood's full height and centres the faces beside the text", () => {
    const one = fanart([[0.35, 0.3, 0.1, 0.2]]);
    const l = fanartLayout(one, 1440, HERO);
    expect(l.height).toBe(HERO);
    const mid = l.offset + (0.35 + 0.05) * l.width;
    expect(Math.abs(mid - (l.textStart - 40) / 2)).toBeLessThan(2);
    // A face near the photo's outer edge can't come further in than the page edge allows.
    expect(fanartLayout(fanart([[0.12, 0.3, 0.1, 0.2]]), 1440, HERO).offset).toBe(0);
    // The same text column for every artist.
    expect(fanartLayout(fanart([[0.3, 0.6, 0.08, 0.15]]), 1440, HERO).textStart).toBe(l.textStart);
  });

  it("takes the flood from the photo's own colour where it fades out", () => {
    // Left photo fading out mid-way: the flood is one of the grey strips in between, not either end.
    const l = fanartLayout(fanart([[0.1, 0.3, 0.1, 0.2]]), 1440, HERO);
    expect(l.flood).toMatch(/^#([0-9a-f]{2})\1\1$/);
    const grey = parseInt(l.flood.slice(1, 3), 16);
    expect(grey).toBeGreaterThan(0);
    expect(grey).toBeLessThan(248);
  });
});

describe("heroPhotoOf", () => {
  const info = (extra: Partial<ArtistImageInfo>) =>
    ({ v: 5, width: 1000, height: 1000, faces: [[0.4, 0.2, 0.2, 0.2]], people: [], subject: [0.3, 0.1, 0.7, 0.9], focus: null, ...extra }) as ArtistImageInfo;

  it("prefers the fanart, then the artist's own photo, and leaves older notes alone", () => {
    expect(heroPhotoOf(info({ columns: ["#000000"], fanart: fanart([]) }))?.fanart).toBe("band-fanart01.jpg");
    const own = heroPhotoOf(info({ columns: ["#000000"] }));
    expect(own?.fanart).toBeNull();
    [0.3, 0.1, 0.4, 0.8].forEach((v, i) => expect(own?.photo.salient?.[i]).toBeCloseTo(v));
    expect(heroPhotoOf(info({}))).toBeNull();
  });
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
