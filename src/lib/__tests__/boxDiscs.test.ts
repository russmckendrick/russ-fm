import { describe, expect, it } from "vitest";
import { boxMemberDiscs, type BoxTracklistRow } from "../boxDiscs";
import type { FormatDetail } from "../vinylLook";
import type { BoxsetContent } from "@/types/album";

const member = (name: string): BoxsetContent => ({
  release_name: name,
  uri_release: `/album/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/`,
  images_uri_release: { "hi-res": "", medium: "" },
});

/** A tracklist: a header row per section, then one row per position. */
const tracklist = (sections: Array<[string, string[]]>): BoxTracklistRow[] =>
  sections.flatMap(([title, positions]) => [{ title, position: "" }, ...positions.map(position => ({ title: "Track", position }))]);

const vinyl = (text: string | null, colour: string | null, qty = 1, descriptions: string[] = ["LP"]): FormatDetail => ({
  name: "Vinyl",
  qty: String(qty),
  text,
  colour,
  descriptions,
});

const coloursOf = (map: Map<string, Array<string | null>>, name: string) => map.get(member(name).uri_release);

describe("boxMemberDiscs", () => {
  it("gives each album the discs that play its sides, per-disc colours included", () => {
    // Modelled on Queen's Studio Collection: Queen II is a white disc and a black one.
    const map = boxMemberDiscs(
      tracklist([
        ["Queen", ["A1", "B1"]],
        ["Queen II", ["C1", "D1"]],
        ["Sheer Heart Attack", ["E1", "F1"]],
      ]),
      [vinyl("Purple", "Purple"), vinyl("Disc 1 White, Disc 2 Black", "Disc White", 2, ["LP", "Single Sided"]), vinyl("Red", "Red")],
      [member("Queen"), member("Queen II"), member("Sheer Heart Attack")],
    );
    expect(coloursOf(map, "Queen")).toEqual(["Purple"]);
    expect(coloursOf(map, "Queen II")).toEqual(["White", "Black"]);
    expect(coloursOf(map, "Sheer Heart Attack")).toEqual(["Red"]);
  });

  it("covers an album spread over a disc and a single-sided etched one", () => {
    // Modelled on the B-52's box: Good Stuff is an LP plus a single-sided etched disc.
    const map = boxMemberDiscs(
      tracklist([
        ["Cosmic Thing", ["A1", "B1"]],
        ["Good Stuff", ["C1", "D1", "E1"]],
      ]),
      [vinyl("Orange", "Orange"), vinyl("Purple", "Purple"), vinyl("Purple", "Purple", 1, ["LP", "Single Sided", "Etched"])],
      [member("Cosmic Thing"), member("Good Stuff")],
    );
    expect(coloursOf(map, "Good Stuff")).toEqual(["Purple", "Purple"]);
  });

  it("prefers the vinyl section over a CD copy with the album's exact title", () => {
    // Modelled on Slade's box: "LP 1: Slayed? (Brown Vinyl)", and later a CD section "Slayed?".
    const map = boxMemberDiscs(
      tracklist([
        ["LP 1: Slayed? (Brown Vinyl)", ["A1", "B1"]],
        ["LP 2: Slade Alive! (Red Vinyl)", ["C1", "D1"]],
        ["Slayed?", ["1-1", "1-2"]],
        ["Slade Alive!", ["2-1"]],
      ]),
      [vinyl("Brown", "Brown"), vinyl("Red", "Red")],
      [member("Slayed?"), member("Slade Alive!")],
    );
    expect(coloursOf(map, "Slayed?")).toEqual(["Brown"]);
    expect(coloursOf(map, "Slade Alive!")).toEqual(["Red"]);
  });

  it("lets a bonus sub-section carry on the side before it", () => {
    // Modelled on Syd Barrett's box: a "-" section of bonus tracks still on side B.
    const map = boxMemberDiscs(
      tracklist([
        ["The Madcap Laughs", ["A1", "B1"]],
        ["-", ["B5"]],
        ["Barrett", ["C1", "D1"]],
      ]),
      [vinyl("Gold", "Gold"), vinyl("Green Marble", "Green Marble")],
      [member("Barrett"), member("The Madcap Laughs")],
    );
    expect(coloursOf(map, "The Madcap Laughs")).toEqual(["Gold"]);
    expect(coloursOf(map, "Barrett")).toEqual(["Green Marble"]);
  });

  it("reads sides written with a disc prefix", () => {
    // Heaven 17 and Simple Minds boxes write "1-A1"; EMF writes "LP-A1".
    const map = boxMemberDiscs(
      tracklist([
        ["Penthouse And Pavement", ["1-A1", "1-B1"]],
        ["The Luxury Gap", ["2-A1", "2-B1"]],
      ]),
      [vinyl("White", "White"), vinyl("Yellow", "Yellow")],
      [member("Penthouse And Pavement"), member("The Luxury Gap")],
    );
    expect(coloursOf(map, "The Luxury Gap")).toEqual(["Yellow"]);
  });

  it("matches titles with look-alike letters and a section named for part of the album", () => {
    // Black Sabbath's box: "Master Οf Reality" (a Greek Omicron) and "Vol. 4".
    const map = boxMemberDiscs(
      tracklist([
        ["Master Οf Reality", ["A1", "B1"]],
        ["Vol. 4", ["C1", "D1"]],
        ["1972 - Vol 4 [USB Stick]", ["4-1"]],
      ]),
      [vinyl("Purple With Black Splatter", "Purple With Black Splatter"), vinyl("Yellow With Black Splatter", "Yellow With Black Splatter")],
      [member("Master Of Reality"), member("Black Sabbath Vol 4")],
    );
    expect(coloursOf(map, "Master Of Reality")).toEqual(["Purple With Black Splatter"]);
    expect(coloursOf(map, "Black Sabbath Vol 4")).toEqual(["Yellow With Black Splatter"]);
  });

  it("falls back to box order when the sides restart for every album", () => {
    const map = boxMemberDiscs(
      tracklist([
        ["First", ["A1", "B1"]],
        ["Second", ["A1", "B1"]],
      ]),
      [vinyl("Red", "Red"), vinyl("Blue", "Blue")],
      [member("First"), member("Second")],
    );
    expect(coloursOf(map, "First")).toEqual(["Red"]);
    expect(coloursOf(map, "Second")).toEqual(["Blue"]);
  });

  it("leaves black discs and boxes with no colour out", () => {
    const sections: Array<[string, string[]]> = [
      ["Coloured", ["A1", "B1"]],
      ["Black", ["C1", "D1"]],
    ];
    const members = [member("Coloured"), member("Black")];
    const map = boxMemberDiscs(tracklist(sections), [vinyl("Red", "Red"), vinyl(null, null)], members);
    expect(coloursOf(map, "Coloured")).toEqual(["Red"]);
    expect(map.has(member("Black").uri_release)).toBe(false);
    expect(boxMemberDiscs(tracklist(sections), [vinyl(null, null), vinyl(null, null)], members).size).toBe(0);
    expect(boxMemberDiscs(tracklist(sections), undefined, members).size).toBe(0);
  });
});
