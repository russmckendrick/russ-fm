# Pages Reference

This document covers the route-level page components in russ.fm.

> **Player redesign.** Every page uses the player design described in
> [`design-system.md`](./design-system.md): a dark ground, colour floods
> taken from the sleeves, `CoverHero` / `RecordTile` / `SectionHeading`
> from `src/components/player/`, and plain section titles. Data contracts,
> query-string deep links and features (scrobbling, embeds, Wrapped
> presentation, search) are unchanged unless noted below.

## Structure by page

| Route | Structure |
|-------|-----------|
| `/` | `ReleaseRoom` rotating through the latest additions → Latest additions row → Most collected + Genres (with headline counts) → Random picks → Browse by colour strip. |
| `/albums/:page` | `Albums` title with the count in dim type (with `sort=colour`, a compact title and colour-family paint chips that jump through the wall) → sort pills (incl. Colour) → format chips → search + Genre / Year pill selects → `RecordTile` grid, or the colour wall when `sort=colour` → pill pager. |
| `/album/:slug` | `ReleaseRoom` (the record's listening room) and a band in the sleeve's flood → About → Tracklist by side → Listen → Videos → artist bios → Last.fm / details sidebar → More by the artist → Similar albums. Box sets swap in the box hero and an "In this box" section. |
| `/artist/:slug` | Flood panel (portrait, name, stats, bio, a "Watch N videos" pill to the artist's TV channel when they have videos, service pills, genre links) → Discography (record tiles, Recently added / By year toggle) → Similar artists. The flood is the hero photo's own colour (the newest sleeve's until the photo's notes load). |
| `/artists/:page` | `Artists` title with count → search + sort pills → A–Z strip → `ArtistCard` grid with letter (A–Z) or month (Latest added) dividers, or a ranked list (Most records) → pill pager. |
| `/search?q=…` | `Search` title with count → search field → All / Albums / Artists pills → `SearchResults` grid. |
| `/genres` | Flood band: `BrowseHeader` + what the record shows (all genres, a family, or a lit genre) beside the genre record (`GenreDisc`) → Families (Side A / Side B, colour barcodes) + newest records → Most collected ranked rows + A–Z index, all coloured from sleeves. |
| `/browse`, `/labels`, `/decades`, `/countries` | `BrowseHeader` → `FacetCard` colour cards → chips for the long tail. |
| `/coloured-vinyl` | `BrowseHeader` → colour-family and pattern filter chips → a wall of still records: each coloured pressing drawn as a disc in its real colour with the sleeve on its label. |
| `/label/:slug`, `/decade/:slug`, `/country/:slug`, `/genre/:slug` | Flood hero with a fan of sleeves → paginated `RecordTile` grid. |
| `/stats` | `Stats` title → headline counts → month chart → growth → decades / genres → release years → most collected → formats / countries → labels → latest additions → hidden gems → random picks / artists. All bars take sleeve colours. |
| `/shuffle` (also `/random`) | Split-flap board clatters to a random record; its colour drops down the page and the cover turns back over the spinning record. |
| `/wrapped/:year` | The year as a scroll of twelve chapters (`story/WrappedStory.tsx`): cover → sleeve by sleeve → every day → around the clock → weight and length → coloured vinyl → artists → genres → decades → behind the glass → connections → every sleeve. A floating control switches year or opens the full-screen `Presentation`. |

## Route Map

```mermaid
flowchart TB
    subgraph Routes
        Home["/"]
        Albums["/albums"]
        AlbumsPage["/albums/:page"]
        AlbumDetail["/album/:slug"]
        Artists["/artists"]
        ArtistsPage["/artists/:page"]
        ArtistDetail["/artist/:slug"]
        Stats["/stats"]
        Genres["/genres"]
        GenreDetail["/genre/:slug"]
        Browse["/browse"]
        ColouredVinyl["/coloured-vinyl"]
        Labels["/labels"]
        LabelDetail["/label/:slug"]
        Decades["/decades"]
        DecadeDetail["/decade/:slug"]
        Countries["/countries"]
        CountryDetail["/country/:slug"]
        Random["/shuffle, /random"]
        Tv["/tv, /tv/:channel"]
        TvArtist["/tv/artist/:slug"]
        TvGuide["/tv/guide"]
        Explore["/explore, /explore/:slug"]
        Thread["/explore/thread"]
        Search["/search"]
        Wrapped["/wrapped"]
        WrappedYear["/wrapped/:year"]
        WrappedYTD["/wrapped/ytd"]
    end

    Home --> HomePage
    Albums --> AlbumsPage
    AlbumsPage --> AlbumsPage
    AlbumDetail --> AlbumDetailPage
    Artists --> ArtistsPage
    ArtistsPage --> ArtistsPage
    ArtistDetail --> ArtistDetailPage
    Stats --> StatsPage
    Genres --> GenrePage
    GenreDetail --> FacetDetailPage
    Browse --> BrowseIndexPage
    ColouredVinyl --> ColouredVinylPage
    Labels --> FacetListPage
    LabelDetail --> FacetDetailPage
    Decades --> FacetListPage
    DecadeDetail --> FacetDetailPage
    Countries --> FacetListPage
    CountryDetail --> FacetDetailPage
    Random --> RandomPage
    Tv --> TvPage
    TvArtist --> TvArtistPage
    TvGuide --> TvGuidePage
    Explore --> ExploreGalaxyPage
    Thread --> ExploreThreadPage
    Search --> SearchResultsPage
    Wrapped --> WrappedYear
    WrappedYear --> WrappedYearPage
    WrappedYTD --> WrappedYTDPage
```

## Core Pages

### HomePage (`src/pages/HomePage.tsx`)

**Route:** `/`, `/home`

The home page sections are local components in `HomePage.tsx`; the old
`src/components/home/` directory has been removed.

- **Hero** — a `ReleaseRoom` with the latest `numberOfFeaturedAlbums`
  additions (boxset members excluded), each in its own room, crossfading
  between them (see [release room](./release-room.md)). The page flood fades
  to each record's colour (`floodFor` over the sleeve palette). Below the
  room, a band in the flood: original year / label / format / sides / tracks
  (from each record's detailed JSON), the title in a one-line box (links to
  the album), the artist and a "View album" link. The records' credits share
  one grid cell, so the band never changes height. The controls sit on the
  band's right (under the credit below `lg`).
  Numbered progress bars pick a record, flanked by previous and next
  buttons; there is no pause control. Only the record on show spins. The active bar is a CSS animation (`.hero-progress`
  in `src/styles/player.css`, `scaleX` 0 → 1 over `autoRotateInterval`)
  and its `onAnimationEnd` advances to the next record, so there is no
  interval timer. Under
  `prefers-reduced-motion` there is no bar and no auto-rotation. The
  featured releases' detail JSON is prefetched through `loadDetailJson()`,
  so opening one from the hero needs no further fetch.
- **Latest additions** — horizontal `shelf-scroll` row of `RecordTile`s,
  with the number added this year as the note.
- **Most collected** — top six artists by record count.
- **Genres** — genre chips sized by count and coloured by the flood of the
  newest bold sleeve in the genre (`vivid` ≥ `BOLD_VIVID`, else `#e8e2d6`), then headline counts (records, on vinyl, box sets, artists).
- **Random picks** — `RecordTile` grid with a Shuffle pill; tiles show the
  original year.
- **Browse by colour** — recent bold vinyl sleeves (`vivid` ≥ `BOLD_VIVID`)
  sorted by the palette's `hue`, shown
  as a colour bar and a strip of cover tiles, linking to
  `/albums/1?sort=colour`.

**Data:** `useCollection()` and `useAlbumColorMap()`, plus each featured
record's `json_detailed_release`.

**Configuration** (`src/config/app.config.ts`, read by this page):

```typescript
homepage: {
  hero: {
    numberOfFeaturedAlbums: 8, // records in the hero rotation
    autoRotateInterval: 7000,  // ms per record
  },
  recentlyAdded: { displayCount: 16 },
  randomCollection: { displayCount: 12 },
}
```

---

### AlbumsPage (`src/pages/AlbumsPage.tsx`)

**Route:** `/albums`, `/albums/:page`

Paginated album browser. Page number is in the path, filters in the query
string; changing a filter goes back to page 1 and default values are
dropped from the URL.

**URL Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `:page` | `number` (path) | 1 | Current page. A non-numeric value redirects to `/album/:page` |
| `sort` | `date_added \| release_name \| release_artist \| date_release_year \| colour` | `date_added` | Sort order. `date_release_year` keeps its name for existing links but sorts by original year (`originalYear()`) |
| `format` | `string` | – | `format_primary` filter (chips for Vinyl and Box sets) |
| `genre` | `string` | – | Genre filter |
| `year` | `string` | – | Original release year filter; the Year select and tile meta use the same year |
| `search` | `string` | – | Matches title, artist, genres, credited artists and band members |

**Colour sort (`?sort=colour`).** Records are ordered by
`colourSortKey()` from `src/lib/sleeveColour.ts`: sleeves with a bold
flood by its hue, then monochrome sleeves, light to dark. The page shows twice as many records per page and a dense
wall of `.tile` covers whose caption slides up in the sleeve colour.

The header band swaps the large title for a smaller `Albums` + count line
with `Page n of N`, and a row of `ColourChips`: one paint chip per colour
family (Pink, Red, Orange, Yellow, Green, Teal, Blue, Purple, Mono) with its
record count. A chip jumps to the page holding that family's first record
(opening at the top, like the pager). The chips for the families on the
current page are raised and ringed. Families and counts follow the current
filters.

**Examples:**

```
/albums/1?genre=Electronic
/albums/2?genre=Electronic&sort=release_name
/albums/1?format=Vinyl&year=1990
/albums/1?sort=colour
```

Boxset members are excluded. Data comes from `useCollection()` and
`useAlbumColorMap()`.

---

### AlbumDetailPage (`src/pages/AlbumDetailPage.tsx`)

**Route:** `/album/:slug`

The page background is the sleeve's own dark (`flood.ground`) and the
hero is the flood colour, which the nav also takes. Accents below the hero
(links, kickers, track numbers) use `flood.glow`, the flood lifted to 3:1
on the ground.

**Hero** — the record's listening room (`ReleaseRoom`, see
[release room](./release-room.md)): the sleeve on a stand, the pressing
(disc 1, `discLooks`) playing on the turntable, the "Added" / "Scrobbled"
sticker (`HeroSticker`) on the sleeve from `md` up. Box sets keep the cover
hero (`CoverHero` + `BoxHeroArt`) with the full text column.

**Band** (one row in the flood):

- Format / discs / pressing colours / label / original year / country, then
  the title in a one-line box (`.room-title-box`), then the artists and the
  genres. The year is `originalYear()` (see
  [utilities](./utilities.md#release-years-srclibreleaseyearts)), not the
  pressing's date. A "Various" credit reads "Various Artists".
- **Band line-up** — when `collection.json` carries `members`, a "With …"
  line sits under the artists; members with an artist page are linked.
  Member credits (`role: "member"` in the album JSON) are left out of the
  artist bio section. "From the box set" pill for boxset members.
- Actions on the right: `AlbumScrobbleButton` (the record spins at 45 while
  it runs, and the genres give way to the track being scrobbled), then icon
  buttons with the brand icons for Spotify, Apple Music and Discogs, and the
  Thread.

**Main column:**

- **About this record** — description with an expand toggle.
- **Tracklist** — grouped by side (and by LP for multi-disc sets). Each
  side has a small disc and its label; scrobbling is whole-album only, from
  the hero. Section-header rows render as kickers. Each track deep-links to Spotify when a match exists
  (matched by normalised title via
  [`src/lib/trackMatching.ts`](../../src/lib/trackMatching.ts)). On a
  compilation, each track's artists link to their artist page when they have
  one (`trackArtistPage()`, from
  [compilations.json](../data/schemas.md#compilationsjson), loaded only for
  compilations).
- **Listen** — `MusicPlayerSection`: YouTube (the default when there are videos), Apple Music and Spotify tabs.
  The release's YouTube videos live in the YouTube tab (`AlbumTv`, a mini
  russ.fm/tv on the site-wide TV player, always, built from the release's links when `tv.json` lacks the record), not
  a separate section, so an album with dozens of videos costs no extra
  height. The section shows when any of the three is available.
- **Artist bios** — one panel per credited artist with a biography, with a
  link to the artist's records in the collection.

**Sidebar:** Last.fm panel in the flood colour (scrobbles, listeners,
link), release details, identifiers, pressing, sleeve colours, copyright.
"Pressing" (`Pressing` in the page file, from the detail JSON's `format_details`;
not shown on box sets) lists each vinyl disc set as a small record in its own
colour, titled with the colour (or "Black") and a mono line of what Discogs
says: disc count when more than one, the format descriptions (LP, Album,
Reissue…) and the rest of the format text (180 Gram, Gatefold…). Other formats
(CD, cassette) are plain rows, and the edition tags that apply to the whole
release (Limited Edition, Remastered…) sit underneath as small outlined tags. On a
boxset member with no colour of its own, the section instead lists the discs it has in the
box, in the colours inherited from the box ([`boxMemberDiscs`](./utilities.md#inherited-vinyl-colours-boxmemberdiscstracklist-formats-contents)),
with "From the <box> box set" linking to it; the hero, tracklist discs, Format line (which
then says Vinyl) and the logo and footer records follow the same colours. "Sleeve
colours" is a strip of the sleeve's main swatches (`useAlbumSwatches()`),
each as wide as the share of the sleeve it covers, plus dots for the flood
and secondary colour; it appears once `album-swatches.json` has loaded.
In the release details "Released" is the original year; "This pressing"
shows the pressing's own date (detail JSON `released`, else `year`) and
appears only when it differs. "Format" reads e.g. `Vinyl · Red & Yellow ·
2 discs · 4 sides`: the vinyl colours (`vinyl_colours`, detail JSON first,
else `collection.json`) come after the format and are left out for black
vinyl or when Discogs records no colour. The same colours paint the records
on the page (see [Vinyl colours](./utilities.md#vinyl-colours-srclibvinyllookts)):
the hero shows every disc of a multi-disc set in its own colour (up to four), the
front record pulled out furthest in, the rest tucked behind it a little further
out each and fading while the scrobble scene plays; hovering the record slides the discs out further, over the start of the title;
each tracklist side's small
disc takes its LP's colour, and the logo and footer record follow the first disc through
`usePageFlood`'s `vinyl`. The home hero, artist page, shuffle, Wrapped and every
`RecordTile` do the same for their records. Black vinyl keeps a black record.

**Below:** "More by" the artist (boxset members excluded; newest original
year first, labelled with that year) and **Similar
albums**, ranked by `getRelatedAlbumsForAlbum` from shared clean genres,
excluding the same artist.

**Box set view.** When the album has `boxset_contents`:

- The hero art is `BoxHeroArt`: the box cover with a thick edge and its
  discs fanned out behind it. The hero shows the number of albums instead
  of a scrobble button.
- An "In this box" section (`BoxContents`) sits above the main column.
  The discs come from `buildBoxDiscs()` in `src/lib/boxDiscs.ts`, which
  splits the **box's own tracklist** at its section headers (rows with no
  position) and links each section to a member album by title. Sections
  with no member page become generic discs drawn with the box cover and
  the section title; members the tracklist never mentions are appended.
- Selecting a disc (in the fan or the tab row) updates a panel in that
  album's flood colour with its sleeve and disc, tracks grouped by side,
  a scrobble button for that disc and a link to its album page.
- The normal tracklist is hidden; "About this record" becomes "About this
  box set".

**Data Source:** the shared collection from `useCollection()` for the
hero, artists, box contents and related records, plus the release's detail
JSON (`/album/{slug}/{slug}.json`) via `loadDetailJson()`. `findAlbum()`
resolves the slug synchronously (exact URI first, then sanitised name +
Discogs ID) and `findSimilarAlbums()` reads related records from
`getGenreExplorer()`, so the hero renders straight from collection data
while the detail JSON fills in the tracklist, notes and services. The route
goes through `AlbumRouteHandler`, which keys the page by slug so moving to
another album mounts a fresh page. The page meta description and the
JSON-LD `datePublished` use the original year too.

**Description:** `services.perplexity.description` when there is one. Without
it, the longest of Apple Music's editorial notes (`raw_attributes.editorialNotes`
short/standard, `editorial_notes`) and the Last.fm wiki (`wiki_summary`,
`wiki_content`), HTML stripped (`getAlbumDescription`). The page meta
description (`buildAlbumDescription`) also leads with Perplexity.

---

### ArtistsPage (`src/pages/ArtistsPage.tsx`)

**Route:** `/artists`, `/artists/:page`

- `Artists` title with the count in dim type, and a mono line about the
  whole collection under it: records, the most collected artist (linked) and
  how many artists were first added this year
- Pill search field and sort pills (A–Z, Most records, Latest added)
- Scrollable A–Z strip (letters without artists are disabled)
- Each sort has its own layout:
  - **A–Z** and **Latest added**: an `ArtistCard` grid
    (`grid-flow-row-dense`). Each ring takes the flood colour of the artist's
    latest record from `useAlbumColorMap()`, and the sleeves of their three
    most recently added records fan out from behind the photo on hover. Artists with 5+ records get a
    double-size `feature` tile (two columns by two rows from `sm` up). A cream
    divider card (`RunDivider`: label large, the run's artist count, a tab on
    top) leads each run inline in the grid, as tall as the artist tiles: the
    first letter in A–Z (digits and punctuation under `#`, accents dropped),
    the month of the latest record in Latest added (`SEP` / `2026`)
  - **Most records**: a ranked list (`RankedArtists`): rank, `ArtistPhoto`,
    name, the artist's two most common genres, a bar for the record count
    against the top artist in the current filter (in their latest sleeve's
    colour) and the count. Two columns from `lg`, read down then across
- Pill pager
- "Various Artists" excluded; boxset members excluded

**URL Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `:page` | `number` (path) | 1 | Current page |
| `sort` | `name \| albums \| latest` | `name` | Sort order |
| `letter` | `string` | – | First letter (A–Z) |
| `search` | `string` | – | Search query |

```
/artists/1?letter=A
/artists/1?sort=albums&letter=M
```

Loads the collection through the shared `loadCollection()`.

---

### ArtistDetailPage (`src/pages/ArtistDetailPage.tsx`)

**Route:** `/artist/:slug`

The page takes the colour of the artist's newest addition, skipping
monochrome (`vivid` 0) sleeves, via `newestFlood(uris, map)`. (Picking the
most vivid sleeve instead let saturated red covers win almost half of all
artist pages.) The nav follows it via `usePageFlood`, and the sleeve's dark
`ground` swatch tints the rest of the page.

- **Header** — the artist's fly-poster on a wall (`PosterWall`; see
  [artist poster wall](./artist-wall.md)). There is one wall per `/tv` room,
  picked by `artistWallFor()`: the room most of their records play in. The
  poster has:
  - **Photo:** their fanart, else their own photo, cropped round the faces
    (`phoneCrop`).
  - **Name:** the page's `h1`, overprinted.
  - **Sleeves:** the newest four, each linking to its record.
  The poster is worn into the wall by the wall's own shade and a
  scuffed-ink texture, and the whole wall is tinted with the flood. The
  header is see-through over it (`room: true`).
- **Band** — one row in the flood with facts and links only, since the
  poster carries the name. The facts are a `<dl>`:
  - From and Formed
  - Records, Soundtracks, Box sets
  - Released: the earliest to the latest original year, or the one year
    when they match
  - Last.fm listeners
  - three genre links to `/genre/:slug`
  The links are icon buttons:
  - the artist's TV channel, when there are videos
  - Spotify, Apple Music, Last.fm, Discogs and Wikipedia, with brand icons
    (`serviceIconFor`)
  - the Thread
  Wikipedia uses the stored `wikipedia_url` when available, otherwise a
  constructed URL.
  (Before 2026-11-04 the header was the photo itself: the fanart in its own
  colour, faded into a flood of the photo's colour, with the name, stat
  chips and service pills beside it. Before 2026-10-25 it was a greyscale
  print in the sleeve's flood.)
- **Biography** — its own full-width section under the band and above the
  discography (the Various Artists page's one-line biography too), set in columns (one on phones, two from `md`, three from
  `xl`). It uses the longer of `biography` and Last.fm's full
  `services.lastfm.bio_content` (tags and the "Read more on Last.fm" /
  licence tail stripped), shows whole paragraphs up to about 1,500
  characters, then a Read more toggle.
- **Discography** — `RecordTile`s on the page ground with a two-way
  toggle in the section heading (hidden when the artist has one record):
  - **Recently added** (default) — one grid, newest additions first, each
    tile showing the date added.
  - **By year** — grouped by decade of original release, oldest first,
    with a decade label and record count beside each group (sticky on
    desktop); tiles show the original year, "Undated" groups last.
  "Box set" is appended to the tile meta where it applies. Tiles show the
  release artist only when it differs from the page's artist (joint
  releases, band-member credits). Years come from `originalYear()`, never
  `date_release_year`, which is often a reissue date. The flood always
  uses the last three additions, whichever order is showing.
- **Similar artists** — in-collection artists from
  `services.lastfm.similar_artists[]` first, then genre-overlap candidates,
  shown as `ArtistCard`s.

Records include releases where the artist is credited only as a band
member (`members[]` in `collection.json`).

**Data Source:** the shared collection from `useCollection()` and the
artist's detail JSON via `loadDetailJson()`. `findArtistAlbums()` picks the
artist's records (and the detail JSON path) from the collection
synchronously, and `findSimilarArtists()` falls back to
`getGenreExplorer()` for genre-overlap candidates. `ArtistRouteHandler`
keys the page by slug, so moving to another artist mounts a fresh page.

**Various Artists (`/artist/various`):** the page for every record credited to Discogs'
"Various" placeholder, rendered by the same component (`various` is true for the slug):

- The poster says "Various Artists" (Discogs calls it "Various"), and the band has Records,
  Soundtracks and the release span and only the Discogs link (no Wikipedia fallback, no
  genres, no Thread). The one-line biography from the scrapper is the Biography section.
  Its photo is generated artwork (fanned record sleeves); the poster uses
  `various-fanart01.jpg`, the wide version.
- The discography is `VariousShelves`: All, Soundtracks, Anthologies, Series and Tributes
  (`shelfOf()` in `src/lib/compilations.ts`), newest additions first, 24 tiles then Show all.
  Each tile's meta is its shelf (on All), how many artists are credited on it, and its year.
- Similar artists is replaced by `WhoTurnsUp`: the artists with a page who play on the
  compilations, most compilations first (18, then Show all), then the most credited artists
  without a page as plain names. Both come from
  [compilations.json](../data/schemas.md#compilationsjson).
- No biography section and no MusicGroup JSON-LD.

**Also appears on:** on every other artist page, under the discography, `AlsoAppearsOn` lists
the compilations they play on (a track credit, not the record's own credit), newest additions
first, each with their tracks there as its meta. Records already in their discography are left
out.

---

### StatsPage (`src/pages/StatsPage.tsx`)

**Route:** `/stats`

Collection statistics. Every bar and chart takes colours from the sleeves
it counts: a month is a stack of that month's records, a genre or decade
takes the colour of a representative record. Boxset members are excluded.

**Sections**, ordered so sleeves and portraits alternate with charts, and
paired into columns on `lg`+ (stacked below that) with the artwork side
swapping from row to row:

- Title band ("Since" the first addition) in the latest additions' colour
- Headline counts (records, artists, genres, records per artist), each in
  a sleeve colour, then smaller counts (labels, countries, one-record
  artists, artists with 5+, busiest month)
- Latest additions (a shelf of sleeves, full width)
- Most collected artists (7 cols) | Genres (5 cols, 13 bars)
- Added per month (one block per record, full width)
- Decades (5 cols) | **Hidden gems** (7 cols, 8 sleeves under
  `redesignConfig.stats.hiddenGemsListenersThreshold` Last.fm listeners)
- Golden year (with four of its sleeves) | top release years
- Random picks (full width)
- Cumulative growth (8 cols) | Formats (`format_primary`, 4 cols)
- Labels (28 chips) | Countries
- Random artists

Decades, release years and the release-year colour groups use the
original year (`originalYear()`). Links go to `/decades`, `/genres`,
`/genre/:slug`, `/labels`, `/countries`.

Counts are driven by `redesignConfig.stats`. The aggregations read fields
denormalised into `collection.json` (`format_primary`, `labels`,
`country`, `lastfm_listeners`); there are no per-album JSON fetches.

---

### Browse facets (`src/pages/browse/`)

**Routes:**

| Route | Component | Purpose |
|-------|-----------|---------|
| `/browse` | `BrowseIndexPage` | Four large `FacetCard`s (genres, labels, decades, countries), each in the colour of a vivid record from its biggest value, with the distinct count and the top value, then a full-width Coloured vinyl card |
| `/coloured-vinyl` | `ColouredVinylPage` | Every coloured pressing as a still record; see below |
| `/labels` | `FacetListPage facetKey="label"` | Every label with its record count |
| `/label/:slug` | `FacetDetailPage facetKey="label"` | Records on one label |
| `/decades` | `FacetListPage facetKey="decade"` | Every decade |
| `/decade/:slug` | `FacetDetailPage facetKey="decade"` | Records in one decade (e.g. `/decade/1980s`) |
| `/countries` | `FacetListPage facetKey="country"` | Every Discogs country |
| `/country/:slug` | `FacetDetailPage facetKey="country"` | Records for one country |
| `/genre/:slug` | `FacetDetailPage facetKey="genre"` | Records in one genre |

**Coloured vinyl** (`ColouredVinylPage`, also under Browse in the nav
dropdown, the mobile menu, the footer and the sitemap) is not a facet: it lists
every record with `vinyl_colours` (boxset members excluded), newest first. Each
is a still `Vinyl` (`spin={false}`, class `vinyl-wide` for a bigger label) in its
pressing colour, patterns included, with the sleeve printed on the label; a set
of several colours draws up to three discs, the first in front and the others
fanned out behind it in their own colours. Under the header a row of chips
filters by colour family (Clear, White, Yellow, Orange, Red, Pink, Purple, Blue,
Green, Brown, Grey, Gold & silver, Rainbow) or pattern (Splatter, Marbled, Split),
each with its count; the choice is in the URL (`?colour=Red`) so a view can be
linked. The families and patterns come from `colourTags()` in
[`vinylLook.ts`](./utilities.md#vinyl-colours-srclibvinyllookts); a record can be
in several (Clear With Red Splatter is Clear, Red and Splatter). 60 records show
at first with a "Show more" button, since each disc carries its own pattern. On a
phone the chips are one scrolling row so the discs stay in view.

**List pages** show every value as a colour `FacetCard` when there are 12
or fewer; otherwise the top eight are cards and the full list follows as
`.chip`s coloured by a representative sleeve, with a text filter. Sort
pills switch between record count and name (decades default to name).

**Detail pages** open with a flood hero in the colour of the value's most
vivid recent sleeve (the nav follows): a back link, the name scaled to
its longest word (`heroTitleStyle`), record / artist / year-span counts,
the most collected artists as pills and a linked `FacetFan` hanging over
the grid. Below, a `RecordTile` grid with sort pills (Recently added,
Release year, A–Z) and a pill pager. Decades, the year span and the
Release year sort all use the original year (`originalDecade()` /
`originalYear()`).

All four pages use `useCollection()` and `useAlbumColorMap()`, exclude
boxset members, and share the helpers in
[`facetSleeves.ts`](./utilities.md#browse-sleeve-helpers-srccomponentsbrowsefacetsleevests).
Facet definitions come from
[`src/lib/browseFacets.ts`](../../src/lib/browseFacets.ts); adding a new
axis is one entry in `FACETS` plus two routes. The format filter on
`/albums?format=…` stays inline in `AlbumsPage`.

---

### GenrePage (`src/pages/GenrePage.tsx`)

The collection drawn as a record, built from `/collection.json` (via
`loadCollection()`, box set members excluded). Every album is one tile in
its sleeve's flood colour; the disc is cut into 12 genre families
(`buildGenreFamilies()` in `src/lib/genreFamilies.ts`), coded A1–A6 and
B1–B6 like a record's sides, with the oldest records (by `originalYear()`)
at the rim and the newest by the label. The ranked list and A–Z still come
from `getGenreExplorer()`.

**Route:** `/genres`

**URL Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `family` | family key (`prog`, `hard`, `pop`, `folk`, `soul`, `hiphop`, `screen`, `elec`, `wave`, `punk`, `indie`, `alt`) | – | Picked slice, e.g. `/genres?family=prog` |
| `genre` | genre name | – | Lights that genre's records across the disc, e.g. `/genres?genre=Prog%20Rock`. Ignored when `family` is set |

Both are written with `replace`, so picking slices does not fill the
history. Old map parameters (`artist`, `album`, `sort`, `q`, `nodes`) are
ignored.

**Layout:**

- A `FloodBand` holding the `BrowseHeader` (its title steps down to 80px from
  `lg` until `2xl`, as it shares the row with the record) and one of
  `AllDetail` / `FamilyDetail` / `LitDetail` (`src/components/genres/GenreRecord.tsx`),
  beside the `GenreDisc`. Stacked (below `lg`) the record hangs over the next
  section like a hero cover; from `lg` it sits inside the band.
- The band, nav and page ground take: the picked family's boldest new record
  (the most vivid of its 3 newest), a lit genre's lead (`genreLead()`), or the
  boldest of the 3 newest additions. That record is also printed on the
  disc's centre label (`LabelCover`, crossfading).
- `FamilyList`: the families as Side A / Side B rows, each with a colour
  barcode (its sleeves sorted by `colourSortKey`, as long as its share of the
  biggest family), beside the six newest records in the current view
  (`RecordTile`).
- **Most collected** ranked rows and the **A–Z** index. Their record buttons
  light that genre on the disc and scroll back up to it.

**Record behaviour:**

- Click a slice (or its rim marker, or its row) to pull it out and dim the
  rest; click a tile in the picked slice to open that record; click the
  label to go back to all genres.
- Pointing at a tile shows a card with the sleeve, title, artist, original
  year and family.
- Style buttons in the family detail and the top genres in the all-genres
  detail light that genre. A lit genre shows where its records sit
  ("Where it sits": records per family) and links to `/genre/:slug`.
- Shuffle opens a random record from the current view.
- Slice pull-out, dimming and lighting ease over a few frames on the canvas;
  with `prefers-reduced-motion` they jump straight to the end state.

---

### RandomPage (`src/pages/RandomPage.tsx`)

**Routes:** `/shuffle` (what the nav, footer and Stats "More" link use) and
`/random`, kept for old links. Both render the same page.

- Shuffle links (header pill, mobile menu, footer) come from `shuffleLink()`
  in `src/lib/shuffleLink.ts`. Away from the page they go to `/shuffle`; on it
  they keep the current URL and pass `{ reshuffle: true }` as navigation state
  (React Router replaces the entry, so Back is not filled with shuffles), and
  `ShuffleScene` runs a shuffle for each new location key carrying that state,
  scrolling to the top first. The nav closes its menus on every navigation
  (`location.key`), so the mobile menu closes too

- Loads the shared `loadCollection()` (boxset members excluded) and
  `preloadAlbumColors()` together, so the first record lands in its own colour
- `ShuffleScene` (`src/pages/random/ShuffleScene.tsx`): the cover and its
  record on the left (centred above the board below 1024px), the `FlapBoard`
  (`src/pages/random/FlapBoard.tsx`) on the right with Artist, Title, then
  Year and Genre rows, and Shuffle / View album pills under it
- Each shuffle runs three phases:
  1. **rolling**: the cover turns edge-on so the record hidden behind it shows,
     spinning at 45 with the incoming sleeve on its label, while the tiles
     flip to the new record in a left-to-right, top-to-bottom cascade (tiles
     blank before and after stay still)
  2. **dropping**: the new flood falls down the page like a flap (`.flap-drop`,
     a hard edge, no blend)
  3. **idle**: the page, nav (`usePageFlood` with the cover and ground) and
     text take the new colours and the cover turns back over the record
- At rest the record sits hidden directly behind the cover; it never slides
  out on this page
- Board layout comes from `redesignConfig.random`: 20 columns (1 artist row,
  3 title rows) from 640px up, 12 columns (2 artist rows, 3 title rows) below.
  Tiles size themselves from the board width with container units. Text is
  upper-cased with accents stripped; titles that run past the last row end in
  an ellipsis, and the genre is the first clean genre that fits
  (`src/lib/splitFlap.ts`)
- Year and genre letters use the record's `glow`; the Artist and Title rows
  link to the artist and album
- Reduced motion: tiles and colour switch at once, the cover does not turn
- Loading skeleton (blank sleeve and board), retryable error ("Try again")
  and empty states
- No audio

---

### TvPage (`src/pages/TvPage.tsx`)

**Routes:** `/tv` (channel 01, Latest additions), `/tv/:channel` (a channel slug such
as `/tv/electronic`; an unknown slug redirects to `/tv`), `/tv/:channel/:video` (one
video, e.g. `/tv/electronic/sneaker-pimps-6-underground-2eBZqmL8ehg`) and `/tv/guide`
(`TvGuidePage`). The nav has a TV item.

- **Artist channels.** `/tv/artist/:slug` and `/tv/artist/:slug/:video`
  (`TvArtistPage`) play one artist's videos on the same scene: channel `AR`, named after
  the artist, built by `artistChannel()` (see [utilities](./utilities.md#tv-srclibtvts)).
  The artist page links to it with a "Watch N videos" pill (a `Tv` icon, first in the
  service pills and the filled one; without videos the first service is filled instead), shown
  only when the channel has videos; an artist with none gets a
  "No videos for this artist yet" page with a link back. The address follows the video
  as on any channel (`videoPath('artist/<slug>', item)`), and the floating player links
  back to it.

- **Shareable URLs.** While the TV page is showing, its address follows the video on
  screen (`videoPath()`: artist and title words, then the 11-character YouTube id, the
  only part `videoIdFromParam()` reads). The update replaces the history entry, so Back
  leaves the TV, and carries `{ tvSync: true }` so `ScrollToTop` leaves the scroll
  alone. The page title is the song and artist too. Opening a video link tunes its
  channel and starts that video from the beginning (then the channel plays on); an id
  the channel doesn't have falls back to what is airing. Guide blocks link to their
  video, except the one on air, which links to the channel live.

Music television from the collection's videos, after fuzzbox.tv. Data is `/tv.json`
(written by the scrapper beside `collection.json`, see
[schemas](../data/schemas.md#tvjson)) joined to the collection by `uri`; channels are
built once per tab by `buildChannels()` in `src/lib/tv.ts` (see
[utilities](./utilities.md#tv-srclibtvts)).

- **Channels run on the clock.** Each channel's running order is a fixed seeded
  shuffle, so `onAir(channel)` gives the same programme at the same time for everyone.
  Opening a channel starts the video that is on now, part-way through. After that it
  plays on in order; previous/next and the Up next tiles jump within the channel.
- **The room.** `TvRoom` (`src/pages/tv/TvRoom.tsx`) draws a room photo whose TV
  screen has been cut out (transparent), sizes it so the screen is a set size and
  keeps the photo covering the box (the TV page passes `zoom={1.35}` to move in on
  the set), and marks where the screen is with
  `.tv-screen-slot` (scanlines, channel number, bug and the static burst live there).
  A masked `mix-blend-mode: color` layer (`.tv-room-tint`) tints the room, never the
  screen, with the sleeve colour of the video on screen. Each channel has its own room
  (after fuzzbox's per-genre backgrounds); the room pill cycles through them.
- **The player lives above the routes.** `TvProvider` (`src/components/tv/`, wrapped
  round the app in `App.tsx`) owns the one YouTube player (`useTvPlayer`, the IFrame
  Player API with no controls) and the tuning (channel, position), so leaving the page
  never stops it; moving an iframe would reload it, so it never moves in the DOM.
  Its layer (`.tv-layer`) is laid over the TV page's screen slot (`setSlot`) in page
  coordinates at z-index 1, under the room photo (2) and the slot's overlays (3), so
  the picture shows through the glass. On any other page it floats bottom left
  (`data-mode="mini"`) with a bar in the sleeve colour: artist and title, play/pause,
  sound, back to TV and close (switches the TV off). Clicking the picture goes back to
  the channel. Plain `/tv` (the nav link) goes to the channel that is already on.
- **Playback.** The YouTube API only loads once a channel is tuned. The player starts
  muted so it can autoplay; "Sound on" (or tapping the screen) unmutes. A video that
  ends moves on. One YouTube refuses (removed, private, embedding disabled) is
  skipped and dropped from the channel's lists for the visit; see "Dead videos" in
  [components.md](./components.md#tv-components-srccomponentstv). Every change shows a burst of static (`.tv-static`).
- **Now-playing band** is one slim row (about 130px on desktop), like the album page's
  TV and the full-screen bar: progress as a white line on a dark track along its top
  edge (so it shows on any sleeve colour) that is also a scrubber (`Scrubber`: click or
  drag to jump, with a time bubble; arrows ±5s, Page Up/Down ±30s, Home/End), previous/play/
  next on the left, then channel · time, a one-line title (`.tv-title-box`, 40/46/50px
  high, `FitTitle` with `fitHeight` up to 52px, so nothing moves between videos) and
  artist · album · year · label, and the extras on the right as 40px icon buttons
  (sound, guide, room, full screen). The sound button is the same shape in both
  states: solid while muted, outlined with sound on. On phones the credit drops below the one row of buttons.
- **Header.** On `/tv` and channel pages (not the guide) the room is pulled up under
  the sticky header (`-mt-16 md:-mt-[84px]`, with `TvRoom`'s `topInset` keeping the set
  centred in the visible part), and `Navigation` draws the header see-through with
  cream text while at the top; it turns the usual dark once scrolled. On every `/tv`
  page the logo is `TvMark` (a little CRT with the current sleeve on its screen) in
  place of the spinning record.
- **Colour.** The page takes the current record's colours (`usePageFlood` with the
  sleeve as the logo label and the sleeve's ground), and the now-playing band is the
  flood. On desktop the record (`HeroRecord`, 230px, disc out, no sticker) hangs from
  the room into the band.
- **Full screen** puts the TV layer in full screen, letterboxed, with a slim credit
  bar in the sleeve colour (the album page TV row's scale) that stays up the whole
  time: progress as a line along its top, the sleeve, channel · time, artist, title,
  album · year · label, and previous, play/pause, next, sound and exit buttons.
- Below: **Up next** (the next six in the channel, YouTube stills with a colour bar; on
  an artist channel, `isArtistChannel()`, every video in the running order from the next
  one round to the one before this, as a wrapping grid with the channel's video count)
  and **Channels**, each tile in the colour of what it is airing now (refreshed every
  30 seconds).
- **Guide** (`src/pages/tv/TvGuide.tsx`): a `FloodBand` in the colour of what channel
  01 is airing, then a half-hour grid of every channel from the current half hour
  (earlier/later buttons, up to three hours ahead). Blocks are sized by duration and
  coloured by sleeve; finished ones are dimmed, the one on air is outlined, and a line
  marks the time. Any block or channel name tunes to that channel. The header counts
  channels, artist channels, videos and hours. Below the grid, **Artist channels**
  (`src/pages/tv/TvArtistChannels.tsx`) lists every artist with a channel
  (`artistChannelList()`): too many for grid rows, so it shows a letter at a time (A–Z
  pills as on `/artists`, `#` for digits and punctuation, opening on A) or the matches
  for a search box, each artist a tile in their newest record's sleeve colour with a
  video count, linking to `/tv/artist/<slug>`.

---

### Explore (`src/pages/explore/`)

Two ways to follow the connections in the collection, both reading
`public/explore/explore.json` through `useExplore()`
([utilities](./utilities.md#explore-data-srclibexplore)). Both fill the screen under the nav, so
`App.tsx` leaves the footer off /explore routes.

- **The Galaxy** (`/explore`, `/explore/:slug`, `GalaxyPage.tsx`), the default: every artist as a
  star in a 3D map, with the links drawn as trails. See [explore-galaxy.md](./explore-galaxy.md).
- **The Thread** (`/explore/thread`, `ThreadPage.tsx`): a feed of hops from one artist or record to
  the next, each saying why they connect. See [explore-thread.md](./explore-thread.md).

`/explore/thread` is matched before `/explore/:slug`, so an artist slugged `thread` would be
shadowed (none is). The data files under `public/explore/` are served as files before either route.

### SearchResultsPage (`src/pages/SearchResultsPage.tsx`)

**Route:** `/search`

`Search` title with the result count, a search field, pills to filter by
All / Albums / Artists (with counts), then `SearchResults` in the `grid`
layout.

| Parameter | Description |
|-----------|-------------|
| `q` | Search query |

The type filter is local state and is reset when the query changes.

---

## Wrapped Feature

Year-in-review pages.

### WrappedYear (`src/pages/wrapped/WrappedYear.tsx`)

**Route:** `/wrapped/:year` (`/wrapped` redirects to last year)

Loads the year file, sets the meta tags and shows a skeleton while it loads.
The page itself is `WrappedStory`, lazy-loaded so the chapters and d3 only
download on a Wrapped page. A floating pill bottom right holds the
`YearSelector` and the `Presentation` button.

**Data Source:** `/wrapped/wrapped-{year}.json` or
`/wrapped/wrapped-ytd.json`, read from its `story` block
([schemas.md](../data/schemas.md#the-story-block)). Available years are
derived from the shared collection.

### WrappedStory (`src/pages/wrapped/story/`)

The year told as a scroll of chapters. `WrappedStory.tsx` renders twelve empty
`<section>`s under a `.ws` root and hands each to its chapter in
`chapters/<id>.ts`: a factory taking the section and returning
`{ render(story), dispose() }`. The chapters build their own DOM (canvas, SVG,
animation loops, d3) and tear it all down in `dispose`. Plain `<a href="/…">`
links inside them go through the router.

`core.ts` turns the year's `story` block into a `Story` (image URLs from
`src/lib/image-utils.ts`, records by day, the biggest day, a colour per genre
family) and holds the shared helpers and a small event bus: `day` (a day picked
in the skyline), `play` (the cover's button) and `goto` (a path for the router).
`story.css` and every `chapters/<id>.css` nest their rules under `.ws`, so the
generic class names (`.stat`, `.pill`, `.label`) stay on this page.

| Chapter | What it draws |
|---------|---------------|
| `cover` | The year over a drifting 3D wall of its sleeves (a pool of 40), counted-up headline numbers, and a graph of records added every month since the first year: the year on show lit in amber with its busiest month marked, each year's total above it, the monthly average dashed. A sentence compares the year with the last and the average; clicking a year in the graph switches to it. |
| `record` (A1, Sleeve by sleeve) | Every record of the year side by side as slivers of its cover, opening Dock-style to a full sleeve under the pointer and drifting through the year when left alone. Slivers start as sleeve colours and fetch their covers in batches while the strip is on screen. Below: the date, the record and its pressing chips. |
| `skyline` (A2, Every day) | A 3D skyline, one tower per day and one slab per record, that folds into a flat calendar; the biggest day is labelled and a picked day shows its sleeves. |
| `clock` (A3, Around the clock) | When records were added in UK time: a 24-hour dial of sleeve-coloured segments and a weekday × hour dot grid. |
| `weight` (A4, Weight and length) | Discs, sides, kilograms and hours; the height of every disc in one pile, then the discs as twelve monthly piles (heights to scale, each disc lit in its pressing colour, the month's last sleeve as the top label); run times end to end. |
| `vinyl` (B1, Not all black) | Every coloured pressing as a disc half out of its sleeve, in the order added, with colour-family filters; three rows until "Show all". |
| `artists` (B2) | The most collected artist over their fanart, the next five as cards, and a bar race of records per artist through the year. |
| `genres` (B3) | A streamgraph of the twelve genre families by week, with the family that led each month. |
| `decades` (B4) | Sleeves in a beeswarm by original year, with decade bars and the oldest and newest records. |
| `credits` (B5, Behind the glass) | Lacquer cutters, mastering engineers, producers and labels as leaderboards with their sleeves; edition rings. |
| `connections` (B6) | The year's artists as a constellation linked by members, aliases and shared credits, with older artists they tie to. |
| `finale` (C) | Every sleeve of the year on one wall, re-sorted by date, colour or artist. |

The design started from [mylisteningrecord.com](https://mylisteningrecord.com)
(MIT, Carson Godwin); the approved mockup is in `mockups/wrapped/`.

### WrappedYTD (`src/pages/wrapped/WrappedYTD.tsx`)

**Route:** `/wrapped/ytd` — the current year in the same chapters, read from
`wrapped-ytd.json`; the cover marks the year "so far".

### WrappedPresentation (`src/pages/wrapped/WrappedPresentation.tsx`)

Full-screen, snap-scrolling presentation opened from the year page, played
like a record: seven chapters numbered as tracks (side A is the year, side B
who and what). Each chapter floods with colour from the records it shows.

| Track | Chapter | What it shows |
|-------|---------|---------------|
| A1 | Overview | Kicker, the year in huge `t-disp`, counts that count up on first view (records, artists, per month, busiest month). Three columns of sleeves ride up and down the right side (one row along the bottom on phones). Flood: the first record. |
| A2 | First & last | Split flood: first record's colour left, last record's right (top/bottom on phones), each with its `HeroRecord` ("First"/"Last" sticker from `md` up), date, title and artist. A round badge on the seam gives the days between them. |
| A3 | Months | Every record added that month is a spine on that month's stack, in its sleeve colour; stacks scale to the busiest month. Picking a month shows its name, count and a fan of its first sleeves. Dark ground. |
| A4 | Shelves | The selected month (shared with A3) as a row of `RecordTile`s, with a JAN–DEC switcher. Flood: the month's lead colour. |
| B1 | Artists | No. 1 artist's portrait blended into the flood of their top album, name in a `FitTitle`, then 2–6 as rows with avatar, bar and count. |
| B2 | Genres | Full-width bands, each as tall as its genre's count, in the genre's lead sleeve colour; labels scale with band height (container query units). |
| B3 | Years | The run-out: a large `Vinyl` with the last record on its label, the year, counts, previous/next year pills and every year. Flood: the last record. |

**Chrome:** the site logo (`SpinningMark`, as in the nav) sits top left with
the current chapter's lead sleeve on its label. The transport is a solid dark
bar at the bottom: track and label, previous/next, a numbered bar per chapter
(click to jump) and Play. Play runs each chapter for 9s with a
`.hero-progress` bar and stops after B3. Arrow Down / Space and Arrow Up still step chapters. The year
selector and "Year page" button sit top right (`WrappedYear`).

**Motion:** entrances (`.wr-rise`, `.wr-pop`, `.wr-spine`, `.wr-band`,
`.wr-fan`, `.wr-shelf` in `player.css`, staggered with `--d`) play the first
time a chapter comes round (`data-seen`); discs spin and conveyors run only in
the visible chapter (`data-active`). Under `prefers-reduced-motion` there are
no entrances, conveyors or spinning, and counts show their final values.

### Wrapped components

Both views use the player components plus `YearSelector` and
`presentation/PresentationContainer`, the `useWrappedNavigation` hook and
the helpers in `utils/sleeves.ts`. The older bento, card and section
components have been removed.

---

## Page Data Loading Pattern

Pages that need `collection.json` use the shared, cached loader in
[`src/lib/collection.ts`](./utilities.md#collection-loader-srclibcollectionts):

```tsx
import { useCollection } from '@/lib/collection';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';

function ExamplePage() {
  const { albums, loading, error } = useCollection();
  const colours = useAlbumColorMap();

  if (loading) return <EditorialSkeleton />;
  if (error) return <EditorialEmpty title="Nothing to show" detail={error} />;

  return <Grid albums={albums} colours={colours} />;
}
```

Once the collection has loaded, `useCollection()` returns it on the first
render, so revisiting a page shows no loading state. Pages with their own
loading flow call `loadCollection()` directly (Artists, Genres, Stats,
Random, Wrapped). The album and artist detail pages use `useCollection()`
and load their per-item JSON through `loadDetailJson()`, which caches each
response for the tab.

---

## Meta Tag Management

Pages use the `useMetaTags` hook for SEO:

```tsx
import { useMetaTags } from '@/hooks/useMetaTags';

useMetaTags({
  title: `${album.title} | russ.fm`,
  description: album.description,
  image: getAlbumOGImageUrl(album.slug),
  url: `https://russ.fm/album/${album.slug}`,
  type: 'music.album'
});
```

---

## Page Title Management

```tsx
import { usePageTitle } from '@/hooks/usePageTitle';

usePageTitle('Albums | russ.fm');
```
