import config from "@/config/vinyl-colours.json";
import { describe, expect, it } from "vitest";
import { colourTags, discLook, discLooks, lookAt, pressingDiscs, pressingExtras, pressingTitle, vinylLook } from "../vinylLook";

describe("vinylLook", () => {
  it("leaves black, empty and unrecognised text as a black disc", () => {
    expect(vinylLook(undefined)).toBeNull();
    expect(vinylLook("  ")).toBeNull();
    expect(vinylLook("Black")).toBeNull();
    expect(vinylLook("Honey Vinyl")).toBeNull();
  });

  it("draws a colour Discogs does not name as a mix, never as black", () => {
    for (const text of ["Coloured", "Tri-Color", "Multi-Coloured [Recycled]", "Eco-Mix", "Marbled", "Venetian Marble", "Opaque"]) {
      const look = vinylLook(text);
      expect(look, text).not.toBeNull();
      expect(look?.pattern, text).toContain("radial-gradient(ellipse");
    }
    expect(vinylLook("Splatter")?.body).toContain("rgba(255, 255, 255");
    expect(vinylLook("Splatter")?.pattern).toContain("data:image/svg+xml");
    expect(vinylLook("Smokey")?.pattern).toContain("rgba(0, 0, 0, 0.42)");
  });

  it("draws Sparkle as black with silver flakes", () => {
    const look = vinylLook("Sparkle");
    expect(look?.body).toContain("#0b0b0b");
    expect(look?.pattern).toContain("data:image/svg+xml");
    expect(look?.pattern).toContain("feTurbulence");
    expect(look?.rim).toBe("#000");
    // A colour keeps its colour and gains the flakes.
    expect(vinylLook("Red Sparkle")?.body).toContain("#c81d25");
    expect(vinylLook("Red Sparkle")?.pattern).toContain("data:image/svg+xml");
    expect(vinylLook("Black Ice Glitter")?.body).toContain("#0b0b0b");
  });

  it("draws swirl as flowing warped bands, not blobs", () => {
    const look = vinylLook("Black/White Swirl");
    expect(look?.body).toContain("#0b0b0b");
    expect(look?.pattern).toContain("data:image/svg+xml");
    expect(look?.pattern).toContain("feDisplacementMap");
    expect(look?.pattern).toContain("%23f1eee6");
    expect(look?.pattern).not.toContain("radial-gradient(ellipse");
    expect(vinylLook("Psychedelic Swirl")?.pattern).toContain("feDisplacementMap");
  });

  it("makes Flame up as splatter in flame colours", () => {
    const flame = vinylLook("Flame");
    expect(flame?.body).toContain("#c4381a");
    expect(flame?.pattern).toContain("data:image/svg+xml");
    expect(flame?.pattern).toContain("%23f7931e");
    expect(vinylLook("Flaming Coloured")?.body).toContain("#c4381a");
    // A named colour stays the base and gains the flame streaks.
    const yellow = vinylLook("Yellow Flame");
    expect(yellow?.body).toContain("#f0c419");
    expect(yellow?.pattern).toContain("%23f7931e");
    // A flamingo is not a flame: it stays plain glass with no pattern.
    expect(vinylLook("Neon Flamingo Translucent")?.pattern).toBeUndefined();
  });

  it("knows pearl, sunrise and emerald, and finish words in brackets", () => {
    const pearl = vinylLook("Pearl Sunrise Coloured");
    expect(pearl?.body).toContain("#efe9dc");
    expect(pearl?.pattern).toContain("radial-gradient(ellipse");
    expect(pearl?.pattern).toContain("conic-gradient");
    expect(vinylLook("Emerald [Translucent]")?.body).toContain("rgba(15, 122, 74");
    expect(vinylLook("Transparent Black")?.body).toContain("rgba(11, 11, 11");
  });

  it("paints a solid colour with a darker edge and no pattern", () => {
    const red = vinylLook("Red");
    expect(red?.body).toContain("#c81d25");
    expect(red?.pattern).toBeUndefined();
    expect(red?.rim).toBe("#000");
  });

  it("lets a translucent colour show what is behind it", () => {
    const look = vinylLook("Blue Translucent");
    expect(look?.body).toContain("rgba(31, 79, 181");
    expect(look?.rim).toContain("255, 255, 255");
  });

  it("draws clear and bare transparent vinyl as glass", () => {
    for (const text of ["Clear", "Crystal Clear", "Transparent", "Cloudy Clear Vinyl"]) {
      const look = vinylLook(text);
      expect(look?.body, text).toContain("rgba(255, 255, 255");
      expect(look?.pattern, text).toBeUndefined();
    }
  });

  it("reads a colour after Clear as tinted glass, not a pattern", () => {
    const look = vinylLook("Clear Blue");
    expect(look?.body).toContain("rgba(31, 79, 181");
    expect(look?.pattern).toBeUndefined();
    expect(vinylLook("Coke Bottle Clear")?.pattern).toBeUndefined();
  });

  it("builds marble, splatter, split and smoke patterns from the accent colours", () => {
    expect(vinylLook("Yellow And Black Marble [Memphis Dust]")?.pattern).toContain("radial-gradient(ellipse");
    const splatter = vinylLook("Clear w/ Red Splatter")?.pattern;
    expect(splatter).toContain("data:image/svg+xml");
    expect(splatter).toContain("%23c81d25");
    expect(vinylLook("Blue/Black Split")?.pattern).toContain("linear-gradient(90deg");
    expect(vinylLook("Red Smoke")?.pattern).toContain("rgba(0, 0, 0, 0.42)");
    // Two colours and no pattern word are taken as a mix.
    expect(vinylLook("Red / Blue")?.pattern).toContain("radial-gradient");
  });

  it("gives a single-colour pattern its own light and dark shades", () => {
    expect(vinylLook("Red Marbled")?.pattern).toContain("rgba(");
    expect(vinylLook("Black Splatter")?.pattern).toContain("data:image/svg+xml");
  });

  it("falls back to a bracketed description only when the rest names no colour", () => {
    expect(vinylLook("Splatter [Green Transparent with Dark Green & White Splatter]")).not.toBeNull();
  });

  it("shades a colour by Light / Dark, before it or as a trailing bracket", () => {
    const plain = vinylLook("Blue")?.body;
    expect(vinylLook("Light Blue")?.body).not.toEqual(plain);
    expect(vinylLook("Blue [Light]")).toEqual(vinylLook("Light Blue"));
    expect(vinylLook("Dark Green")?.body).not.toEqual(vinylLook("Green")?.body);
    expect(vinylLook("Blue [Light]")?.groove).toBe("rgba(255, 255, 255, 0.045)");
  });

  it("gives metallic and rainbow pressings a sheen", () => {
    expect(vinylLook("Gold")?.pattern).toContain("conic-gradient");
    expect(vinylLook("Rainbow")?.pattern).toContain("#e5322d");
  });

  it("uses dark groove ink on light discs and light ink on dark ones", () => {
    expect(vinylLook("White")?.groove).toBe("rgba(0, 0, 0, 0.1)");
    expect(vinylLook("Purple")?.groove).toBe("rgba(255, 255, 255, 0.045)");
  });

  it("always draws the same pattern for the same text", () => {
    expect(vinylLook("Green Marbled")).toEqual(vinylLook("Green Marbled"));
    expect(vinylLook("Green Marbled")?.pattern).not.toEqual(vinylLook("Orange Marbled")?.pattern);
  });
});

describe("discLook", () => {
  it("uses one colour for every disc of the set", () => {
    expect(discLook(["Red"], 0)).toEqual(discLook(["Red"], 3));
  });

  it("takes one colour per disc, the last carrying on", () => {
    const colours = ["Red", "Yellow"];
    expect(discLook(colours, 0)).toEqual(vinylLook("Red"));
    expect(discLook(colours, 1)).toEqual(vinylLook("Yellow"));
    expect(discLook(colours, 5)).toEqual(vinylLook("Yellow"));
  });

  it("is null without colours", () => {
    expect(discLook(undefined, 0)).toBeNull();
    expect(discLook([], 0)).toBeNull();
  });
});

describe("pressingDiscs", () => {
  const glastonbury = [
    { name: "Vinyl", qty: "1", colour: "Yellow Transparent" },
    { name: "Vinyl", qty: "1", colour: "Blue Transparent" },
    { name: "All Media", qty: "1", colour: null },
  ];

  it("gives each disc its own colour, one entry per disc set", () => {
    expect(pressingDiscs(glastonbury, ["Yellow Transparent", "Blue Transparent"])).toEqual(["Yellow Transparent", "Blue Transparent"]);
  });

  it("repeats an entry's colour for each disc of its qty and keeps black discs as null", () => {
    const details = [
      { name: "Vinyl", qty: "2", colour: "Red" },
      { name: "Vinyl", qty: "1", colour: null },
    ];
    expect(pressingDiscs(details, ["Red"])).toEqual(["Red", "Red", null]);
  });

  it("reads one disc per colour when there are no details (the collection index)", () => {
    expect(pressingDiscs(undefined, ["Red", "Yellow"])).toEqual(["Red", "Yellow"]);
  });

  it("is empty when no disc is coloured, so black sets keep one record", () => {
    expect(pressingDiscs([{ name: "Vinyl", qty: "2", colour: null }], [])).toEqual([]);
    expect(pressingDiscs(undefined, undefined)).toEqual([]);
  });
});

describe("discLooks / lookAt", () => {
  it("looks up each disc and carries the last one on", () => {
    const looks = discLooks(["Red", null, "Blue"]);
    expect(looks).toHaveLength(3);
    expect(looks[1]).toBeNull();
    expect(lookAt(looks, 0)).toEqual(vinylLook("Red"));
    expect(lookAt(looks, 9)).toEqual(vinylLook("Blue"));
    expect(lookAt([], 0)).toBeNull();
  });
});

describe("pressingExtras", () => {
  it("keeps what the text says besides the colour", () => {
    expect(pressingExtras("Red Smoke, 180 Gram", "Red Smoke")).toEqual(["180 Gram"]);
    expect(pressingExtras("Clear With Yellow & Brown Splatter, 140g", "Clear With Yellow & Brown Splatter")).toEqual(["140g"]);
    expect(pressingExtras("White - 25th Anniversary", "White")).toEqual(["25th Anniversary"]);
  });

  it("keeps every part when there is no colour", () => {
    expect(pressingExtras("Gatefold, 180g", null)).toEqual(["Gatefold", "180g"]);
  });

  it("drops parts the colour already covers", () => {
    expect(pressingExtras("Yellow, Transparent", "Yellow Transparent")).toEqual([]);
    expect(pressingExtras("Blue [Light]", "Blue [Light]")).toEqual([]);
  });

  it("is empty without text", () => {
    expect(pressingExtras(null, "Red")).toEqual([]);
    expect(pressingExtras("", null)).toEqual([]);
  });
});

describe("colourTags", () => {
  it("puts plain colours in their hue family", () => {
    expect(colourTags("Red")).toEqual(["Red"]);
    expect(colourTags("Blue Translucent")).toEqual(["Blue"]);
    expect(colourTags("Turquoise")).toEqual(["Blue"]);
    expect(colourTags("Mint Green")).toEqual(["Green"]);
    expect(colourTags("Hot Pink")).toEqual(["Pink"]);
    expect(colourTags("Cream")).toEqual(["White"]);
    expect(colourTags("Orange")).toEqual(["Orange"]);
    expect(colourTags("Violet")).toEqual(["Purple"]);
  });

  it("tags clear glass, metallics and rainbow on their own", () => {
    expect(colourTags("Clear")).toEqual(["Clear"]);
    expect(colourTags("Crystal Clear")).toEqual(["Clear"]);
    expect(colourTags("Transparent")).toEqual(["Clear"]);
    expect(colourTags("Gold")).toEqual(["Gold & silver"]);
    expect(colourTags("Rainbow")).toEqual(["Rainbow"]);
  });

  it("adds the pattern and every colour named", () => {
    expect(colourTags("Clear With Red Splatter").sort()).toEqual(["Clear", "Red", "Splatter"]);
    expect(colourTags("Yellow And Black Marble [Memphis Dust]").sort()).toEqual(["Marbled", "Yellow"]);
    expect(colourTags("Blue/Black Split").sort()).toEqual(["Blue", "Split"]);
    expect(colourTags("Red / Blue").sort()).toEqual(["Blue", "Marbled", "Red"]);
  });

  it("tags flame as orange and red splatter", () => {
    expect(colourTags("Flame").sort()).toEqual(["Orange", "Red", "Splatter"]);
    expect(colourTags("Yellow Flame").sort()).toEqual(["Orange", "Red", "Splatter", "Yellow"]);
  });

  it("tags sparkle and unspecified colours", () => {
    expect(colourTags("Sparkle")).toEqual(["Sparkle"]);
    expect(colourTags("Tri-Color")).toEqual(["Multicolour"]);
    // Two colours and no pattern word are drawn (and so tagged) as a marble.
    expect(colourTags("Pearl Sunrise Coloured").sort()).toEqual(["Marbled", "Orange", "White"]);
  });

  it("has nothing for black or empty text", () => {
    expect(colourTags("Black")).toEqual([]);
    expect(colourTags(null)).toEqual([]);
  });
});

describe("pressingTitle", () => {
  it("leads with the colour and keeps the rest as extras", () => {
    expect(pressingTitle("Red Smoke, 180 Gram", "Red Smoke")).toEqual({ title: "Red Smoke", extras: ["180 Gram"] });
  });

  it("calls a disc black only when nothing says otherwise", () => {
    expect(pressingTitle(null, null)).toEqual({ title: "Black", extras: [] });
    expect(pressingTitle("Gatefold, 180g", null)).toEqual({ title: "Black", extras: ["Gatefold", "180g"] });
    expect(pressingTitle("Crimson Nebula Edition", null).title).toBe("Black");
  });

  it("shows Discogs' own wording when the colour is not recognised", () => {
    expect(pressingTitle("Flame Vinyl", null)).toEqual({ title: "Flame Vinyl", extras: [] });
    expect(pressingTitle("Honey, 180g", null)).toEqual({ title: "Honey", extras: ["180g"] });
  });
});

describe("vinyl-colours.json", () => {
  const hex = /^#[0-9a-f]{6}$/i;

  it("holds valid colours, one lower-case word each", () => {
    for (const [word, colour] of Object.entries(config.colours)) {
      expect(word, word).toMatch(/^[a-z]+$/);
      expect(colour, word).toMatch(hex);
    }
    for (const [phrase, colour] of Object.entries(config.phrases)) {
      expect(phrase, phrase).toMatch(/^[a-z]+ [a-z]+$/);
      expect(colour, phrase).toMatch(hex);
    }
    expect(config.colours[config.standard as keyof typeof config.colours]).toBeTruthy();
    for (const colour of [config.flame.base, ...config.flame.accents, config.mixed.base, ...config.mixed.accents]) expect(colour).toMatch(hex);
  });

  it("compiles every pattern, generic and known-note expression", () => {
    for (const pattern of [...config.generic, config.knownNotes]) expect(() => new RegExp(pattern, "i")).not.toThrow();
    expect(Object.keys(config.patterns)).toEqual(["marble", "swirl", "splatter", "flake", "split", "smoke", "rainbow"]);
  });

  it("names each family once and has a tag for every pattern it filters by", () => {
    const names = config.families.map(f => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const key of Object.keys(config.patternTags)) expect(config.patterns).toHaveProperty(key);
  });
});
