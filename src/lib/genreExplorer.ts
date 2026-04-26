import type { Album } from "@/types/album";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import {
  getAlbumImageFromData,
  getAlbumSlug,
  getArtistAvatarFromData,
  getArtistSlug,
} from "@/lib/image-utils";

export type GenreExplorerSort = "dominance" | "recent" | "name" | "year";

export const ALL_GENRES_VALUE = "all";
export const ALL_GENRES_LABEL = "All genres";

export interface GenreExplorerAlbum {
  title: string;
  artist: string;
  slug: string;
  uri: string;
  cover: string;
  year: number | null;
  dateAdded: string;
  genres: string[];
}

export interface GenreExplorerArtist {
  name: string;
  slug: string;
  uri: string;
  avatar: string;
  albumCount: number;
  totalAlbumCount: number;
  latestAdded: string;
  genres: string[];
  albums: GenreExplorerAlbum[];
  representativeAlbums: GenreExplorerAlbum[];
}

export interface RelatedGenre {
  name: string;
  albumCount: number;
}

export interface GenreSummary {
  name: string;
  isAll?: boolean;
  albumCount: number;
  artistCount: number;
  yearStart: number | null;
  yearEnd: number | null;
  latestAdded: string;
  coverSamples: GenreExplorerAlbum[];
  relatedGenres: RelatedGenre[];
  artists: GenreExplorerArtist[];
  topArtists: GenreExplorerArtist[];
  albums: GenreExplorerAlbum[];
}

export interface GenreExplorerData {
  allGenre: GenreSummary;
  genres: GenreSummary[];
  totalAlbums: number;
  totalArtists: number;
  yearStart: number | null;
  yearEnd: number | null;
}

export interface ArtistConnection {
  artist: GenreExplorerArtist;
  sharedGenres: string[];
  genreScores: Map<string, number>;
  score: number;
}

export interface AlbumConnection {
  album: GenreExplorerAlbum;
  sharedGenres: string[];
  sameArtist: boolean;
}

interface ArtistBucket {
  name: string;
  uri: string;
  avatar: string;
  albums: Map<string, GenreExplorerAlbum>;
  genres: Set<string>;
  latestAdded: string;
}

interface GenreBucket {
  name: string;
  albums: Map<string, GenreExplorerAlbum>;
  artists: Map<string, ArtistBucket>;
  relatedGenres: Map<string, number>;
  years: number[];
  latestAdded: string;
}

export function buildGenreExplorer(collection: Album[]): GenreExplorerData {
  const genres = new Map<string, GenreBucket>();
  const globalArtists = new Map<string, ArtistBucket>();
  const globalAlbums = new Map<string, GenreExplorerAlbum>();
  const globalYears: number[] = [];

  collection.forEach((album) => {
    const cleanGenres = getCleanGenresFromArray(
      album.genre_names || [],
      album.release_artist,
    );

    if (!cleanGenres.length) return;

    const explorerAlbum = toExplorerAlbum(album, cleanGenres);
    globalAlbums.set(explorerAlbum.slug, explorerAlbum);

    if (explorerAlbum.year != null) {
      globalYears.push(explorerAlbum.year);
    }

    cleanGenres.forEach((genreName) => {
      const genre = getOrCreateGenre(genres, genreName);
      genre.albums.set(explorerAlbum.slug, explorerAlbum);

      if (explorerAlbum.year != null) {
        genre.years.push(explorerAlbum.year);
      }

      if (isAfter(explorerAlbum.dateAdded, genre.latestAdded)) {
        genre.latestAdded = explorerAlbum.dateAdded;
      }

      cleanGenres.forEach((related) => {
        if (related === genreName) return;
        genre.relatedGenres.set(
          related,
          (genre.relatedGenres.get(related) || 0) + 1,
        );
      });

      album.artists?.forEach((artist) => {
        if (shouldSkipArtist(artist.name)) return;

        const artistBucket = getOrCreateArtist(
          genre.artists,
          artist.name,
          artist.uri_artist,
        );
        artistBucket.albums.set(explorerAlbum.slug, explorerAlbum);
        cleanGenres.forEach((g) => artistBucket.genres.add(g));

        if (isAfter(explorerAlbum.dateAdded, artistBucket.latestAdded)) {
          artistBucket.latestAdded = explorerAlbum.dateAdded;
        }

        const globalArtistBucket = getOrCreateArtist(
          globalArtists,
          artist.name,
          artist.uri_artist,
        );
        globalArtistBucket.albums.set(explorerAlbum.slug, explorerAlbum);
        cleanGenres.forEach((g) => globalArtistBucket.genres.add(g));

        if (isAfter(explorerAlbum.dateAdded, globalArtistBucket.latestAdded)) {
          globalArtistBucket.latestAdded = explorerAlbum.dateAdded;
        }
      });
    });
  });

  const genreSummaries = Array.from(genres.values())
    .map((genre): GenreSummary => {
      const artists = Array.from(genre.artists.values())
        .map((artist) => {
          const albums = sortAlbums(Array.from(artist.albums.values()), "recent");
          const globalArtist = globalArtists.get(getArtistSlug(artist.uri));

          return {
            name: artist.name,
            slug: getArtistSlug(artist.uri),
            uri: artist.uri,
            avatar: artist.avatar,
            albumCount: artist.albums.size,
            totalAlbumCount: globalArtist?.albums.size || artist.albums.size,
            latestAdded: artist.latestAdded,
            genres: Array.from(artist.genres).sort(),
            albums,
            representativeAlbums: albums.slice(0, 5),
          };
        })
        .sort(compareArtists);

      const albums = sortAlbums(Array.from(genre.albums.values()), "recent");
      const relatedGenres = Array.from(genre.relatedGenres.entries())
        .map(([name, albumCount]) => ({ name, albumCount }))
        .sort((a, b) => b.albumCount - a.albumCount || a.name.localeCompare(b.name));

      return {
        name: genre.name,
        albumCount: genre.albums.size,
        artistCount: artists.length,
        yearStart: minYear(genre.years),
        yearEnd: maxYear(genre.years),
        latestAdded: genre.latestAdded,
        coverSamples: albums.slice(0, 8),
        relatedGenres,
        artists,
        topArtists: artists.slice(0, 18),
        albums,
      };
    })
    .filter((genre) => genre.artistCount > 0)
    .sort((a, b) => b.albumCount - a.albumCount || a.name.localeCompare(b.name));

  const allAlbums = sortAlbums(Array.from(globalAlbums.values()), "recent");
  const allArtists = Array.from(globalArtists.values())
    .map((artist) => {
      const albums = sortAlbums(Array.from(artist.albums.values()), "recent");

      return {
        name: artist.name,
        slug: getArtistSlug(artist.uri),
        uri: artist.uri,
        avatar: artist.avatar,
        albumCount: artist.albums.size,
        totalAlbumCount: artist.albums.size,
        latestAdded: artist.latestAdded,
        genres: Array.from(artist.genres).sort(),
        albums,
        representativeAlbums: albums.slice(0, 5),
      };
    })
    .sort(compareArtists);

  const allGenre: GenreSummary = {
    name: ALL_GENRES_LABEL,
    isAll: true,
    albumCount: globalAlbums.size,
    artistCount: allArtists.length,
    yearStart: minYear(globalYears),
    yearEnd: maxYear(globalYears),
    latestAdded: allAlbums[0]?.dateAdded || "",
    coverSamples: allAlbums.slice(0, 8),
    relatedGenres: genreSummaries.map((genre) => ({
      name: genre.name,
      albumCount: genre.albumCount,
    })),
    artists: allArtists,
    topArtists: allArtists.slice(0, 18),
    albums: allAlbums,
  };

  return {
    allGenre,
    genres: genreSummaries,
    totalAlbums: globalAlbums.size,
    totalArtists: globalArtists.size,
    yearStart: minYear(globalYears),
    yearEnd: maxYear(globalYears),
  };
}

export function resolveGenre(
  genres: GenreSummary[],
  genreName: string | null | undefined,
  allGenre?: GenreSummary,
): GenreSummary | null {
  if (!genres.length) return allGenre || null;
  if (!genreName) return allGenre || genres[0];

  const decoded = decodeURIComponent(genreName).toLowerCase();
  if (isAllGenresParam(decoded)) return allGenre || genres[0];

  return genres.find((genre) => genre.name.toLowerCase() === decoded) || allGenre || genres[0];
}

export function resolveArtist(
  genre: GenreSummary | null,
  artistSlug: string | null | undefined,
): GenreExplorerArtist | null {
  if (!genre || !artistSlug) return null;
  const decoded = decodeURIComponent(artistSlug).toLowerCase();
  return genre.artists.find((artist) => artist.slug.toLowerCase() === decoded) || null;
}

export function filterGenres(
  genres: GenreSummary[],
  query: string,
): GenreSummary[] {
  const needle = normalizeSearch(query);
  if (!needle) return genres;

  return genres.filter((genre) => {
    if (normalizeSearch(genre.name).includes(needle)) return true;
    if (genre.artists.some((artist) => normalizeSearch(artist.name).includes(needle))) {
      return true;
    }
    return genre.albums.some((album) => {
      return (
        normalizeSearch(album.title).includes(needle) ||
        normalizeSearch(album.artist).includes(needle)
      );
    });
  });
}

export function filterArtists(
  artists: GenreExplorerArtist[],
  query: string,
): GenreExplorerArtist[] {
  const needle = normalizeSearch(query);
  if (!needle) return artists;

  return artists.filter((artist) => {
    if (normalizeSearch(artist.name).includes(needle)) return true;
    if (artist.genres.some((genre) => normalizeSearch(genre).includes(needle))) {
      return true;
    }
    return artist.albums.some((album) => normalizeSearch(album.title).includes(needle));
  });
}

export function filterAlbums(
  albums: GenreExplorerAlbum[],
  query: string,
): GenreExplorerAlbum[] {
  const needle = normalizeSearch(query);
  if (!needle) return albums;

  return albums.filter((album) => {
    return (
      normalizeSearch(album.title).includes(needle) ||
      normalizeSearch(album.artist).includes(needle) ||
      album.genres.some((genre) => normalizeSearch(genre).includes(needle))
    );
  });
}

export function sortArtists(
  artists: GenreExplorerArtist[],
  sort: GenreExplorerSort,
): GenreExplorerArtist[] {
  const sorted = [...artists];

  sorted.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "recent":
        return compareDateDesc(a.latestAdded, b.latestAdded) || compareArtists(a, b);
      case "year":
        return oldestArtistYear(a) - oldestArtistYear(b) || compareArtists(a, b);
      case "dominance":
      default:
        return compareArtists(a, b);
    }
  });

  return sorted;
}

export function sortAlbums(
  albums: GenreExplorerAlbum[],
  sort: GenreExplorerSort,
): GenreExplorerAlbum[] {
  const sorted = [...albums];

  sorted.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist);
      case "year":
        return (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER);
      case "dominance":
      case "recent":
      default:
        return compareDateDesc(a.dateAdded, b.dateAdded) || a.title.localeCompare(b.title);
    }
  });

  return sorted;
}

export function normalizeSort(value: string | null): GenreExplorerSort {
  if (value === "recent" || value === "name" || value === "year") return value;
  return "dominance";
}

export function isAllGenresParam(value: string | null | undefined): boolean {
  if (!value) return false;
  const decoded = decodeURIComponent(value).toLowerCase();
  return decoded === ALL_GENRES_VALUE || decoded === ALL_GENRES_LABEL.toLowerCase();
}

export function getArtistGenreSummaries(
  artist: GenreExplorerArtist,
  allGenres: GenreSummary[],
): GenreSummary[] {
  const albumCounts = new Map<string, number>();
  artist.albums.forEach((album) => {
    album.genres.forEach((genreName) => {
      albumCounts.set(genreName, (albumCounts.get(genreName) || 0) + 1);
    });
  });

  return artist.genres
    .map((genreName) => allGenres.find((candidate) => candidate.name === genreName))
    .filter((candidate): candidate is GenreSummary => Boolean(candidate))
    .sort((a, b) => {
      return (
        (albumCounts.get(b.name) || 0) - (albumCounts.get(a.name) || 0) ||
        b.albumCount - a.albumCount ||
        a.name.localeCompare(b.name)
      );
    });
}

export function getRelatedArtistsForArtist(
  artist: GenreExplorerArtist,
  allGenres: GenreSummary[],
): ArtistConnection[] {
  const artistGenreNames = new Set(artist.genres);
  const connections = new Map<string, ArtistConnection>();

  allGenres.forEach((genre) => {
    if (!artistGenreNames.has(genre.name)) return;

    genre.artists.forEach((candidate) => {
      if (candidate.slug === artist.slug) return;

      const existing = connections.get(candidate.slug) || {
        artist: candidate,
        sharedGenres: [],
        genreScores: new Map<string, number>(),
        score: 0,
      };
      existing.sharedGenres.push(genre.name);
      existing.genreScores.set(genre.name, candidate.albumCount);
      existing.score += candidate.albumCount;
      connections.set(candidate.slug, existing);
    });
  });

  return Array.from(connections.values())
    .map((connection) => ({
      ...connection,
      sharedGenres: connection.sharedGenres.sort((a, b) => {
        return (
          (connection.genreScores.get(b) || 0) - (connection.genreScores.get(a) || 0) ||
          a.localeCompare(b)
        );
      }),
    }))
    .sort((a, b) => {
      return (
        b.sharedGenres.length - a.sharedGenres.length ||
        b.score - a.score ||
        (b.artist.totalAlbumCount || b.artist.albumCount) - (a.artist.totalAlbumCount || a.artist.albumCount) ||
        a.artist.name.localeCompare(b.artist.name)
      );
    });
}

export function getRelatedAlbumsForAlbum(
  album: GenreExplorerAlbum,
  allAlbums: GenreExplorerAlbum[],
): AlbumConnection[] {
  const albumGenreNames = new Set(album.genres);
  if (!albumGenreNames.size) return [];

  return allAlbums
    .filter((candidate) => candidate.slug !== album.slug)
    .map((candidate) => {
      const sharedGenres = candidate.genres.filter((genreName) => albumGenreNames.has(genreName));

      return {
        album: candidate,
        sharedGenres,
        sameArtist: candidate.artist.toLowerCase() === album.artist.toLowerCase(),
      };
    })
    .filter((connection) => connection.sharedGenres.length > 0)
    .sort((a, b) => {
      return (
        b.sharedGenres.length - a.sharedGenres.length ||
        Number(b.sameArtist) - Number(a.sameArtist) ||
        compareDateDesc(a.album.dateAdded, b.album.dateAdded) ||
        a.album.title.localeCompare(b.album.title) ||
        a.album.artist.localeCompare(b.album.artist)
      );
    });
}

function toExplorerAlbum(album: Album, genres: string[]): GenreExplorerAlbum {
  const slug = getAlbumSlug(album.uri_release);
  const year = parseYear(album.date_release_year);

  return {
    title: album.release_name,
    artist: album.release_artist,
    slug,
    uri: `/album/${slug}`,
    cover: getAlbumImageFromData(album.uri_release, "medium"),
    year,
    dateAdded: album.date_added || "",
    genres,
  };
}

function getOrCreateGenre(
  genres: Map<string, GenreBucket>,
  name: string,
): GenreBucket {
  const existing = genres.get(name);
  if (existing) return existing;

  const created: GenreBucket = {
    name,
    albums: new Map(),
    artists: new Map(),
    relatedGenres: new Map(),
    years: [],
    latestAdded: "",
  };
  genres.set(name, created);
  return created;
}

function getOrCreateArtist(
  artists: Map<string, ArtistBucket>,
  name: string,
  uri: string,
): ArtistBucket {
  const slug = getArtistSlug(uri);
  const existing = artists.get(slug);
  if (existing) return existing;

  const created: ArtistBucket = {
    name,
    uri,
    avatar: getArtistAvatarFromData(uri),
    albums: new Map(),
    genres: new Set(),
    latestAdded: "",
  };
  artists.set(slug, created);
  return created;
}

function shouldSkipArtist(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "various" || normalized.includes("various artists") || normalized === "sigur rós";
}

function compareArtists(
  a: GenreExplorerArtist,
  b: GenreExplorerArtist,
): number {
  return (
    b.albumCount - a.albumCount ||
    compareDateDesc(a.latestAdded, b.latestAdded) ||
    a.name.localeCompare(b.name)
  );
}

function compareDateDesc(a: string, b: string): number {
  return new Date(b || 0).getTime() - new Date(a || 0).getTime();
}

function isAfter(a: string, b: string): boolean {
  if (!b) return true;
  return new Date(a || 0).getTime() > new Date(b || 0).getTime();
}

function parseYear(value: string): number | null {
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function minYear(years: number[]): number | null {
  return years.length ? Math.min(...years) : null;
}

function maxYear(years: number[]): number | null {
  return years.length ? Math.max(...years) : null;
}

function oldestArtistYear(artist: GenreExplorerArtist): number {
  const years = artist.albums
    .map((album) => album.year)
    .filter((year): year is number => year != null);
  return years.length ? Math.min(...years) : Number.MAX_SAFE_INTEGER;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}
