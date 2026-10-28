/**
 * Build the data behind /explore (The Thread and The Galaxy) from public/.
 *
 * Writes into public/explore/ (gitignored, made in CI like public/og/):
 *
 *   explore.json    records, artists, people and the links between artists
 *   sleeves-N.webp  64px sleeve atlases, 64 x 64 cells per sheet, album order
 *   avatars.webp    64px artist avatar atlas, 40 columns, artist order
 *
 * The atlases are same-origin site assets because WebGL can't use images from
 * assets.russ.fm (no CORS header). Links come from Discogs members, groups and
 * aliases on the artist JSON, guest artists on tracks, and release credits
 * (`credits` / `tracklist[].extraartists`) once `scrapper backfill-credits` has
 * stored them. The shape is ExploreData in src/lib/explore/types.ts.
 *
 * Usage: pnpm run generate-explore [-- --no-atlas] [--public <dir>] [--out <dir>]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { avatarCrop } from '../src/lib/artistPhotoSource';
import { GENRE_FAMILIES } from '../src/lib/genreFamilyDefs';
import { creditKind, type CreditKind } from '../src/lib/explore/credits';
import type { ExploreAlbum, ExploreArtist, ExploreData, ExploreLink, ExplorePerson, LinkReason } from '../src/lib/explore/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const argValue = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
/** --public / --out read and write somewhere else (another checkout's data, a scratch dir). */
const PUB = path.resolve(argValue('--public') ?? path.join(ROOT, 'public'));
const OUT = path.resolve(argValue('--out') ?? path.join(PUB, 'explore'));

const SLEEVE = 64;
const SLEEVE_COLS = 64;
const AVATAR = 64;
const AVATAR_COLS = 40;
/** A credited person who links more artists than this is a hub (a mastering house, say), not a link. */
const MAX_CREDIT_PAIRS_ARTISTS = 12;

const withAtlas = !process.argv.includes('--no-atlas');
/** Where processed medium / avatar sizes live: public/ in dev, the asset cache or dist/ in CI. */
const SIZED = [PUB, path.join(ROOT, 'node_modules', '.cache', 'assets', 'images'), path.join(ROOT, 'dist')];
const sized = (kind: 'album' | 'artist', slug: string, size: string) => SIZED.map(dir => path.join(dir, kind, slug, `${slug}-${size}.jpg`));

const TERM_TO_FAMILY = new Map<string, string>();
for (const f of GENRE_FAMILIES) for (const t of f.terms) if (!TERM_TO_FAMILY.has(t)) TERM_TO_FAMILY.set(t, f.key);

function familyOf(styles: string[], genres: string[]): string {
  for (const t of styles) if (TERM_TO_FAMILY.has(t)) return TERM_TO_FAMILY.get(t)!;
  for (const t of genres) if (TERM_TO_FAMILY.has(t)) return TERM_TO_FAMILY.get(t)!;
  return genres.includes('Rock') ? 'hard' : 'pop';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const readJson = (file: string): Json | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const slugOf = (uri: string) => uri.replace(/\/+$/, '').split('/').pop() ?? '';
const cleanName = (name: string) => name.replace(/\s*\(\d+\)$/, '').trim();

function yearInt(v: unknown): number | null {
  const y = parseInt(String(v ?? '').slice(0, 4), 10);
  return y > 1900 && y < 2100 ? y : null;
}

function ytId(uri: string | undefined): string | null {
  const m = (uri ?? '').match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const collection: Json[] = readJson(path.join(PUB, 'collection.json')) ?? [];
const colours: Record<string, Json> = readJson(path.join(PUB, 'album-colors.json')) ?? {};
const tvReleases: Json[] = readJson(path.join(PUB, 'tv.json'))?.releases ?? [];
const tv = new Map<string, Json>(tvReleases.map(r => [r.uri, r]));

// ---- artists ----------------------------------------------------------------

const artistSlugs = [...new Set(
  collection.flatMap(c => (c.artists ?? []).map((a: Json) => (a.uri_artist ? slugOf(a.uri_artist) : null)).filter(Boolean)),
)].filter(s => s !== 'various').sort() as string[];

const artists: ExploreArtist[] = [];
const artistIndex = new Map<string, number>();
const byName = new Map<string, string>();
const byDiscogs = new Map<string, string>();
const discogsRaw = new Map<string, Json>();

for (const slug of artistSlugs) {
  const d = readJson(path.join(PUB, 'artist', slug, `${slug}.json`));
  if (!d) continue;
  const rd = d.raw_data ?? {};
  const dg = rd.discogs?.raw_data ?? {};
  const tadb = rd.theaudiodb ?? {};
  const img = readJson(path.join(PUB, 'artist', slug, `${slug}-image.json`)) ?? {};
  const videos: [string, string, string][] = [];
  for (const v of [...(rd.theaudiodb_videos ?? []), ...(rd.wikidata_videos ?? [])]) {
    const id = ytId(v.uri);
    if (id && !videos.some(x => x[0] === id)) videos.push([id, v.track ?? '', v.album ?? '']);
  }
  // Only the fanart the artist page hero uses (scripts/generate-artist-images.js) is uploaded to R2.
  const fanart = img.fanart?.file && fs.existsSync(path.join(PUB, 'artist', slug, img.fanart.file)) ? String(img.fanart.file) : null;
  const salient = (fanart ? img.fanart.salient : img.subject && [img.subject[0], img.subject[1], img.subject[2] - img.subject[0], img.subject[3] - img.subject[1]]) as number[] | undefined;
  const bio = String(d.biography || tadb.biography_en || '').replace(/\r/g, '').trim();
  artistIndex.set(slug, artists.length);
  artists.push({
    slug,
    name: d.name || slug,
    bio: bio.length > 320 ? `${bio.slice(0, 320).replace(/\s+\S*$/, '')}…` : bio,
    genre: tadb.genre ?? d.genres?.[0] ?? null,
    mood: tadb.mood ?? null,
    cc: tadb.country_code ?? null,
    from: tadb.country ?? null,
    born: yearInt(tadb.born_year),
    formed: yearInt(tadb.formed_year),
    died: yearInt(tadb.died_year),
    fanart,
    focus: salient ? [round(salient[0] + salient[2] / 2), round(salient[1] + salient[3] / 3)] : (img.focus ?? null),
    photo: img.source && /-fanart\d\d\.jpg$/.test(img.source) ? String(img.source) : null,
    crop: photoCrop(img),
    members: (dg.members ?? []).map((m: Json) => cleanName(m.name ?? '')).slice(0, 12),
    videos: videos.slice(0, 8),
    records: [],
  });
  byName.set(String(d.name || slug).toLowerCase(), slug);
  if (d.discogs_id) byDiscogs.set(String(d.discogs_id), slug);
  discogsRaw.set(slug, dg);
}

/** The avatar's square (avatarCrop, round the faces) as fractions of the photo, so `medium` can be cut the same way. */
function photoCrop(img: Json): [number, number, number, number] | null {
  const c = img?.width && img?.height ? avatarCrop(img) : null;
  return c ? [round(c.left / img.width), round(c.top / img.height), round(c.size / img.width), round(c.size / img.height)] : null;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Discogs member ids per artist, so a band's own players aren't counted as guests on its records. */
const memberIds = new Map<string, Set<string>>();
for (const [slug, dg] of discogsRaw) memberIds.set(slug, new Set((dg.members ?? []).map((m: Json) => String(m.id))));

// ---- albums -----------------------------------------------------------------

const albums: ExploreAlbum[] = [];
const guestLinks: { host: string; guest: string; album: number; track: string }[] = [];
/** discogs id -> credits on records: album index, role, kind */
const credited = new Map<string, { name: string; credits: { album: number; role: string; kind: CreditKind }[] }>();
let creditedRecords = 0;

for (const c of collection) {
  const slug = slugOf(c.uri_release);
  const pal = colours[c.uri_release] ?? {};
  const aSlugs = (c.artists ?? [])
    .map((a: Json) => (a.uri_artist ? slugOf(a.uri_artist) : null))
    .filter((s: string | null): s is string => !!s && artistIndex.has(s));
  const vids: [string, string, string][] = (tv.get(c.uri_release)?.videos ?? []).map((v: Json) => [v.id, v.title ?? '', v.kind ?? '']);
  const rank = (k: string) => (k === 'video' ? 0 : k === 'live' ? 1 : 2);
  vids.sort((x, y) => rank(x[2]) - rank(y[2]));
  const i = albums.length;
  albums.push({
    slug,
    t: c.release_name ?? '',
    by: c.release_artist ?? '',
    a: aSlugs.map((s: string) => artistIndex.get(s)!),
    y: c.year_original ?? yearInt(c.date_release_year),
    added: c.date_added ?? null,
    g: c.genre_names ?? [],
    s: c.styles ?? [],
    l: c.labels ?? [],
    c: c.country ?? null,
    fam: familyOf(c.styles ?? [], c.genre_names ?? []),
    fmt: c.format_primary ?? null,
    vc: c.vinyl_colours?.[0] ?? null,
    lis: c.lastfm_listeners ?? 0,
    fl: pal.flood ?? '#777777',
    ink: pal.ink ?? '#ffffff',
    gr: pal.ground ?? '#111111',
    h: typeof pal.hue === 'number' ? pal.hue : 0,
    viv: pal.vivid ?? 1,
    v: vids.slice(0, 5),
  });
  for (const s of aSlugs) artists[artistIndex.get(s)!].records.push(i);

  const d = readJson(path.join(PUB, 'album', slug, `${slug}.json`));
  if (!d) continue;
  const guests = new Map<string, string>();
  for (const tr of d.tracklist ?? []) {
    for (const ta of tr.artists ?? []) {
      const g = byName.get(cleanName(typeof ta === 'string' ? ta : ta?.name ?? '').toLowerCase());
      if (g && !aSlugs.includes(g) && !guests.has(g)) guests.set(g, tr.title ?? '');
    }
  }
  for (const [g, track] of guests) for (const host of aSlugs) guestLinks.push({ host, guest: g, album: i, track });

  // Release credits: everyone on `credits` and the rows' `extraartists`, one role list per person.
  if (Array.isArray(d.credits)) {
    creditedRecords++;
    const roles = new Map<string, { name: string; roles: string[] }>();
    const all = [...d.credits, ...(d.tracklist ?? []).flatMap((t: Json) => t.extraartists ?? [])];
    for (const cr of all) {
      if (!cr?.discogs_id) continue;
      const id = String(cr.discogs_id);
      const entry = roles.get(id) ?? { name: cleanName(cr.name ?? ''), roles: [] };
      for (const r of String(cr.role ?? '').split(',')) {
        const role = r.replace(/\[.*?\]/g, '').trim();
        if (role && !entry.roles.includes(role)) entry.roles.push(role);
      }
      roles.set(id, entry);
    }
    for (const [id, { name, roles: rs }] of roles) {
      // Credits on the record's own artists, or a band's own members, say nothing new.
      if (aSlugs.includes(byDiscogs.get(id) ?? '') || aSlugs.some((a: string) => memberIds.get(a)?.has(id))) continue;
      const kinds = rs.map(creditKind).filter((k): k is CreditKind => k !== null);
      if (!kinds.length) continue;
      const kind = (['produced', 'played', 'wrote', 'engineered', 'designed'] as CreditKind[]).find(k => kinds.includes(k))!;
      const role = rs.find(r => creditKind(r) === kind)!;
      const p = credited.get(id) ?? { name, credits: [] };
      p.credits.push({ album: i, role, kind });
      credited.set(id, p);
    }
  }
}

// ---- links between artists ----------------------------------------------------

const links = new Map<string, LinkReason[]>();
const reasonKey = (r: LinkReason) => JSON.stringify(r);

function addLink(a: string, b: string, reason: LinkReason) {
  if (a === b) return;
  const key = [a, b].sort().join('\u0000');
  const list = links.get(key) ?? [];
  if (!list.some(r => reasonKey(r) === reasonKey(reason))) list.push(reason);
  links.set(key, list);
}

interface PersonDraft { name: string; thumb: string | null; bands: Set<string>; credits: { album: number; role: string; kind: CreditKind }[] }
const people = new Map<string, PersonDraft>();
const person = (id: string, name: string): PersonDraft => {
  let p = people.get(id);
  if (!p) people.set(id, (p = { name, thumb: null, bands: new Set(), credits: [] }));
  if (!p.name) p.name = name;
  return p;
};

for (const [slug, dg] of discogsRaw) {
  for (const kind of ['members', 'groups', 'aliases'] as const) {
    for (const m of dg[kind] ?? []) {
      const id = String(m.id);
      const other = byDiscogs.get(id);
      const type = kind === 'members' ? 'member' : kind === 'groups' ? 'group' : 'alias';
      if (other && other !== slug) addLink(slug, other, { type, who: cleanName(m.name ?? ''), from: artistIndex.get(slug)! });
      if (kind === 'members') {
        const p = person(id, cleanName(m.name ?? ''));
        p.thumb = p.thumb ?? m.thumbnail_url ?? null;
        p.bands.add(slug);
        if (other) p.bands.add(other);
      }
    }
  }
  // A solo artist's own groups count as that person's bands too.
  const ownId = [...byDiscogs].find(([, s]) => s === slug)?.[0];
  if (ownId) {
    for (const g of dg.groups ?? []) {
      const other = byDiscogs.get(String(g.id));
      if (other) {
        const p = person(ownId, artists[artistIndex.get(slug)!].name);
        p.bands.add(slug).add(other);
      }
    }
  }
}

for (const [id, c] of credited) person(id, c.name).credits.push(...c.credits);

const peopleOut: ExplorePerson[] = [];
for (const [id, p] of people) {
  const bands = [...p.bands].filter(b => artistIndex.has(b)).sort();
  const creditArtists = new Set(p.credits.flatMap(c => albums[c.album].a));
  if (bands.length < 2 && creditArtists.size < 2 && !(byDiscogs.has(id) && p.credits.length)) continue;
  const pi = peopleOut.length;
  peopleOut.push({
    id,
    name: p.name,
    thumb: p.thumb,
    bands: bands.map(b => artistIndex.get(b)!),
    artist: byDiscogs.has(id) ? artistIndex.get(byDiscogs.get(id)!) ?? null : null,
    credits: p.credits.map(c => [c.album, c.role, c.kind]),
  });
  for (let x = 0; x < bands.length; x++) {
    for (let y = x + 1; y < bands.length; y++) addLink(bands[x], bands[y], { type: 'bandmate', who: p.name, person: pi });
  }
  // A collection artist credited on someone else's record: Robert Fripp on "Heroes".
  const own = byDiscogs.get(id);
  if (own) {
    for (const c of p.credits) {
      for (const host of albums[c.album].a) addLink(own, artists[host].slug, { type: 'credit', who: p.name, person: pi, album: c.album, role: c.role, kind: c.kind });
    }
  }
  // Two artists who share a producer, a session player or a sleeve designer.
  if (creditArtists.size >= 2 && creditArtists.size <= MAX_CREDIT_PAIRS_ARTISTS) {
    const firstByArtist = new Map<number, (typeof p.credits)[number]>();
    for (const c of p.credits) for (const a of albums[c.album].a) if (!firstByArtist.has(a)) firstByArtist.set(a, c);
    const list = [...firstByArtist];
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const [a, ca] = list[x];
        const [b, cb] = list[y];
        // Two artists on one record (a split, a collaboration) already share it.
        if (ca.album === cb.album) continue;
        addLink(artists[a].slug, artists[b].slug, {
          type: 'shared-credit', who: p.name, person: pi,
          albums: [ca.album, cb.album], roles: [ca.role, cb.role], kinds: [ca.kind, cb.kind],
        });
      }
    }
  }
}

for (const g of guestLinks) {
  addLink(g.host, g.guest, { type: 'guest', album: g.album, track: g.track, host: artistIndex.get(g.host)!, guest: artistIndex.get(g.guest)! });
}

const linksOut: ExploreLink[] = [...links].map(([key, why]) => {
  const [a, b] = key.split('\u0000');
  return { a: artistIndex.get(a)!, b: artistIndex.get(b)!, why };
});

const data: ExploreData = {
  v: 1,
  generated: new Date().toISOString(),
  families: GENRE_FAMILIES.map(f => ({ key: f.key, code: f.code, name: f.name })),
  albums,
  artists,
  people: peopleOut,
  links: linksOut,
  atlas: {
    sleeve: SLEEVE,
    cols: SLEEVE_COLS,
    sheets: Math.ceil(albums.length / (SLEEVE_COLS * SLEEVE_COLS)),
    avatar: AVATAR,
    avatarCols: AVATAR_COLS,
    avatarRows: Math.ceil(artists.length / AVATAR_COLS),
  },
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'explore.json'), JSON.stringify(data));
const counts: Record<string, number> = {};
for (const l of linksOut) for (const w of l.why) counts[w.type] = (counts[w.type] ?? 0) + 1;
console.log(`✓ explore.json: ${albums.length} records, ${artists.length} artists, ${peopleOut.length} people, ${linksOut.length} links`);
console.log(`  reasons ${JSON.stringify(counts)}; ${creditedRecords} records have credits`);

// ---- atlases ----------------------------------------------------------------

async function tile(files: string[], size: number): Promise<Buffer | null> {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      return await sharp(file).resize(size, size, { fit: 'cover' }).removeAlpha().raw().toBuffer();
    } catch {
      // try the next source
    }
  }
  return null;
}

async function atlas(
  out: string,
  count: number,
  cols: number,
  rows: number,
  size: number,
  source: (i: number) => string[],
  fallback: (i: number) => string,
) {
  const composites: sharp.OverlayOptions[] = [];
  const batch = 32;
  for (let start = 0; start < count; start += batch) {
    const tiles = await Promise.all(Array.from({ length: Math.min(batch, count - start) }, (_, k) => tile(source(start + k), size)));
    tiles.forEach((buf, k) => {
      const n = start + k;
      const left = (n % cols) * size;
      const top = Math.floor(n / cols) * size;
      composites.push(buf
        ? { input: buf, raw: { width: size, height: size, channels: 3 }, left, top }
        : { input: { create: { width: size, height: size, channels: 3, background: fallback(n) } }, left, top });
    });
  }
  await sharp({ create: { width: cols * size, height: rows * size, channels: 3, background: '#141414' } })
    .composite(composites)
    .webp({ quality: 80 })
    .toFile(out);
}

if (withAtlas) {
  const per = SLEEVE_COLS * SLEEVE_COLS;
  for (let sheet = 0; sheet < data.atlas.sheets; sheet++) {
    const chunk = albums.slice(sheet * per, (sheet + 1) * per);
    await atlas(
      path.join(OUT, `sleeves-${sheet}.webp`), chunk.length, SLEEVE_COLS, Math.ceil(chunk.length / SLEEVE_COLS), SLEEVE,
      i => [...sized('album', chunk[i].slug, 'medium'), path.join(PUB, 'album', chunk[i].slug, `${chunk[i].slug}-hi-res.jpg`)],
      i => chunk[i].fl,
    );
  }
  await atlas(
    path.join(OUT, 'avatars.webp'), artists.length, AVATAR_COLS, data.atlas.avatarRows, AVATAR,
    i => [...sized('artist', artists[i].slug, 'avatar'), path.join(PUB, 'artist', artists[i].slug, `${artists[i].slug}-hi-res.jpg`)],
    () => '#1e1e1e',
  );
  console.log(`✓ atlases: ${data.atlas.sheets} sleeve sheet(s), avatars`);
}
