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

### getWebGLTextureImageUrl

Create a texture-loader-safe image URL for WebGL/canvas use.

```typescript
import { getWebGLTextureImageUrl } from '@/lib/image-utils';

const textureUrl = getWebGLTextureImageUrl(albumCoverUrl);
```

Production R2 images get a stable `?cors=webgl` cache key so browsers do not
reuse a previous non-CORS `<img>` response when Three.js loads the same asset
with `crossOrigin="anonymous"`. Development and non-R2 URLs are returned
unchanged.

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
import { loadCollection, useCollection } from '@/lib/collection';

const albums = await loadCollection();               // Promise<Album[]>

const { albums, loading, error } = useCollection();  // in a component
```

Use these rather than fetching `collection.json` in a page. `AlbumDetailPage` and
`ArtistDetailPage` still fetch it directly.

## Sleeve Colours (`src/lib/sleeveColour.ts`)

Turns an `album-colors.json` palette into the colours a page paints with. The palette's
`accent` is often near-black on dark covers, so candidates are scored by saturation weighted
towards mid lightness and the best one is used. The design rules are in
[design-system.md](./design-system.md#colour-helpers--srclibsleevecolourts).

```typescript
import { floodFor, appleArtworkColours, inkOn, vividFrom, hue } from '@/lib/sleeveColour';

const flood = floodFor(palette, appleArtworkColours(detailedAlbum?.services));
// { flood, ink, sub, ground }
```

| Export | Description |
|--------|-------------|
| `floodFor(palette, extra?)` | `{ flood, ink, sub, ground }`. `flood` is the most vivid candidate or `NEUTRAL_FLOOD` (`#e8e2d6`); `ink` / `sub` are text colours for it; `ground` is the sleeve's dark background (used for vinyl labels and the album page ground) |
| `vividFrom(palette, extra?)` | Most vivid of `accent`, `muted` and `extra`, or `null` below the threshold (0.5) |
| `vividScore(hex)` | 0 for grey, near-black or near-white; up to ~2 for bold mid-lightness colours |
| `hue(hex)` | Hue 0–1, used by the colour sort |
| `inkOn(bg)` | `INK` (`#0e0d0c`) or `CREAM` (`#fbf7ef`), whichever contrasts more |
| `subInk(ink)` | Softer secondary text for that ink |
| `readableOn(colour, bg)` | The colour if it reaches 3:1 on `bg`, otherwise cream |
| `appleArtworkColours(services)` | Apple Music artwork `bgColor` / `textColor1` / `textColor2` from a detailed album JSON as `#hex` strings, for use as `extra` |
| `INK`, `CREAM`, `GROUND`, `NEUTRAL_FLOOD` | Constants |

## Browse Sleeve Helpers (`src/components/browse/facetSleeves.ts`)

Colouring for browse surfaces (facet cards, chips, detail floods) from a representative
sleeve. `ColourMap` is the `useAlbumColorMap()` result.

| Export | Description |
|--------|-------------|
| `sleeveVividness(uri, map)` | Vivid score of a sleeve's best colour (0 when none) |
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
| `decadeOf(release)` | `"1970s"` or `null` |
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
import { buildGenreExplorer } from '@/lib/genreExplorer';

const explorer = buildGenreExplorer(collection);
const rock = explorer.genres.find((genre) => genre.name === 'Rock');
```

**Provides:**
- A global `All genres` summary for collection-wide graph/search mode
- Genre summaries with album counts, artist counts, year spans, full related-genre lists, and cover samples
- Artist summaries with genre-specific albums plus total collection counts
- Album summaries with slug, cover URL, artist, year, and connected genres
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

## Color Utilities (`src/lib/color-utils.ts`)

> Only the unused legacy Wrapped section components still import this module. Current pages
> use [`sleeveColour.ts`](#sleeve-colours-srclibsleevecolourts).

### Color Conversion

```typescript
import { hexToRgb, rgbToHex } from '@/lib/color-utils';

hexToRgb('#ff6600'); // { r: 255, g: 102, b: 0 }
rgbToHex(255, 102, 0); // '#ff6600'
```

---

### Contrast & Accessibility

```typescript
import {
  getLuminance,
  getContrastRatio,
  hasGoodContrast,
  getBestTextColor,
  getReadableTextColor,
  getEnhancedTextColor
} from '@/lib/color-utils';

getLuminance('#ff6600'); // 0.32
getContrastRatio('#ffffff', '#000000'); // 21

hasGoodContrast('#ffffff', '#000000'); // true (>= 4.5:1)
hasGoodContrast('#ffffff', '#000000', 'AAA'); // true (>= 7:1)

getBestTextColor('#1a1a2e'); // '#ffffff' or '#000000'

getReadableTextColor('#1a1a2e', { preferLight: true });
// Returns best readable color with fallbacks

getEnhancedTextColor('#1a1a2e', isDarkMode);
// Returns { color, textShadow } for maximum readability
```

---

### Color Manipulation

```typescript
import { lightenColor, darkenColor, addAlpha } from '@/lib/color-utils';

lightenColor('#1a1a2e', 20); // 20% lighter
darkenColor('#ff6600', 10); // 10% darker
addAlpha('#ff6600', 0.5); // '#ff660080'
```

---

### Gradient Generation

```typescript
import {
  createAlbumGradient,
  createGlowGradient,
  createAlbumShadow,
  createColorBleeding,
  createHeroBackground
} from '@/lib/color-utils';

// Context-aware gradient
createAlbumGradient(colors, 'hero');
// Returns CSS gradient string for hero sections

createAlbumGradient(colors, 'card');
// Returns CSS gradient for card backgrounds

createGlowGradient(colors, 'medium');
// Returns glow effect gradient

createAlbumShadow(colors);
// Returns CSS box-shadow using album colors

createColorBleeding(colors);
// Returns vibrant overlay effect

createHeroBackground(colors);
// Returns bold hero section background
```

---

### CSS Custom Properties

```typescript
import { generateColorProperties, getComplementaryColors } from '@/lib/color-utils';

generateColorProperties(colors);
// Returns object for style prop:
// {
//   '--album-bg': '#1a1a2e',
//   '--album-fg': '#ffffff',
//   '--album-accent': '#ff6600',
//   '--album-muted': '#666666'
// }

getComplementaryColors(colors);
// Returns extended palette with lighter/darker variants
```

---

## Genre Color Generator (`src/lib/genreColors.ts`)

> Not used by any current component. Genre surfaces take sleeve colours from
> [`genreColours.ts`](#genre-colours-srccomponentsgenresgenrecoloursts) instead.

### getGenreColor

Consistent color hash from genre name.

```typescript
import { getGenreColor } from '@/lib/genreColors';

getGenreColor('Electronic'); // '#3b82f6' (consistent for same input)
getGenreColor('Rock'); // '#ef4444'
```

Uses HSL color space with 0-360° hue range.

---

### getGenreTextColor

Text color for genre tags.

```typescript
import { getGenreTextColor } from '@/lib/genreColors';

getGenreTextColor('Electronic'); // '#ffffff' (always white)
```

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

### Use cn for Class Merging

```typescript
// Correct
import { cn } from '@/lib/utils';
<div className={cn('base', props.className)} />

// Incorrect - classes may conflict
<div className={`base ${props.className}`} />
```
