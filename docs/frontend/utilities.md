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

### getTvRoomUrl

```typescript
getTvRoomUrl('electronic', 'medium'); // "/tv-rooms/electronic-medium.webp"
```

The `/tv` room photos (`hi-res` 3072px, `medium` 1536px, screen cut out). They are site
assets in `public/tv-rooms/`, served with the app, not from R2.

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

### Inherited vinyl colours: `boxMemberDiscs(tracklist, formats, contents)`

A boxset member links to the album's ordinary Discogs release, which is usually black; the
colour of its disc in the box lives only on the box. This returns the colour of each disc of
every linked member, keyed by `uri_release`, from the box's own detail JSON (`tracklist` and
`format_details`). It is best effort and needs no data change:

- The box's vinyl entries are laid out as discs in order (`qty` discs each, per-disc colours
  split from "Disc 1 White, Disc 2 Black", a single-sided disc taking one side), and the box's
  sides are handed to them in the order the tracklist first uses them. A member gets the discs
  that play its section's sides.
- Sides are read from positions: `A1` → A, `AA3` → AA, and a prefix is kept for boxes that
  restart the letters per disc (`1-C2` → 1C, `LP-B4` → LPB). CD and USB positions have none.
  A section may carry on the side before it (bonus sub-sections); if a side otherwise comes
  back, the sides are not trusted and the member takes the vinyl entry at its section's place.
- Members are matched to sections by title, preferring sections with vinyl sides (so
  "LP 1: Slayed? (Brown Vinyl)" beats a CD copy titled "Slayed?"), then exact, then loose
  matches, including a section title contained in the album's ("Vol. 4" for "Black Sabbath
  Vol 4"). Titles are compared with accents and Greek or Cyrillic look-alike letters folded
  ("Master Οf Reality" with an Omicron).
- Members with no coloured disc are left out, so they stay black.

Against the collection, 91 of the 107 members of coloured boxes inherit a colour; nearly all
the rest are genuinely black discs. The album page uses it for a member (when the release has
no colour of its own it loads the box's cached detail JSON) and for the box's "In this box"
panel (`BoxContents`'s `memberDiscs`). Tests: `src/lib/__tests__/boxDiscs.test.ts`.

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

## TV (`src/lib/tv.ts`)

Channels and schedules for `/tv` (see [pages](./pages.md#tvpage-srcpagestvpagetsx)).

```typescript
import { buildChannels, loadTv, onAir, slotsBetween } from '@/lib/tv';

const channels = buildChannels(await loadTv(), await loadCollection());
const { index, offset } = onAir(channel);            // what is on now, seconds in
const slots = slotsBetween(channel, from, to);       // guide rows (epoch ms)
```

- `loadTv()` fetches `/tv.json` once per tab.
- `buildChannels(tv, albums)` joins releases to the collection by `uri` and builds:
  01 Latest additions (the newest 100 records with videos), one channel per genre
  (Discogs genres and styles, after fuzzbox.tv's playlists; "Pop" is dropped when a
  release matches something more specific), Live (videos of kind `live`) and Everything
  Else (releases no genre channel takes). A video airs once per channel. Videos longer
  than 12 minutes stay off every channel but Live; missing durations count as 4 minutes.
  Each item's `artist` is the video's own `artist` from tv.json (compilations), else the
  release artist.
- Artist channels come from one pass over `tv.json` (`artistIndex`, cached per
  `tv.json`, about 20ms for the whole collection): each video goes to the artists its
  record credits (the credited `artists` and band `members`; the `uri_artist` headliner
  only when a record credits nobody, so a joint "A & B" credit doesn't get a channel of
  its own), or, when the video carries its own `artist` (compilations), to the artists
  of that name (compared ignoring case, accents, punctuation and Discogs' `(2)`
  suffixes). `various` is skipped. Full concerts up to 90 minutes stay in, as on Live.
- `artistChannel(tv, albums, artistSlug)` is `/tv/artist/<slug>`: on the clock like the
  other channels, numbered `AR`, in the room its records most often take, or null when
  the artist has no videos. A slug that isn't an index key is matched as the artist page
  does (`artistMatcher` in `src/lib/artistMatch.ts`, shared with `ArtistDetailPage`).
  Channels are cached, so the artist page's video count and the TV share one object.
  `artistChannelSlug(slug)` is `artist/<slug>`.
- `artistChannelList(tv, albums)` is every artist with a channel, A–Z, as `{ slug, name,
  videos, cover }` (`cover` is their newest record with videos), for the guide.
  `scripts/generate-sitemap.mjs` repeats the same rules to list the channels; change
  both together.
- Running orders are a shuffle seeded by the channel slug, with same-record neighbours
  pulled apart, and `onAir` counts from a fixed epoch, so every visitor sees the same
  schedule.
- `TV_ROOMS` lists the room photos and where each screen sits (% of the image,
  measured from the chroma-key green before it was cut out).
- `videoPath(channelSlug, item)` → `/tv/electronic/sneaker-pimps-6-underground-2eBZqmL8ehg`;
  `videoIdFromParam(segment)` reads the YouTube id back from the last 11 characters.
- `formatDuration`, `youTubeThumb` (YouTube's stills, external).

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
- `liftedPortraitFilter(backdropLuminance?)`: the portrait's CSS filter when a dark
  backdrop multiplies into a pale flood: greyscale, then contrast and brightness
  solved so blacks land near 0.28 (easing to 0.12 for a mid-dark backdrop) and the
  backdrop at 0.53, brightness capped at 1.8.
- `edgeGradient(edge, direction, start?, length?)`: an edge's colour profile as a
  CSS gradient, for carrying the photo on past that edge.
- `focusPosition(info)`: `object-position` for the phone crop, centred on the faces.
- `circleCrop(info)`: where the photo sits in `ArtistCard`'s round frame, as
  percentages of the frame (`width`, `height`, `left`, `top`), plus the hover
  zoom origin (the middle of the faces). Worked out on the original photo and
  placed in the centred square `medium` is cut to (both the dev server and
  `imageProcessor` crop `cover`/`center` to 800×800); `full: true` when the
  faces fall outside that square, so the card loads `hi-res` instead. Falls
  back to people boxes, then the focus point; `null` without any of them.

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
| `colourFamily(palette)` | `pink` \| `red` \| `orange` \| `yellow` \| `green` \| `teal` \| `blue` \| `purple` \| `mono`, from the flood's OKLCH hue for bold sleeves; `mono` for monochrome sleeves and missing palettes. Pink covers both ends of the hue circle (325°–12°) |
| `COLOUR_FAMILIES` | The families in wall order, each with a `label` and a fixed paint-chip colour (`chip`, a CSS background) |
| `luminance(hex)` | Relative luminance, 0 (black) to 1 (white) |
| `inkOn(bg)` | `INK` (`#0e0d0c`) or `CREAM` (`#fbf7ef`), whichever contrasts more |
| `subInk(ink)` | Softer secondary text for that ink |
| `BOLD_VIVID` | `vivid` at or above this (1) counts as a bold sleeve. Used by the home genre chips and the home Browse by colour strip |
| `INK`, `CREAM`, `GROUND`, `NEUTRAL_FLOOD` | Constants |

## Colour Families (`src/lib/colourFamilies.ts`)

`familyJumps(uris, colours)` takes a colour-sorted list of album URIs and
returns `{ id, label, chip, index, count }` for each colour family in it, in
list order: `index` is where the family's first record sits, `count` how
many records it has. Families with no records are left out. Pink starts the
wall and also closes it, so its `index` is the start and its `count` covers
both ends. Used by `ColourChips` on the albums page colour wall.

## Vinyl Colours (`src/lib/vinylLook.ts`)

Turns a coloured pressing into disc styling. The scrapper lifts Discogs' free-text colour
(`"Red Smoke"`, `"Clear w/ Red Splatter"`, `"Blue [Light]"`) into `vinyl_colours` on
`collection.json` and the album JSON (see [Pressing detail](../data/schemas.md#pressing-detail-format_details--vinyl_colours));
this reads one entry.

```typescript
import { discLook } from '@/lib/vinylLook';

<HeroRecord look={discLook(vinylColours, 0)} … />
<Vinyl label={flood.ground} look={discLook(vinylColours, discIndex)} />
```

| Export | Description |
|--------|-------------|
| `vinylLook(text)` | `{ body, pattern?, groove, rim }` for one colour string, or `null` for black, empty or unrecognised text (the disc stays black) |
| `discLook(colours, disc)` | The look for disc `disc` of a set: one colour covers every disc, several are one per disc with the last carrying on |
| `entryDiscColours(entry)` / `splitDiscText(text, qty)` | The colour of each disc in one format entry, splitting "Disc 1 White, Disc 2 Black" into `["White", "Black"]` (the scrapper folds it into one colour, "Disc White"); `pressingTitle(text, colour, qty)` titles such an entry "White / Black" |
| `pressingDiscs(details, colours)` | The colour of each disc, in order (null for a black disc): each Vinyl entry of the album JSON's `format_details` gives `qty` discs of its `colour`; without details it is one disc per `vinyl_colours` entry. Empty when no disc is coloured, so black sets keep one record |
| `colourTags(text)` / `COLOUR_FAMILIES` / `PATTERN_TAGS` | The filter tags for one pressing colour: its hue families (Clear, Red, Blue…), Gold & silver, Rainbow and its pattern (Splatter, Marbled, Split); used by the Coloured vinyl page. `COLOUR_FAMILIES` also carries a representative colour for each chip's dot |
| `pressingTitle(text, colour)` | How a vinyl entry reads in a list: its colour, else the text Discogs gave that is not a known note (so an unrecognised "Flame Vinyl" is shown as written), else "Black"; plus the remaining `extras` |
| `pressingExtras(text, colour)` | What a format's free text says besides its colour (`"Red Smoke, 180 Gram"` → `["180 Gram"]`); used by the album page's Pressing section |
| `discLooks(discs)` / `lookAt(looks, disc)` | The look of each disc from `pressingDiscs`, and the look of one disc (the last carrying on for a set with fewer entries) |

What it draws: solid colours get a darker edge; `translucent` / `transparent` are see-through
(the page shows through); `clear` (also `crystal`, `cloudy`) is glass; a colour after `Clear` is
tinted glass. Patterns are extra background layers on the grooves, so they turn with the record:
**marble** (soft blobs of the accent colours, also the default when two colours are named),
**swirl** (soft, streaky bands of the accent colours at half strength: concentric rings round the
label bent by a low-frequency noise displacement and blurred, so they drift and curl like real swirl
vinyl rather than stripe it; an SVG),
**splatter** (radial streaks thrown out from the centre: tapered wedges with a darker head, in
bursts, drawn as an SVG), **sparkle** (fine silver flecks over the colour, black when none is
named: sparse specks made with an SVG noise filter, about 0.6% of the disc plus a few brighter
glints, so they read as glitter and not dots), **split** (two halves), **smoke** (dark wisps),
**rainbow**, **flame** (made up: splatter in flame colours, fiery red-orange with orange and yellow
streaks, or those streaks over whatever colour is named, so `Yellow Flame` is yellow with flame
streaks; words `flame`, `flaming`, `flames`, `flamed`) and a metallic sheen for gold / silver / copper /
bronze / pearl. `Light` / `Dark` (or a
trailing `[Light]`) shade the next colour, and a bracketed `[Translucent]` still makes it see-through.
Other bracketed nicknames are ignored unless they hold the only colour. Patterns are seeded from
the text, so a record always looks the same.

A colour the scrapper approved is never drawn black. When Discogs says it is coloured without
saying which colour (`Coloured`, `Tri-Color`, `Multi-Coloured`, `Eco-Mix`, a bare `Marbled` or
`Splatter`) it is drawn as a mix: marbled blobs of a fixed four-colour palette over cream, clear glass
for a bare splatter, smoky grey for `Smokey`. Only plain black and text with no colour at all
(`Honey Vinyl`) return `null`.

**The vocabulary is a config file**, [`src/config/vinyl-colours.json`](../../src/config/vinyl-colours.json),
shared with the scrapper (which reads the same file at build time to decide what Discogs text
counts as a colour, so the two cannot drift). It holds the colour words and their hex values, the
two-word phrases (`baby blue`), the glass, translucent and metallic words, the `Light`/`Dark`
shades, the pattern words (matched by prefix, so `marbl` covers marble, marbled, marbling), the
"coloured without saying which" patterns, the mixed-colour palette, the sparkle colours, the
flame words and palette, the filter chips (families and their dots, pattern tags), the notes that are not colours
(`knownNotes`) and the scrapper's `notVinyl` and `filler` words. Add a word and rebuild; if it
changes what counts as a colour, run `scrapper backfill-formats` afterwards. A test checks the
file's shape (valid hex values, one lower-case word each, patterns that compile).

Looks are cached per colour text (a splatter is an SVG), so the same string is built once.
Where it shows, all from the same `vinyl_colours`:

- **Album page**: the hero shows every disc of the set (up to four), each in its own colour,
  fanned out behind the front record; each tracklist side's disc takes its LP's colour; and the
  box-set panel disc takes the selected member's colour in the box. A boxset member with no
  colour of its own inherits its discs' colours from the box (`boxMemberDiscs`, see
  [Box Set Discs](#inherited-vinyl-colours-boxmemberdiscstracklist-formats-contents)).
- **Every record tile** (albums, search, stats, artist, browse, "more by", home rows, Wrapped):
  the disc that slides out on hover.
- **Home hero, Wrapped heroes and shuffle**: the big disc (the home and Wrapped heroes fan out a
  multi-colour set the same way, one disc per colour; shuffle shows the first).
- **The logo and the footer record**: through `usePageFlood`'s `vinyl`, which the album, home
  hero, artist (newest record) and shuffle pages set, so both follow the record the page shows.

Records with no colour, black vinyl and other pages keep black discs. Tests:
`src/lib/__tests__/vinylLook.test.ts`.

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
