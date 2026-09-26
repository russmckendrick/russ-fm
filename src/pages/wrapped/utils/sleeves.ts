import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { NEUTRAL_FLOOD, floodFor, vividFrom, type Flood } from '@/lib/sleeveColour';
import { originalDecade } from '@/lib/releaseYear';
import type { ColorPalette, WrappedRelease } from '@/types/wrapped';

/**
 * Sleeve helpers for the Wrapped pages. Wrapped JSON carries slugs rather
 * than `uri_release`, and sometimes its own palette; album-colors.json is the
 * primary source so the colours match the rest of the site.
 */

export type ColourMap = Record<string, AlbumColorPalette> | null;

export function releaseUri(slug: string): string {
  return `/album/${slug}/`;
}

export function artistUri(slug: string): string {
  return `/artist/${slug}/`;
}

export function paletteForSlug(colours: ColourMap, slug?: string | null, fallback?: ColorPalette | null): AlbumColorPalette | null {
  if (!slug) return fallback ?? null;
  return colours?.[releaseUri(slug)] ?? fallback ?? null;
}

export function paletteForRelease(colours: ColourMap, release?: WrappedRelease | null): AlbumColorPalette | null {
  return release ? paletteForSlug(colours, release.slug, release.colors) : null;
}

export function floodForRelease(colours: ColourMap, release?: WrappedRelease | null): Flood {
  return floodFor(paletteForRelease(colours, release));
}

/** The fields RecordTile needs, from a Wrapped release. */
export function tileAlbum(release: WrappedRelease) {
  return {
    uri_release: releaseUri(release.slug),
    release_name: release.release_name,
    release_artist: release.release_artist,
  };
}

/**
 * A vivid sleeve colour to stand for a group of releases (a month, a genre,
 * a decade), preferring colours not already used so neighbours differ.
 */
export function groupColour(releases: WrappedRelease[], colours: ColourMap, used?: Set<string>): string {
  let fallback: string | null = null;
  for (const r of releases) {
    const c = vividFrom(paletteForRelease(colours, r));
    if (!c) continue;
    if (!used || !used.has(c)) {
      used?.add(c);
      return c;
    }
    fallback ??= c;
  }
  return fallback ?? NEUTRAL_FLOOD;
}

export function decadeOf(release: WrappedRelease): string | null {
  return originalDecade(release);
}

export function formatDay(iso: string, withYear = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined })
    .toUpperCase();
}
