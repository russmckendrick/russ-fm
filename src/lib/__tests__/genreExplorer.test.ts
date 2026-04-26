import { describe, expect, it } from "vitest";
import {
  ALL_GENRES_LABEL,
  ALL_GENRES_VALUE,
  buildGenreExplorer,
  filterAlbums,
  filterArtists,
  filterGenres,
  getArtistGenreSummaries,
  getRelatedAlbumsForAlbum,
  getRelatedArtistsForArtist,
  normalizeSort,
  resolveArtist,
  resolveGenre,
  sortAlbums,
  sortArtists,
} from "../genreExplorer";
import type { Album } from "@/types/album";

const collection = [
  album({
    title: "Low Frequency Cathedral",
    artist: "North Sea Relay",
    artistSlug: "north-sea-relay",
    genres: ["Electronic", "Ambient", "music", "lowercase", "3-Step"],
    releaseSlug: "low-frequency-cathedral-100",
    year: "2001-01-01",
    added: "2026-01-12",
  }),
  album({
    title: "Harbour Static",
    artist: "North Sea Relay",
    artistSlug: "north-sea-relay",
    genres: ["Electronic", "Rock"],
    releaseSlug: "harbour-static-101",
    year: "1999-03-01",
    added: "2025-12-10",
  }),
  album({
    title: "Signal House",
    artist: "Paper Fort",
    artistSlug: "paper-fort",
    genres: ["Rock", "Alternative"],
    releaseSlug: "signal-house-102",
    year: "2012-06-18",
    added: "2024-08-01",
  }),
  album({
    title: "Compilation One",
    artist: "Various",
    artistSlug: "various",
    genres: ["Electronic"],
    releaseSlug: "compilation-one-103",
    year: "2014-02-01",
    added: "2024-01-01",
  }),
  album({
    title: "Quiet Weather",
    artist: "Sigur Rós",
    artistSlug: "sigur-ros",
    genres: ["Ambient", "Rock"],
    releaseSlug: "quiet-weather-104",
    year: "2008-02-01",
    added: "2023-05-01",
  }),
] satisfies Album[];

describe("genreExplorer", () => {
  it("builds genre, artist, related genre, and album summaries from collection data", () => {
    const data = buildGenreExplorer(collection);
    const electronic = resolveGenre(data.genres, "Electronic");

    expect(data.totalAlbums).toBe(5);
    expect(data.totalArtists).toBe(2);
    expect(electronic?.albumCount).toBe(3);
    expect(electronic?.artistCount).toBe(1);
    expect(electronic?.yearStart).toBe(1999);
    expect(electronic?.yearEnd).toBe(2014);
    expect(electronic?.relatedGenres.map((genre) => genre.name)).toContain("Ambient");
    expect(electronic?.coverSamples[0]?.title).toBe("Low Frequency Cathedral");
  });

  it("filters low-quality genres and skips Various and Sigur Ros artist nodes", () => {
    const data = buildGenreExplorer(collection);
    const genreNames = data.genres.map((genre) => genre.name);
    const ambient = resolveGenre(data.genres, "Ambient");
    const rock = resolveGenre(data.genres, "Rock");

    expect(genreNames).not.toContain("music");
    expect(genreNames).not.toContain("lowercase");
    expect(genreNames).not.toContain("3-Step");
    expect(ambient?.artists.map((artist) => artist.name)).not.toContain("Sigur Rós");
    expect(rock?.artists.map((artist) => artist.name)).not.toContain("Sigur Rós");
    expect(resolveGenre(data.genres, "Electronic")?.artists.map((artist) => artist.name)).not.toContain("Various");
  });

  it("resolves unknown URL params gracefully", () => {
    const data = buildGenreExplorer(collection);
    const fallbackGenre = resolveGenre(data.genres, "No Such Genre");
    const allGenre = resolveGenre(data.genres, ALL_GENRES_VALUE, data.allGenre);
    const missingArtist = resolveArtist(fallbackGenre, "missing-artist");

    expect(fallbackGenre?.name).toBe("Electronic");
    expect(allGenre?.name).toBe(ALL_GENRES_LABEL);
    expect(missingArtist).toBeNull();
    expect(normalizeSort("strange")).toBe("dominance");
  });

  it("builds an all-genres summary for global explore and search", () => {
    const data = buildGenreExplorer(collection);

    expect(data.allGenre.name).toBe(ALL_GENRES_LABEL);
    expect(data.allGenre.albumCount).toBe(5);
    expect(data.allGenre.artistCount).toBe(2);
    expect(data.allGenre.artists.map((artist) => artist.name)).toEqual([
      "North Sea Relay",
      "Paper Fort",
    ]);
    expect(data.allGenre.relatedGenres.map((genre) => genre.name)).toContain("Electronic");
    expect(data.allGenre.relatedGenres).toHaveLength(data.genres.length);
    expect(filterArtists(data.allGenre.artists, "paper")[0]?.name).toBe("Paper Fort");
    expect(filterAlbums(data.allGenre.albums, "quiet")[0]?.title).toBe("Quiet Weather");
    expect(resolveArtist(data.allGenre, "north-sea-relay")?.albumCount).toBe(2);
  });

  it("filters and sorts artists and albums for the explore page", () => {
    const data = buildGenreExplorer(collection);
    const electronic = resolveGenre(data.genres, "Electronic");

    expect(filterGenres(data.genres, "paper").map((genre) => genre.name)).toContain("Rock");
    expect(filterArtists(electronic?.artists || [], "harbour")[0]?.name).toBe("North Sea Relay");
    expect(filterAlbums(electronic?.albums || [], "cathedral")[0]?.title).toBe("Low Frequency Cathedral");
    expect(sortArtists(electronic?.artists || [], "name")[0]?.name).toBe("North Sea Relay");
    expect(sortAlbums(electronic?.albums || [], "year")[0]?.title).toBe("Harbour Static");
  });

  it("ranks related artists by shared genre strength", () => {
    const data = buildGenreExplorer(collection);
    const artist = resolveArtist(data.allGenre, "north-sea-relay");

    expect(artist).not.toBeNull();
    expect(getArtistGenreSummaries(artist!, data.genres)[0]?.name).toBe("Electronic");

    const relatedArtists = getRelatedArtistsForArtist(artist!, data.genres);

    expect(relatedArtists[0]?.artist.name).toBe("Paper Fort");
    expect(relatedArtists[0]?.sharedGenres).toEqual(["Rock"]);
  });

  it("ranks related albums by shared genres, same artist, and recent additions", () => {
    const data = buildGenreExplorer(collection);
    const album = data.allGenre.albums.find((candidate) => candidate.title === "Low Frequency Cathedral");

    expect(album).toBeDefined();

    const relatedAlbums = getRelatedAlbumsForAlbum(album!, data.allGenre.albums);

    expect(relatedAlbums.map((connection) => connection.album.title)).not.toContain("Low Frequency Cathedral");
    expect(relatedAlbums[0]?.album.title).toBe("Harbour Static");
    expect(relatedAlbums[0]?.sameArtist).toBe(true);
    expect(relatedAlbums[0]?.sharedGenres).toEqual(["Electronic"]);
  });
});

function album({
  title,
  artist,
  artistSlug,
  genres,
  releaseSlug,
  year,
  added,
}: {
  title: string;
  artist: string;
  artistSlug: string;
  genres: string[];
  releaseSlug: string;
  year: string;
  added: string;
}): Album {
  return {
    release_name: title,
    release_artist: artist,
    artists: [
      {
        name: artist,
        uri_artist: `/artist/${artistSlug}/`,
        json_detailed_artist: `/artist/${artistSlug}/${artistSlug}.json`,
        images_uri_artist: {
          "hi-res": `/artist/${artistSlug}/${artistSlug}-hi-res.jpg`,
          medium: `/artist/${artistSlug}/${artistSlug}-medium.jpg`,
          avatar: `/artist/${artistSlug}/${artistSlug}-avatar.jpg`,
        },
      },
    ],
    genre_names: genres,
    uri_release: `/album/${releaseSlug}/`,
    uri_artist: `/artist/${artistSlug}/`,
    date_added: added,
    date_release_year: year,
    json_detailed_release: `/album/${releaseSlug}/${releaseSlug}.json`,
    json_detailed_artist: `/artist/${artistSlug}/${artistSlug}.json`,
    images_uri_release: {
      "hi-res": `/album/${releaseSlug}/${releaseSlug}-hi-res.jpg`,
      medium: `/album/${releaseSlug}/${releaseSlug}-medium.jpg`,
    },
    images_uri_artist: {
      "hi-res": `/artist/${artistSlug}/${artistSlug}-hi-res.jpg`,
      medium: `/artist/${artistSlug}/${artistSlug}-medium.jpg`,
      avatar: `/artist/${artistSlug}/${artistSlug}-avatar.jpg`,
    },
  };
}
