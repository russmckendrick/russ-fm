import { describe, expect, it } from "vitest";
import { buildChannels, onAir, slotsBetween, videoIdFromParam, videoPath, type TvData, type TvRelease } from "../tv";
import type { Album } from "@/types/album";

const album = (uri: string, artist = "Artist"): Album =>
  ({
    release_name: uri,
    release_artist: artist,
    artists: [],
    genre_names: [],
    uri_release: uri,
    uri_artist: "/artist/x/",
    date_added: "2026-01-01",
    date_release_year: "2026",
    images_uri_release: { "hi-res": "", medium: "" },
  }) as Album;

const release = (uri: string, genres: string[], styles: string[], ids: string[], extra: Partial<TvRelease> = {}): TvRelease => ({
  uri,
  name: uri,
  artist: "Artist",
  date_added: "2026-01-01",
  genres,
  styles,
  videos: ids.map(id => ({ id, title: `Song ${id}`, kind: "video" as const, duration: 200 })),
  ...extra,
});

const tv = (releases: TvRelease[]): TvData => ({ version: 1, releases });

describe("buildChannels", () => {
  it("files releases under genre channels and Latest additions", () => {
    const data = tv([
      release("/album/a/", ["Electronic"], ["Synth-pop"], ["aaaaaaaaaaa"]),
      release("/album/b/", ["Rock"], ["Grunge"], ["bbbbbbbbbbb"]),
    ]);
    const channels = buildChannels(data, [album("/album/a/"), album("/album/b/")]);
    const slugs = channels.map(c => c.slug);
    expect(slugs[0]).toBe("latest");
    expect(slugs).toContain("electronic");
    expect(slugs).toContain("alt-indie");
    expect(channels[0].items).toHaveLength(2);
    expect(channels.map(c => c.number)).toEqual(channels.map((_, i) => String(i + 1).padStart(2, "0")));
  });

  it("drops Pop when a release matches something more specific by genre only", () => {
    const data = tv([release("/album/a/", ["Pop", "Electronic"], [], ["aaaaaaaaaaa"])]);
    const slugs = buildChannels(data, [album("/album/a/")]).map(c => c.slug);
    expect(slugs).toContain("electronic");
    expect(slugs).not.toContain("pop");
  });

  it("puts unmatched releases on Everything Else and live videos on Live", () => {
    const r = release("/album/a/", ["Non-Music"], [], ["aaaaaaaaaaa"]);
    r.videos.push({ id: "lllllllllll", title: "Song (Live)", kind: "live", duration: 3000 });
    const channels = buildChannels(tv([r]), [album("/album/a/")]);
    const byslug = Object.fromEntries(channels.map(c => [c.slug, c]));
    expect(byslug["everything-else"].items.map(i => i.id)).toEqual(["aaaaaaaaaaa"]);
    // Too long for the other channels, fine for Live.
    expect(byslug.live.items.map(i => i.id)).toEqual(["lllllllllll"]);
  });

  it("airs a video once per channel and skips releases missing from the collection", () => {
    const data = tv([
      release("/album/a/", ["Electronic"], [], ["aaaaaaaaaaa"]),
      release("/album/b/", ["Electronic"], [], ["aaaaaaaaaaa", "ccccccccccc"]),
      release("/album/gone/", ["Electronic"], [], ["ddddddddddd"]),
    ]);
    const electronic = buildChannels(data, [album("/album/a/"), album("/album/b/")]).find(c => c.slug === "electronic")!;
    expect(electronic.items.map(i => i.id).sort()).toEqual(["aaaaaaaaaaa", "ccccccccccc"]);
  });

  it("credits the video's own artist on compilations", () => {
    const r = release("/album/v/", ["Electronic"], [], []);
    r.videos.push({ id: "aaaaaaaaaaa", title: "Song", artist: "Someone", kind: "video", duration: 200 });
    const [latest] = buildChannels(tv([r]), [album("/album/v/", "Various")]);
    expect(latest.items[0].artist).toBe("Someone");
  });
});

describe("schedule", () => {
  const data = tv([release("/album/a/", ["Electronic"], [], ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"])]);
  const [latest] = buildChannels(data, [album("/album/a/")]);

  it("loops the running order on the clock", () => {
    expect(latest.loop).toBe(600);
    const t = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(onAir(latest, t)).toEqual({ index: 0, offset: 0 });
    expect(onAir(latest, t + 250_000)).toEqual({ index: 1, offset: 50 });
    // One full loop later it is back where it started.
    expect(onAir(latest, t + 600_000 + 250_000)).toEqual({ index: 1, offset: 50 });
  });

  it("lists contiguous slots across a window", () => {
    const from = Date.UTC(2026, 0, 1, 0, 1, 0);
    const slots = slotsBetween(latest, from, from + 30 * 60_000);
    expect(slots[0].start).toBeLessThanOrEqual(from);
    for (let i = 1; i < slots.length; i++) expect(slots[i].start).toBe(slots[i - 1].end);
    expect(slots.at(-1)!.end).toBeGreaterThanOrEqual(from + 30 * 60_000);
  });
});

describe("video URLs", () => {
  it("builds a readable path ending in the YouTube id", () => {
    expect(videoPath("electronic", { id: "2eBZqmL8ehg", title: "6 Underground", artist: "Sneaker Pimps" })).toBe(
      "/tv/electronic/sneaker-pimps-6-underground-2eBZqmL8ehg",
    );
    expect(videoPath("folk", { id: "a-b_c-d_e-f", title: "Déjà Vu & Me!", artist: "Björk" })).toBe("/tv/folk/bjork-deja-vu-and-me-a-b_c-d_e-f");
  });

  it("reads the id back from the last 11 characters", () => {
    expect(videoIdFromParam("sneaker-pimps-6-underground-2eBZqmL8ehg")).toBe("2eBZqmL8ehg");
    expect(videoIdFromParam("2eBZqmL8ehg")).toBe("2eBZqmL8ehg");
    expect(videoIdFromParam("a-b_c-d_e-f")).toBe("a-b_c-d_e-f");
    expect(videoIdFromParam("short")).toBeNull();
    expect(videoIdFromParam("bad-id-with-a.dot.in.it")).toBeNull();
    expect(videoIdFromParam(undefined)).toBeNull();
  });
});
