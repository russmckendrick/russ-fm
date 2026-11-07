/**
 * The facts on the album page's artist band (components/album/ArtistBand),
 * read from the artist's detail JSON: Discogs for the real name and aliases,
 * TheAudioDB for years, home town and genre, Spotify for followers.
 */

/** The parts of `public/artist/<slug>/<slug>.json` the band reads. */
export interface ArtistFactSource {
  name: string;
  followers?: number;
  genres?: string[];
  services?: { spotify?: { followers?: { total?: number } } };
  raw_data?: {
    discogs?: { raw_data?: { realname?: string; aliases?: Array<{ name?: string }>; members?: unknown[] } };
    theaudiodb?: {
      born_year?: string | null;
      died_year?: string | null;
      formed_year?: string | null;
      country?: string | null;
      genre?: string | null;
      alternate_names?: string | null;
      /** How many members, as a string ("1" for a solo artist). */
      members?: string | null;
    } | null;
  };
}

export interface ArtistFacts {
  /** Label and value rows, in print order. */
  rows: Array<[string, string]>;
  /** Up to four genres, each once, in title case. */
  genres: string[];
}

const year = (y?: string | null) => (y && /^\d{4}$/.test(y.trim()) && y.trim() !== '0' ? y.trim() : null);
/** Discogs's "(2)"-style disambiguation, dropped. */
const plain = (s: string) => s.replace(/\s*\(\d+\)$/, '').trim();

export function artistFacts(data: ArtistFactSource | null | undefined): ArtistFacts {
  if (!data) return { rows: [], genres: [] };
  const adb = data.raw_data?.theaudiodb ?? null;
  const discogs = data.raw_data?.discogs?.raw_data;
  const name = data.name.trim().toLowerCase();

  const realName = discogs?.realname?.trim();
  const showRealName = realName && realName.toLowerCase() !== name ? realName : null;

  // "Walsall, England, UK" reads as "Walsall, England".
  const place = adb?.country ? adb.country.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ') : null;
  const born = year(adb?.born_year);
  const died = year(adb?.died_year);
  const formed = year(adb?.formed_year);

  const aliases = [
    ...(adb?.alternate_names ?? '').split(',').map(s => s.trim()),
    ...(discogs?.aliases ?? []).map(a => plain(a.name ?? '')),
  ].filter(a => a && a.toLowerCase() !== name && a.toLowerCase() !== realName?.toLowerCase());
  const aka = [...new Set(aliases)].slice(0, 2).join(', ');

  const followers = data.followers ?? data.services?.spotify?.followers?.total;

  const rows: Array<[string, string]> = [];
  if (showRealName) rows.push(['Real name', showRealName]);
  // TheAudioDB gives groups a "born" year too (Jamiroquai, 1992): a group with members reads as formed.
  const group = (discogs?.members?.length ?? 0) > 0 || Number(adb?.members ?? 0) > 1;
  if (group && (formed || born)) rows.push(['Formed', [formed ?? born, place].filter(Boolean).join(', ')]);
  else if (born) rows.push(['Born', [died ? `${born}–${died}` : born, place].filter(Boolean).join(', ')]);
  else if (formed) rows.push(['Formed', [formed, place].filter(Boolean).join(', ')]);
  else if (place) rows.push(['From', place]);
  if (aka) rows.push(['Also known as', aka]);
  if (followers) rows.push(['Followers', `${followers.toLocaleString('en-GB')} on Spotify`]);

  const title = (g: string) => g.trim().replace(/\b\w/g, c => c.toUpperCase());
  const seen = new Set<string>();
  // "Drum and bass", "Drum n Bass" and "Drum & Bass" are one genre.
  const key = (g: string) => ` ${g.toLowerCase()} `.replace(/\s(&|and|n)\s/g, ' & ').replace(/[^a-z&]/g, '');
  const genres: string[] = [];
  for (const g of [adb?.genre ?? '', ...(data.genres ?? [])]) {
    const k = key(g);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    genres.push(title(g));
    if (genres.length === 4) break;
  }

  return { rows, genres };
}
