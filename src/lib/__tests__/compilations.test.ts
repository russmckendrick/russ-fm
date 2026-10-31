import { describe, expect, it } from "vitest";
import { isCompilation, isVarious, linkedArtists, shelfOf, trackArtistPage, type CompilationsData } from "../compilations";

const shelf = (release_name: string, genre_names: string[] = [], styles: string[] = []) => shelfOf({ release_name, genre_names, styles });

describe("isCompilation", () => {
  it("knows Various alone or alongside a named artist", () => {
    expect(isVarious(" Various ")).toBe(true);
    expect(isVarious("Various Artists")).toBe(true);
    expect(isVarious("Various Production")).toBe(false);
    expect(isCompilation({ release_artist: "Various", artists: [] })).toBe(true);
    expect(isCompilation({ release_artist: "Max Richter & Various", artists: [{ name: "Max Richter" }, { name: "Various" }] as never })).toBe(true);
    expect(isCompilation({ release_artist: "Radiohead", artists: [{ name: "Radiohead" }] as never })).toBe(false);
  });
});

describe("shelfOf", () => {
  it("puts tributes first", () => {
    expect(shelf("Clowns And Jugglers: The Songs Of Syd Barrett", ["Rock"])).toBe("tribute");
    expect(shelf("Reimagining The Court Of The Crimson King", ["Rock"])).toBe("tribute");
    expect(shelf("Stax Does The Beatles", ["Funk / Soul"])).toBe("tribute");
  });

  it("keeps named series off the soundtrack shelf Discogs gives some of them", () => {
    expect(shelf("Now That's What I Call An Era Such A Good Feeling 1988 >> 1995", ["Electronic"], ["Soundtrack"])).toBe("series");
    expect(shelf("90's Alternative Collected", ["Rock"])).toBe("series");
    expect(shelf("Indie Top 20 Volume XI", ["Rock"])).toBe("series");
  });

  it("lets a soundtrack title beat a volume number", () => {
    expect(shelf("Kill Bill Vol. 1 - Original Soundtrack", ["Rock"])).toBe("soundtrack");
    expect(shelf("The Blacklist (Music From The Television Series)", ["Rock"])).toBe("soundtrack");
    expect(shelf("Happy Daze (Volume One)", ["Rock"])).toBe("series");
  });

  it("falls back to genres, then anthology", () => {
    expect(shelf("Ghostbusters II", ["Stage & Screen"])).toBe("soundtrack");
    expect(shelf("Electronic", ["Electronic"], ["Soundtrack"])).toBe("soundtrack");
    expect(shelf("The Trojan Story", ["Reggae"])).toBe("anthology");
  });
});

describe("compilation links", () => {
  const data: CompilationsData = {
    releases: { "/album/a/": { artists: 3, links: { "Pink Floyd": "/artist/pink-floyd/", "David Bowie": "/artist/david-bowie/", Bowie: "/artist/david-bowie/" } } },
    artists: {},
    others: [],
    others_count: 0,
  };

  it("resolves a credited name to its page", () => {
    expect(trackArtistPage(data, "/album/a/", "Pink Floyd")).toBe("/artist/pink-floyd/");
    expect(trackArtistPage(data, "/album/a/", "Martha Wainwright")).toBeNull();
    expect(trackArtistPage(null, "/album/a/", "Pink Floyd")).toBeNull();
  });

  it("lists each page once", () => {
    expect(linkedArtists(data, "/album/a/")).toEqual(["/artist/pink-floyd/", "/artist/david-bowie/"]);
    expect(linkedArtists(data, "/album/missing/")).toEqual([]);
  });
});
