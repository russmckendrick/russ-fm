# Utilities Reference

This document covers all utility functions in the russ.fm frontend.

## Image Utilities (`src/lib/image-utils.ts`)

**CRITICAL**: Always use these functions for images. Never hardcode paths.

### getImageUrl

Environment-aware image URL generation.

```typescript
import { getImageUrl } from '@/lib/image-utils';

const url = getImageUrl('/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg');
// Development: /album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg
// Production: https://assets.russ.fm/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg
```

---

### migrateImageUri

Normalize image paths that arrive from generated JSON. Use this when a
data file already contains `/album/...jpg` or `/artist/...jpg` rather than
a slug. Existing absolute URLs are returned unchanged.

```typescript
import { migrateImageUri } from '@/lib/image-utils';

const url = migrateImageUri(release.images.medium);
// Development: /album/example/example-medium.jpg
// Production: https://assets.russ.fm/album/example/example-medium.jpg
```

---

### getAlbumImageUrl

Generate album image URL with proper sizing.

```typescript
import { getAlbumImageUrl } from '@/lib/image-utils';

const url = getAlbumImageUrl('radiohead-ok-computer', 'medium');
// /album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg

const hiRes = getAlbumImageUrl('radiohead-ok-computer', 'hi-res');
// /album/radiohead-ok-computer/radiohead-ok-computer-hi-res.jpg
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| albumSlug | `string` | Yes | Album folder slug |
| size | `'hi-res' \| 'medium'` | No | Image size (default: 'medium') |

**Important**: Only `'hi-res'` and `'medium'` sizes exist. Never use `'small'`.

---

### getArtistImageUrl

Generate artist image URL.

```typescript
import { getArtistImageUrl } from '@/lib/image-utils';

const url = getArtistImageUrl('radiohead', 'medium');
// /artist/radiohead/radiohead-medium.jpg
```

---

### getArtistAvatarUrl

Get artist avatar (small square format).

```typescript
import { getArtistAvatarUrl } from '@/lib/image-utils';

const url = getArtistAvatarUrl('radiohead');
// /artist/radiohead/radiohead-avatar.jpg
```

---

### getAlbumOGImageUrl

Get Open Graph image URL (always absolute).

```typescript
import { getAlbumOGImageUrl } from '@/lib/image-utils';

const url = getAlbumOGImageUrl('radiohead-ok-computer');
// https://russ.fm/og-images/radiohead-ok-computer.png
```

---

### getAlbumImageFromData

Extract slug from album data and get image.

```typescript
import { getAlbumImageFromData } from '@/lib/image-utils';

// album.uri_release = "/album/radiohead-ok-computer"
const url = getAlbumImageFromData(album.uri_release, 'medium');
```

This is the **recommended way** to get album images from album objects.

---

### getArtistImageFromData

Extract slug from artist data and get image.

```typescript
import { getArtistImageFromData } from '@/lib/image-utils';

const url = getArtistImageFromData(artist.uri_artist, 'medium');
```

---

### getArtistImageInfoUrl

The artist photo's placement and colour notes, `/artist/<slug>/<slug>-image.json`
(written by `scripts/generate-artist-images.js`). Always site-relative: the JSON ships
with the site, not R2. Load it with `useArtistImageInfo` (below), not `loadDetailJson`,
whose path clean-up rewrites any `/artist/` JSON path to the artist's detail file.

---

### handleImageError

Fallback handler for broken images.

```typescript
import { handleImageError } from '@/lib/image-utils';

<img
  src={imageUrl}
  onError={handleImageError}
  alt={title}
/>
```

Attempts to load an "unknown" placeholder image.

---

### getAlbumSlug / getArtistSlug

Extract slug from URI path.

```typescript
import { getAlbumSlug, getArtistSlug } from '@/lib/image-utils';

getAlbumSlug('/album/radiohead-ok-computer'); // 'radiohead-ok-computer'
getArtistSlug('/artist/radiohead'); // 'radiohead'
```

---

### sanitizeJsonPath

Normalize JSON file paths.

```typescript
import { sanitizeJsonPath } from '@/lib/image-utils';

sanitizeJsonPath('/album/some-album'); // '/album/some-album/index.json'
```

---

## Boxset Utilities (`src/lib/boxsets.ts`)

Boxset members are full collection entries linked to a parent box via the `boxset` field in
`collection.json` (see [data schemas](../data/schemas.md)). They keep their own page and stay
searchable, but must never double-count against the box on aggregate surfaces.

```typescript
// True when the album carries a `boxset` link
isBoxsetMember(album): boolean

// The collection without boxset members — use for stats, recents, and browse aggregates
excludeBoxsetMembers(albums): Album[]
```

`excludeBoxsetMembers` is memoised per input array (a `WeakMap`), so every caller passing the
same collection gets the same filtered array back. That keeps downstream caches such as the
genre explorer warm, but it also means the result is shared: copy it before sorting in place.

```typescript
const albums = [...excludeBoxsetMembers(raw)].sort(byDateAddedDesc);
```

**Where the filter is applied:** `HomePage` (hero, latest additions, counts, random picks,
colour strip), `StatsPage`, `AlbumsPage`, `ArtistsPage`, `RandomPage`, `GenrePage`,
`BrowseIndexPage`, `FacetListPage`, `FacetDetailPage`, and `scripts/generate-wrapped-data.ts`.
**Deliberately unfiltered:** the search index (`searchService`), `AlbumDetailPage` (members
need their entry; parents resolve `boxset_contents` against the full collection),
`ArtistDetailPage` discographies, the sitemap, and album-colors generation.

`AlbumDetailPage` renders the relationship both ways: members get a "From the box set" pill
in the hero, parents get the box set view (see [Box Set Discs](#box-set-discs-srclibboxdiscsts)).

## Box Set Discs (`src/lib/boxDiscs.ts`)

Builds the "In this box" disc list for a box set page from the **box's own Discogs
tracklist**, not from the member albums.

```typescript
import { buildBoxDiscs, type BoxTrack } from '@/lib/boxDiscs';

const discs = buildBoxDiscs(tracks as BoxTrack[], album.boxset_contents ?? []);
// → [{ title, member, tracks, sides }, …]
```

- Rows with no `position` are section headers; each header starts a disc and the positioned
  rows after it are its tracks. Headers with no tracks are dropped.
- Each section is linked to a `boxset_contents` member by title: exact normalised matches
  first (so "Ziggy (2003 Mix)" cannot take the original's slot), then a looser match that
  ignores bracketed text and allows prefixes. Each member is used once.
- Sections with no member become generic discs (`member: null`); the page draws them with the
  box cover and the header as the title.
- Members the tracklist never mentions are appended with no tracks.
- `sides` lists the side letters in box order (e.g. `["E", "F"]`), taken from the first
  character of each position.

## Collection Loader (`src/lib/collection.ts`)

Shared loader for `/collection.json`. The parsed collection is cached for the lifetime of the
tab, so moving between pages does not refetch it. A failed request clears the cache so the
next call retries.

```typescript
import { getLoadedCollection, loadCollection, loadDetailJson, useCollection } from '@/lib/collection';

const albums = await loadCollection();               // Promise<Album[]>
const cached = getLoadedCollection();                // Album[] | null, synchronous

const { albums, loading, error } = useCollection();  // in a component

const detail = await loadDetailJson<DetailedAlbum>(album.json_detailed_release);
```

- `getLoadedCollection()` returns the parsed collection if it has already loaded, otherwise
  `null`.
- `useCollection()` seeds its state from the cache, so once the collection has loaded it
  returns the data (with `loading: false`) on the first render.
- `loadDetailJson<T>(path)` is a second cache for the per-release and per-artist detail JSON.
  The path goes through `sanitizeJsonPath`, responses are cached per URL for the tab, and a
  failed request is dropped so the next call retries. The home hero prefetches its featured
  releases through it, and `AlbumDetailPage` / `ArtistDetailPage` load their detail JSON with
  it.

Use these rather than fetching `collection.json` or detail JSON in a page. Search
(`useSearch`) reads the collection through `loadCollection()` as well.

## Release Years (`src/lib/releaseYear.ts`)

`date_release_year` in `collection.json` is often a reissue date: the pressing's year, or a
streaming service listing the remaster. The scrapper adds `year_original`, the Discogs master
year or the earliest year any source reports (see [data schemas](../data/schemas.md)).

```typescript
import { originalYear, originalDecade } from '@/lib/releaseYear';

originalYear(album);    // 1991, or null when unknown
originalDecade(album);  // "1990s", or null
```

| Export | Description |
|--------|-------------|
| `originalYear(album)` | `year_original` when present, else the year of `date_release_year` (above 1900), else `null` |
| `originalDecade(album)` | `"1970s"` for the original year, or `null` |

Both take anything with `year_original` / `date_release_year`, so collection albums, search
albums and Wrapped releases all work. Anything that orders, groups, filters or labels records
by year uses these, never `date_release_year` directly: the `/albums` Year sort, filter and
tile meta, browse decades and facet year stats, the genre explorer, Stats decades and release
years, Wrapped `decadeOf`, search results, the home hero and random picks, the random crate
panel, and the album and artist pages. The album page shows the pressing's own date separately
("This pressing"), from the detail JSON.

## Artist Images (`src/lib/artistImage.ts`)

For the artist hero portrait (`ArtistPortrait`). The data comes from
`scripts/generate-artist-images.js`; see
[asset-processing.md](../build-pipeline/asset-processing.md#artist-image-notes) for how
to generate it and [schemas.md](../data/schemas.md#artist-image-json-artistslugslug-imagejson)
for the shape.

- `useArtistImageInfo(uriArtist)`: the photo's `ArtistImageInfo`, cached per URL;
  `undefined` while loading, `null` when there is no file.
- `portraitColumn(info, rowHeight)`: the desktop photo column's CSS width, the
  photo's width at the hero's height (320px to 50vw).
- `portraitLayout(info, stageW, stageH, textX, harsh)`: the desktop placement (photo
  size, the short lead-out past its right edge, right fade in stage px).
- `edgeGradient(edge, direction, start?, length?)`: an edge's colour profile as a
  CSS gradient, for carrying the photo on past that edge.
- `focusPosition(info)`: `object-position` for the phone crop, centred on the faces.

## Sleeve Colours (`src/lib/sleeveColour.ts`)

Reads an `album-colors.json` palette. Every colour (flood, ink, ground, glow, secondary, hue,
vividness) is decided at build time by `scripts/generate-album-colors.js`, Apple Music
artwork colours included, so every page shows the same flood for a sleeve and these helpers
only read it (see [asset-processing.md](../build-pipeline/asset-processing.md#color-extraction)
for how the colours are picked). The design rules are in
[design-system.md](./design-system.md#colour-helpers--srclibsleevecolourts).

```typescript
import { floodFor, colourBar, vividFrom } from '@/lib/sleeveColour';

const flood = floodFor(palette);
// { flood, ink, sub, ground, glow, secondary }
<div style={{ background: colourBar(flood) }} />
```

| Export | Description |
|--------|-------------|
| `floodFor(palette)` | `{ flood, ink, sub, ground, glow, secondary }` read from the palette. `ink` / `sub` are text colours for the flood; `ground` is the sleeve's own dark (vinyl labels, the album page ground); `glow` is the flood lifted to 3:1 on the ground (accents below a hero). A missing palette gets `NEUTRAL_FLOOD` (`#e8e2d6`) on `#1c1916` |
| `pageGround(flood)` | The dark a page sits on: the sleeve's `ground`, or, when that is a neutral near-black and the flood has colour, `#0e0d0c` mixed 20% toward the flood so the page never reads as plain black. Used by `recordsFlood` / `bandFromFlood` |
| `vividFrom(palette)` | The flood when `vivid > 0`, otherwise `null` (monochrome sleeves, missing palettes) |
| `colourBar(flood)` | CSS background for a tile's colour bar: the flood, split 62/38 with the secondary colour when there is one. Used by `RecordTile` |
| `colourSortKey(palette)` | Sort key for colour walls: bold sleeves by `hue` (0–1), then monochrome sleeves lightest first, then sleeves with no palette. Used by the albums page colour sort |
| `luminance(hex)` | Relative luminance, 0 (black) to 1 (white) |
| `inkOn(bg)` | `INK` (`#0e0d0c`) or `CREAM` (`#fbf7ef`), whichever contrasts more |
| `subInk(ink)` | Softer secondary text for that ink |
| `BOLD_VIVID` | `vivid` at or above this (1) counts as a bold sleeve. Used by the home genre chips and the home Browse by colour strip |
| `INK`, `CREAM`, `GROUND`, `NEUTRAL_FLOOD` | Constants |

## Browse Sleeve Helpers (`src/components/browse/facetSleeves.ts`)

Colouring for browse surfaces (facet cards, chips, detail floods) from a representative
sleeve. `ColourMap` is the `useAlbumColorMap()` result.

| Export | Description |
|--------|-------------|
| `sleeveVividness(uri, map)` | The palette's `vivid` score (0 for monochrome sleeves or no palette) |
| `mostVivid(items, uriOf, map, limit = 240)` | Most vivid item among the first `limit`; callers pass recency-sorted lists so ties go to the newest |
| `pickSleeves(albums, map, count = 5)` | Sleeves for a `FacetFan`: the most vivid first (it sets the flood), then recent records by different artists |
| `floodForUri(uri, map)` | `floodFor()` by album URI |
| `byDateAddedDesc(a, b)` | Newest-first comparator |
| `groupByFacet(facet, albums)` | `Map` of facet value → albums (an album can sit in several) |
| `heroTitleStyle(title, maxPx = 150)` | `{ condensed, fontSize }` scaling a title to its longest word; reads the column width from a `--title-col` custom property |

## Genre Colours (`src/components/genres/genreColours.ts`)

Sleeve colours for the genre atlas and map, built on the browse helpers.

| Export | Description |
|--------|-------------|
| `genreLead(genre, map)` | `{ flood, lead }` from the genre's most vivid recent record; cached per genre and map |
| `genreFlood(genre, map)` | The flood only |
| `albumFlood(album, map)` | The album's own sleeve flood |
| `artistFlood(artist, map)` | Flood of the artist's most vivid representative record |

Explorer URIs have no trailing slash; the helpers add one to match `album-colors.json` keys.

## Wrapped Sleeve Helpers (`src/pages/wrapped/utils/sleeves.ts`)

Wrapped JSON carries slugs instead of `uri_release`, and sometimes its own palette. These
helpers look colours up in `album-colors.json` first so Wrapped matches the rest of the site.

| Export | Description |
|--------|-------------|
| `releaseUri(slug)` / `artistUri(slug)` | `/album/{slug}/` and `/artist/{slug}/` |
| `paletteForSlug(colours, slug, fallback?)` / `paletteForRelease(colours, release)` | Palette from the map, falling back to the Wrapped palette |
| `floodForRelease(colours, release)` | `floodFor()` for a Wrapped release |
| `tileAlbum(release)` | The fields `RecordTile` needs |
| `groupColour(releases, colours, used?)` | A vivid colour for a group (month, genre, decade), preferring colours not already in `used` so neighbours differ |
| `decadeOf(release)` | `"1970s"` or `null`, from the original year (`originalDecade`) |
| `formatDay(iso, withYear = true)` | `"25 SEP 2026"` |

## Genre Utilities (`src/lib/genreUtils.ts`)

### getCleanGenres

Get cleaned genre list from album with fallback chain.

```typescript
import { getCleanGenres } from '@/lib/genreUtils';

const genres = getCleanGenres(album);
// Priority: Apple Music > Spotify > Discogs genres
// Filters out low-quality/invalid genres
```

---

### filterLowQualityGenres

Filter out invalid genre strings.

```typescript
import { filterLowQualityGenres } from '@/lib/genreUtils';

const genres = ['Electronic', 'rock', '12345', '', 'Ambient'];
const clean = filterLowQualityGenres(genres);
// ['Electronic', 'Ambient']
```

**Filtered out:**
- All lowercase genres
- Numeric genres
- Empty strings
- Genres matching artist name

---

### getCleanGenresFromArray

Simple array-based genre filtering.

```typescript
import { getCleanGenresFromArray } from '@/lib/genreUtils';

const genres = getCleanGenresFromArray(album.genre_names, album.release_artist);
```

This is the **recommended function** for genre filtering.

---

## Genre Explorer (`src/lib/genreExplorer.ts`)

Builds the `/genres` relationship model from static collection data.

```typescript
import { getGenreExplorer } from '@/lib/genreExplorer';

const explorer = getGenreExplorer(collection);
const rock = explorer.genres.find((genre) => genre.name === 'Rock');
```

`getGenreExplorer(collection)` is `buildGenreExplorer` memoised per collection array (a
`WeakMap`), so `GenrePage`, `AlbumDetailPage` and `ArtistDetailPage` share one copy for the
lifetime of the tab. Call `buildGenreExplorer` directly only when you need a fresh build.
Parsed date timestamps are cached inside the module, since the build sorts thousands
of records by date.

**Provides:**
- A global `All genres` summary for collection-wide graph/search mode
- Genre summaries with album counts, artist counts, year spans, full related-genre lists, and cover samples
- Artist summaries with genre-specific albums plus total collection counts
- Album summaries with slug, cover URL, artist, original year (`originalYear`), and connected genres
- Helpers for URL state resolution, filtering, and sorting
- Relationship helpers for detail-page recommendations:
  `getRelatedArtistsForArtist`, `getArtistGenreSummaries`, and
  `getRelatedAlbumsForAlbum`

The explorer uses `getCleanGenresFromArray` and image helpers from
`image-utils`; keep those helpers in place so `/genres`, `/albums`, and
detail pages share the same data contract.

---

## Scrobble Utilities (`src/lib/scrobbleTracks.ts`)

### toScrobbleTracks

Builds the track payload for an album scrobble from a rendered tracklist.

```typescript
import { toScrobbleTracks } from '@/lib/scrobbleTracks';

<AlbumScrobbleButton
  album={{
    artist: album.release_artist,
    album: album.release_name,
    tracks: toScrobbleTracks(tracks),
  }}
/>
```

It drops two kinds of row that must never reach Last.fm:

- **Position-less section headers** — Discogs marks sides, discs and box set albums with a
  row that has a title but no position ("Side :/", "Life In A Day"). They render in the
  tracklist but are not songs. Rows are only treated as headers when the tracklist actually
  uses positions, so the Spotify/Last.fm fallbacks (which carry none) pass through intact.
- **Untitled rows**, which Last.fm has nothing to match against.

Per-track artists are carried through for compilations. Tracks without one are still
returned — the worker resolves them against the release artist and skips the ones that land
on a placeholder, so it can report exactly what was left out. See
[Last.fm integration](../api-integrations/lastfm.md#album-scrobbling).

---

## Music Service Utilities (`src/lib/musicServiceUtils.ts`)

### URL Validation

```typescript
import { isValidSpotifyUrl, isValidAppleMusicUrl } from '@/lib/musicServiceUtils';

isValidSpotifyUrl('https://open.spotify.com/album/123'); // true
isValidAppleMusicUrl('https://music.apple.com/us/album/123'); // true
```

---

### URL Parsing

```typescript
import { parseSpotifyUrl, parseAppleMusicUrl } from '@/lib/musicServiceUtils';

parseSpotifyUrl('https://open.spotify.com/album/123?si=abc');
// { type: 'album', id: '123', market: null }

parseAppleMusicUrl('https://music.apple.com/us/album/title/123');
// { type: 'album', id: '123', storefront: 'us' }
```

---

### ID Extraction

```typescript
import { extractSpotifyAlbumId, extractAppleMusicAlbumId } from '@/lib/musicServiceUtils';

extractSpotifyAlbumId('https://open.spotify.com/album/123'); // '123'
extractAppleMusicAlbumId('https://music.apple.com/us/album/title/123'); // '123'
```

---

### Embed URL Generation

```typescript
import { buildSpotifyEmbedUrl, buildAppleMusicEmbedUrl } from '@/lib/musicServiceUtils';

buildSpotifyEmbedUrl('123');
// 'https://open.spotify.com/embed/album/123?utm_source=generator'

buildAppleMusicEmbedUrl('123');
// 'https://embed.music.apple.com/us/album/123'
```

---

### URL Normalization

```typescript
import { validateAndNormalizeUrl } from '@/lib/musicServiceUtils';

validateAndNormalizeUrl('open.spotify.com/album/123');
// 'https://open.spotify.com/album/123'
```

---

### Error Handling

```typescript
import { MusicServiceError } from '@/lib/musicServiceUtils';

try {
  parseSpotifyUrl(invalidUrl);
} catch (e) {
  if (e instanceof MusicServiceError) {
    console.log(e.service); // 'spotify'
    console.log(e.message); // Error details
  }
}
```

---

## Path Sanitization (`src/lib/sigurRosNormalizer.ts`)

### sanitizeFolderName

Convert text to URL-safe folder names.

```typescript
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';

sanitizeFolderName('Sigur Rós'); // 'sigur-ros'
sanitizeFolderName('Björk - Homogenic'); // 'bjork-homogenic'
sanitizeFolderName('( )'); // 'unknown'
```

**Handles:**
- Unicode spaces (various types)
- Accented characters (ü→u, é→e)
- Greek letters
- Japanese characters
- Special symbols (½→half, &→and)
- Multiple/leading/trailing dashes

Results are cached per input string. The function builds a regex per accent and symbol on
every uncached call (about 10µs), and the image and slug helpers run it for every sleeve on
every render; caching it took the genre explorer build from roughly 570ms to 25ms.

---

### Sigur Rós-Specific Functions

```typescript
import {
  isSigurRos,
  normalizeSigurRosTitle,
  normalizeSigurRosForPath,
  normalizeSigurRosArtistName
} from '@/lib/sigurRosNormalizer';

isSigurRos('Sigur Rós'); // true
isSigurRos('sigur ros'); // true

normalizeSigurRosTitle('( )'); // 'Untitled'
normalizeSigurRosForPath('( )'); // 'untitled'
normalizeSigurRosArtistName('sigur rós'); // 'Sigur Rós'
```

---

## Generic Utilities (`src/lib/utils.ts`)

### cn (Class Name Merger)

Merge Tailwind CSS classes with conflict resolution.

```typescript
import { cn } from '@/lib/utils';

cn('px-4 py-2', 'px-6'); // 'py-2 px-6' (px-6 wins)
cn('text-red-500', condition && 'text-blue-500');
cn(['flex', 'items-center'], 'gap-4');
```

Uses `clsx` for conditional classes and `tailwind-merge` for conflict resolution.

**Common Patterns:**
```typescript
// Conditional classes
<div className={cn('base-class', isActive && 'active-class')} />

// Variant handling
<Button className={cn(
  'px-4 py-2 rounded',
  variant === 'primary' && 'bg-blue-500 text-white',
  variant === 'secondary' && 'bg-gray-100 text-gray-800',
  className // Allow override
)} />

// Array of classes
<div className={cn([
  'flex',
  'items-center',
  'justify-between'
])} />
```

---

## Usage Examples

### Colour-led album hero

```typescript
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { CoverHero, HeroRecord, usePageFlood } from '@/components/player';

function AlbumHero({ album }) {
  const palette = useAlbumColors(album.uri_release);
  const flood = floodFor(palette);
  usePageFlood(flood.flood, flood.ink); // the nav takes the same colour

  return (
    <CoverHero
      flood={flood}
      art={
        <HeroRecord
          src={getAlbumImageFromData(album.uri_release, 'hi-res')}
          alt={album.release_name}
          labelColour={flood.ground}
        />
      }
    >
      <h1 className="t-cond">{album.release_name}</h1>
      <p style={{ color: flood.sub }}>{album.release_artist}</p>
    </CoverHero>
  );
}
```

For grids and rows, load the whole map once with `useAlbumColorMap()` and pass
`colourMap?.[album.uri_release]` to each `RecordTile`.

### Service Link Handling

```typescript
import {
  isValidSpotifyUrl,
  extractSpotifyAlbumId,
  buildSpotifyEmbedUrl
} from '@/lib/musicServiceUtils';

function SpotifyPlayer({ url }) {
  if (!isValidSpotifyUrl(url)) {
    return null;
  }

  const albumId = extractSpotifyAlbumId(url);
  const embedUrl = buildSpotifyEmbedUrl(albumId);

  return (
    <iframe
      src={embedUrl}
      width="100%"
      height="352"
      allow="encrypted-media"
    />
  );
}
```

---

## Best Practices

### Always Use Image Utilities

```typescript
// Correct
import { getAlbumImageFromData } from '@/lib/image-utils';
<img src={getAlbumImageFromData(album.uri_release, 'medium')} />

// Incorrect - breaks in production
<img src={album.images_uri_release['medium']} />
<img src={`/album/${slug}/${slug}-medium.jpg`} />
```

### Handle Missing Data

```typescript
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';

<img
  src={getAlbumImageFromData(album.uri_release, 'medium')}
  onError={handleImageError}
  alt={album.release_name || 'Album'}
/>
```

### Use Original Years

```typescript
// Correct
import { originalYear } from '@/lib/releaseYear';
albums.sort((a, b) => (originalYear(b) ?? 0) - (originalYear(a) ?? 0));

// Incorrect - often the reissue year
albums.sort((a, b) => b.date_release_year.localeCompare(a.date_release_year));
```

### Use cn for Class Merging

```typescript
// Correct
import { cn } from '@/lib/utils';
<div className={cn('base', props.className)} />

// Incorrect - classes may conflict
<div className={`base ${props.className}`} />
```
