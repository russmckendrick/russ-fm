import { describe, expect, it } from "vitest";
import { buildStats, ownerOf, reprField, reprTags, specsOf, type AlbumJson, type CollectionEntry } from "../../../scripts/lib/stats-data";
import { pickHolders } from "../statsShelf";

const LASTFM = "LastFmData(mbid='x', url='https://www.last.fm/music/A/B', playcount=24246137, listeners=1049336, tags=['thrash metal', 'Metal', \"rock 'n' roll\"], bio=None)";

describe("stats data: repr parsing", () => {
  it("reads numbers, quoted text and None from the scrapper's service strings", () => {
    expect(reprField(LASTFM, "playcount")).toBe("24246137");
    expect(reprField(LASTFM, "url")).toBe("https://www.last.fm/music/A/B");
    expect(reprField(LASTFM, "bio")).toBeNull();
    expect(reprField(undefined, "playcount")).toBeNull();
  });

  it("reads the tag list, lower-cased", () => {
    expect(reprTags(LASTFM)).toEqual(["thrash metal", "metal", "rock 'n' roll"]);
  });
});

describe("stats data: ownerOf()", () => {
  it("files the majors by their labels and the rest as independent", () => {
    expect(ownerOf("℗ 2017 Blackened Recordings Inc., under exclusive licence to Universal International Music B.V.")).toBe("Universal");
    expect(ownerOf("℗ 1977 Columbia Records")).toBe("Sony");
    expect(ownerOf("℗ 2011 Parlophone Records Ltd")).toBe("Warner");
    expect(ownerOf("℗ 2019 Kscope")).toBe("Independent");
  });
});

describe("stats data: specsOf()", () => {
  it("finds pressing details in the format text", () => {
    const a: AlbumJson = { format_details: [{ name: "Vinyl", descriptions: ["LP", "Album", "Limited Edition", "Numbered"], text: "180g, Gatefold" }] };
    expect(specsOf(a)).toEqual(["180 g", "Gatefold", "Numbered", "Limited edition"]);
    expect(specsOf({}, ["Box Set"])).toEqual(["Box set"]);
  });
});

const entry = (s: string, d: string, over: Partial<CollectionEntry> = {}): CollectionEntry => ({
  release_name: s.toUpperCase(), release_artist: "Band", artists: [{ name: "Band", uri_artist: "/artist/band/" }],
  genre_names: ["Rock"], styles: ["Prog Rock"], uri_release: `/album/${s}/`, date_added: `${d}T20:00:00`, year_original: 1990,
  date_release_year: "2015", ...over,
});
const lastfm = (pc: number) => ({ lastfm: `LastFmData(playcount=${pc}, listeners=${pc / 10}, tags=['band', 'prog'])` });

describe("stats data: buildStats()", () => {
  const collection = [
    entry("a", "2015-08-01", { year_original: 1971 }),
    entry("b", "2015-09-01"),
    entry("c", "2016-01-01"),
    entry("d", "2016-02-01"),
    entry("e", "2016-03-01"),
    entry("f", "2016-04-01"),
    entry("g", "2016-05-01"),
    entry("member", "2016-06-01", { boxset: "/album/b/" }),
  ];
  const albums = new Map<string, AlbumJson>([
    ["a", { services: lastfm(500) }],
    ["b", { format_details: [{ name: "Vinyl", qty: "6", descriptions: ["LP", "Box Set"] }], services: lastfm(9000), credits: [{ name: "Band", role: "Producer" }, { name: "Hipgnosis", role: "Design" }] }],
    ["c", { tracklist: [{ duration: "40:00", title: "Epic", extraartists: [{ name: "Roger Waters", role: "Written-By" }] }, { duration: "3:00", title: "Short" }], services: lastfm(100000) }],
    ["d", { vinyl_colours: ["Red"], services: lastfm(700) }],
    ["e", { credits: [{ name: "Flood (2)", role: "Producer" }], services: lastfm(20) }],
    ["f", { services: lastfm(40) }],
    ["g", { tracklist: [{ duration: "12:00", title: "Side Long" }] }],
  ]);
  const stats = buildStats({ collection, albums, artists: new Map(), colours: {}, cc: new Map(), today: "2026-11-04" });

  it("leaves box set members out", () => {
    expect(stats.totals.records).toBe(7);
    expect(stats.records.map(r => r.s)).not.toContain("member");
  });

  it("adds up the shelves", () => {
    expect(stats.totals).toMatchObject({ discs: 12, coloured: 1, plays: 110260, playsKnown: 6, deep: 5, oldest: 1971, newest: 1990, since: "2015-08-01" });
    expect(stats.perYear).toEqual({ "2015": 2, "2016": 5 });
  });

  it("builds a pool of shelf facts, each tied to a fitting record", () => {
    const fact = (label: string) => stats.holders.find(h => h.label === label);
    expect(fact("Last.fm plays")).toMatchObject({ s: "c", stat: "0.0 bn" });
    expect(fact("of vinyl")).toMatchObject({ s: "b", note: "Heaviest: 0.8 kg" });
    expect(fact("of music")).toMatchObject({ s: "c", note: "Longest track: 40 min" });
    expect(fact("coloured pressings")).toMatchObject({ s: "d" });
    expect(fact("under 1,000 listeners")).toMatchObject({ s: "e", stat: "5" });
    expect(new Set(stats.holders.map(h => h.s)).size).toBeGreaterThanOrEqual(6);
  });

  it("counts credits, without an artist producing their own record, and cleans Discogs names", () => {
    expect(stats.boards.produced.map(x => x.name)).toEqual(["Flood"]);
    expect(stats.boards.written[0]).toMatchObject({ name: "Roger Waters", n: 1, songs: 1, s: ["c"] });
    expect(stats.sleeves.design[0]).toMatchObject({ name: "Hipgnosis", n: 1 });
  });

  it("drops tags that are just the artist's name", () => {
    expect(stats.tags).toEqual([{ name: "prog", n: 6 }]);
  });
});

describe("stats shelf: pickHolders()", () => {
  const pool = ["a", "a", "b", "c", "c", "d", "e", "f", "g"].map((s, i) => ({ stat: String(i), label: "x", s, note: "y" }));

  it("draws k facts, each on a different record", () => {
    for (let seed = 0; seed < 20; seed++) {
      let x = seed + 1;
      const random = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const picked = pickHolders(pool, 6, random);
      expect(picked).toHaveLength(6);
      expect(new Set(picked.map(h => h.s)).size).toBe(6);
    }
  });

  it("returns what it can when the pool is short of records", () => {
    expect(pickHolders(pool.slice(0, 3), 6)).toHaveLength(2);
  });
});
