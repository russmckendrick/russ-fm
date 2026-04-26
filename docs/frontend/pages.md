# Pages Reference

This document covers all route-level page components in russ.fm.

> **Editorial redesign (April 2026).** Every page listed here was
> rebuilt around paper/ink tokens, `SectionHeader`, and editorial
> tiles (`AlbumCard`, `ArtistCard`). Data-fetching contracts,
> query-string deep links, and feature surface (scrobble, embeds,
> wrapped presentation, search) are preserved — only the visual
> rhythm changed. See `docs/project/completed/Redesign/CHANGELOG.md` for
> per-page before/after notes.

## Editorial structure by page

| Route | Structure |
|-------|-----------|
| `/` | Fixed-height paper split hero with configured record selectors → Recent Albums wall → Recent Artists wall → Genres mosaic → Random crate → Random roster. Main column + sticky dark `StatsAside` overview on desktop. Mobile stacks the sleeve before the full-width title and full-row CTA, with hero stats in a 2/3-column grid. |
| `/albums/:page` | Hairline `FilterBar` → 6-col tile grid with `CAT.` indices → mono pager. |
| `/artists/:page` | Search+sort row → full-width A–Z strip → 6-col square-portrait grid → mono pager. |
| `/album/:slug` | Home-matched paper split hero (breadcrumb + fitted display title + square artist avatars + tags + actions + single sleeve + metadata rail) → `About this record` → `Tracklist` with hairline side dividers → `Listen to …` embed panel → videos → per-artist bios → sticky sidebar with release details / identifiers / copyright. Mobile shows the sleeve first, then the full-width title, one service action per row, and hero stats in a 2/3-column grid. |
| `/artist/:slug` | Album-matched paper split hero (breadcrumb + fitted artist name + single portrait + genre chips + actions + release metadata rail) → `Biography` → numbered release grid → sticky sidebar with quick facts + genre chips. Mobile shows the portrait first, then the full-width title, one service action per row, and hero stats in a 2/3-column grid. |
| `/stats` | Hero + 4-wide KPI strip → 12 numbered editorial sections (decade bars, genre donut, golden year, top years, top artists, artist-depth trio, recent additions, additions histogram, from-the-crates, random roster). All charts are hand-rolled inline SVG. |
| `/random` | Single-record random spin with paper hero, large sleeve treatment, metadata rail, genre links, and shuffle/open actions. Mobile shows the sleeve before the title, uses full-row actions, and lays hero stats out in a 2/3-column grid. `Space` shuffles when focus is outside interactive controls. |
| `/search?q=…` | `BrowseHeader` with `Query / Results / Albums / Artists` count strip → segregated result list. |
| `/wrapped/:year` | Editorial dossier by default — giant `YYYY` word treatment, KPI strip, Album of the year, Top 10 list, Top artists grid, Genres + Decades breakdowns, 12-bar monthly summary + one `DragWall` per month, year pager. Wrapped JSON image paths are normalized through `image-utils` for R2 assets in production. `Presentation` toggle returns the full-screen snap-scroll experience. |
| `/wrapped/ytd` | Redirects to current year; same dossier shape with a `YEAR TO DATE` kicker and projected-total subtitle, inheriting the `/wrapped/:year` asset URL handling. |
| `/genres` | Paper/ink D3 genre explorer: one graph surface linking all genres or a selected genre to related genres, artists, and artist records with compact popup controls. |

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
        Random["/random"]
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
    Random --> RandomPage
    Search --> SearchResultsPage
    Wrapped --> WrappedYear
    WrappedYear --> WrappedYearPage
    WrappedYTD --> WrappedYTDPage
```

## Core Pages

### HomePage (`src/pages/HomePage.tsx`)

Landing page with featured content and collection highlights.

**Route:** `/`, `/home`

**Features:**
- Fixed-height editorial hero built from the configured latest releases, with fitted display title, central sleeve, metadata rail, countdown waveform, and album-accent selector states
- Mobile hero order is artwork first, then a full-width title, full-row actions, and compact 2/3-column stats
- Recently added albums section
- Recently added artists section
- Random collection samples
- Genre highlights
- Compact sticky `StatsAside` overview with configured era exclusions, top-decade percentages, curated genre bars, and yearly additions timeline

**Data Sources:**
- `/collection.json` - Album data
- `/album-colors.json` - Color palettes
- `/album-colors.css` - Album palette classes for the hero treatment

**Configuration:**
```typescript
// src/config/app.config.ts
homepage: {
  hero: {
    numberOfFeaturedAlbums: 10,
    autoRotateInterval: 12000 // 12 seconds
  },
  recentlyAdded: { displayCount: 12 },
  randomCollection: { displayCount: 12 },
  randomArtists: { displayCount: 12 },
  sectionOrder: ['hero', 'recentAlbums', 'recentArtists', 'genres', 'randomCollection']
}
```

**Example Usage:**
```tsx
// App.tsx routing
<Route path="/" element={<HomePage />} />
<Route path="/home" element={<HomePage />} />
```

---

### AlbumsPage (`src/pages/AlbumsPage.tsx`)

Paginated album collection browser with filtering and sorting.

**Route:** `/albums`, `/albums/:page`

**Features:**
- Paginated grid display
- Search within collection
- Genre filtering
- Year filtering
- Multiple sort options
- URL-based state (shareable filters)

**URL Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `:page` | `number` (path) | 1 | Current page number |
| `sort` | `string` | `date_added` | Sort field |
| `genre` | `string` | - | Genre filter |
| `year` | `string` | - | Year filter |
| `search` | `string` | - | Search query |

**Sort Options:**
- `date_added` - Most recently added first
- `release_name` - Album name A-Z
- `release_artist` - Artist name A-Z
- `date_release_year` - Newest releases first

**URL Structure:**
Page number is in the path, filters are in query string. Query parameters are preserved during pagination navigation.

**Examples:**
```
/albums/1?genre=Electronic           # Page 1, Electronic genre
/albums/2?genre=Electronic           # Page 2, genre preserved
/albums/1?genre=Rock&sort=release_name&year=1990
```

**Key Implementation Details:**

```tsx
function AlbumsPage() {
  const { page } = useParams<{ page?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = page ? parseInt(page, 10) : 1;

  // Build navigation URL with preserved query params
  const buildPageUrl = (pageNum: number) => {
    const queryString = searchParams.toString();
    return queryString ? `/albums/${pageNum}?${queryString}` : `/albums/${pageNum}`;
  };

  // Update URL params with optional page reset
  const updateURLParams = (newParams: Record<string, string>, resetToPage1 = false) => {
    const params = new URLSearchParams(searchParams);
    // ... update params ...
    setSearchParams(params);

    // Navigate to page 1 with preserved query params when filter changes
    if (resetToPage1 && currentPage !== 1) {
      const queryString = params.toString();
      navigate(queryString ? `/albums/1?${queryString}` : '/albums/1');
    }
  };

  return (
    <>
      <FilterBar
        setSortBy={(value) => updateURLParams({ sort: value }, true)}
        setSelectedGenre={(value) => updateURLParams({ genre: value }, true)}
        // ... other filters ...
      />
      <AlbumGrid albums={paginatedCollection} />
      <Pagination
        onPageClick={(page) => navigate(buildPageUrl(page))}
      />
    </>
  );
}
```

---

### AlbumDetailPage (`src/pages/AlbumDetailPage.tsx`)

Individual album detail view with rich metadata.

**Route:** `/album/:slug`

**Features:**
- Full album artwork with dynamic theming
- Complete metadata display
- Tracklist with durations
- Artist links (multi-artist support)
- Service embeds (Spotify, Apple Music)
- Last.fm scrobbling
- OG meta tags for sharing

**Data Source:** `/album/{slug}/index.json`

**Dynamic Theming:**
```tsx
function AlbumDetailPage() {
  const { slug } = useParams();
  const { colors } = useAlbumColors(slug);

  return (
    <div style={{
      '--album-bg': colors?.background,
      '--album-accent': colors?.accent
    }}>
      {/* Album content with dynamic colors */}
    </div>
  );
}
```

**Description Fallback Chain:**
```typescript
// Description sources in priority order:
const description =
  album.apple_music?.editorial_notes?.short ||
  album.apple_music?.editorial_notes?.standard ||
  album.lastfm?.wiki_summary ||
  album.perplexity?.description ||
  null;
```

**Meta Tags:**
```tsx
useMetaTags({
  title: `${album.title} by ${album.artist} | russ.fm`,
  description: `${album.title} (${album.year}) - ${album.genres.join(', ')}`,
  image: getAlbumOGImageUrl(slug),
  url: `https://russ.fm/album/${slug}`
});
```

---

### ArtistsPage (`src/pages/ArtistsPage.tsx`)

Paginated artist browser with filtering and sorting.

**Route:** `/artists`, `/artists/:page`

**Features:**
- Paginated artist grid
- Search within artists
- Alphabetical letter filtering (A-Z)
- Multiple sort options
- Album count display
- "Various Artists" excluded by default
- URL-based state (shareable filters)

**URL Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `:page` | `number` (path) | 1 | Current page number |
| `sort` | `string` | `name` | Sort field |
| `letter` | `string` | - | Filter by first letter (A-Z) |
| `search` | `string` | - | Search query |

**Sort Options:**
- `name` - Artist name A-Z
- `albums` - Most albums first
- `latest` - Most recently added first

**URL Structure:**
Page number is in the path, filters are in query string. Query parameters are preserved during pagination navigation.

**Examples:**
```
/artists/1?letter=A                  # Page 1, artists starting with A
/artists/2?letter=A                  # Page 2, letter filter preserved
/artists/1?sort=albums&letter=M
```

**Key Implementation Details:**

```tsx
function ArtistsPage() {
  const { page } = useParams<{ page?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = page ? parseInt(page, 10) : 1;

  // Build navigation URL with preserved query params
  const buildPageUrl = (pageNum: number) => {
    const queryString = searchParams.toString();
    return queryString ? `/artists/${pageNum}?${queryString}` : `/artists/${pageNum}`;
  };

  // Update URL params with optional page reset
  const updateURLParams = (newParams: Record<string, string>, resetToPage1 = false) => {
    const params = new URLSearchParams(searchParams);
    // ... update params ...
    setSearchParams(params);

    // Navigate to page 1 with preserved query params when filter changes
    if (resetToPage1 && currentPage !== 1) {
      const queryString = params.toString();
      navigate(queryString ? `/artists/1?${queryString}` : '/artists/1');
    }
  };

  return (
    <>
      <FilterBar ... />
      <ArtistGrid artists={paginatedArtists} />
      <Pagination
        onPageClick={(page) => navigate(buildPageUrl(page))}
      />
    </>
  );
}
```

---

### ArtistDetailPage (`src/pages/ArtistDetailPage.tsx`)

Individual artist detail with discography.

**Route:** `/artist/:slug`

**Features:**
- Album detail-style paper split hero with fitted display name, central portrait, service actions, and metadata rail
- Artist biography
- External links
- Discography grid
- Genre associations

**Data Source:** `/artist/{slug}/index.json`

**"Various" Artist Handling:**
```tsx
// Redirect "Various" to artists list
if (slug === 'various' || slug === 'various-artists') {
  return <Navigate to="/artists" replace />;
}
```

---

### StatsPage (`src/pages/StatsPage.tsx`)

Collection statistics and insights.

**Route:** `/stats`

**Features:**
- Total album/artist counts
- Genre breakdown
- Decade distribution
- Year-over-year additions
- Random highlights
- Section display counts are driven by `redesignConfig.stats`, including top artists, top genres, top years, recent additions, random picks, random artists, and visible decade bars

**Statistics Calculated:**
```typescript
interface CollectionStats {
  totalAlbums: number;
  uniqueArtists: number;
  uniqueGenres: number;
  topArtists: ArtistStat[];
  topGenres: { name: string; value: number }[];
  decadeData: { decade: string; count: number }[];
  additionsData: { month: string; count: number }[];
  topYears: { year: string; count: number }[];
}
```

---

### GenrePage (`src/pages/GenrePage.tsx`)

Single-page hybrid D3/React/Motion genre explorer built from static `/collection.json`.

**Route:** `/genres`

**URL Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `genre` | `all \| string` | `all` | Active scope, e.g. `/genres?genre=all` or `/genres?genre=Rock` |
| `artist` | `string` | - | Active artist slug. When present, the graph uses whole-collection artist focus |
| `album` | `string` | - | Legacy/shared-link record slug used to highlight a record node |
| `sort` | `dominance \| recent \| name \| year` | `dominance` | Artist/album ordering |
| `q` | `string` | - | Search across genres, artists, and albums |
| `nodes` | `number` or legacy `standard \| more \| max` | responsive | Graph node budget. Defaults are intentionally conservative on mobile, tablet, and desktop; the slider can reveal more |

**Features:**
- One primary hybrid graph with two focus modes: selected genre focus, or selected artist focus
- D3 is used for off-DOM force layout and zoom/pan behavior; React renders stable keyed SVG nodes and Framer Motion animates node/link transitions
- Genre focus uses a center-out hierarchy: selected genre hub, middle artist field, and related genre pills around the perimeter
- Artist focus moves the artist to the center, then radiates out to collected records, artist genres, and other artists reached through those genres
- The selected genre control is a styled Radix popup populated from computed genre summaries, with `All genres` first
- Click related genre nodes to smoothly re-center the graph around that genre
- Click artist nodes to center that artist using their whole collected discography
- Click record nodes to open their canonical album detail pages
- Search, sort, and numeric node-budget slider controls keep state in the URL
- In-graph controls provide URL-backed Back/Forward plus zoom in, zoom out, and recenter actions
- Keyboard shortcuts: `[` Back, `]` Forward, `0` recenter, `+` or `=` zoom in, `-` zoom out, and `Esc` clears artist focus
- The central genre hub uses the Russ.fm record glyph in the same paper/ink treatment as the surrounding app
- Loading, empty, and error states using editorial primitives

---

### RandomPage (`src/pages/RandomPage.tsx`)

Random album discovery.

**Route:** `/random`

**Features:**
- Single random album selection from `/collection.json`
- "Spin Again" button that excludes the currently shown album when possible
- Spacebar shuffle support when focus is outside interactive controls
- Full album preview with artwork, artist link, genre links, and metadata rail
- Loading skeleton, retryable error state, and empty collection state

---

### SearchResultsPage (`src/pages/SearchResultsPage.tsx`)

Full-page search results.

**Route:** `/search`

**Query Parameters:**
| Parameter | Description |
|-----------|-------------|
| q | Search query |
| type | Result type filter (album, artist) |

**Example:** `/search?q=radiohead&type=album`

---

## Wrapped Feature

Year-in-review analytics pages.

### WrappedYear (`src/pages/wrapped/WrappedYear.tsx`)

Main wrapped page for a specific year.

**Route:** `/wrapped/:year`

**Features:**
- Year summary statistics
- Top albums of the year
- Monthly breakdown
- Genre insights
- Decade analysis
- Presentation mode toggle

**Data Source:** `/wrapped.json`

**Components Used:**
```
WrappedYear
├── YearSelector
├── DynamicBentoGrid
│   ├── AnimatedCard
│   └── AnimatedCounter
├── TopArtistsSection
├── TopAlbumsPerMonthSection
├── GenreBreakdownSection
└── DecadesSection
```

---

### WrappedYTD (`src/pages/wrapped/WrappedYTD.tsx`)

Year-to-date wrapped statistics.

**Route:** `/wrapped/ytd`

**Features:**
- Current year statistics
- Live updating data
- Projection estimates

---

### WrappedPresentation (`src/pages/wrapped/WrappedPresentation.tsx`)

Full-screen presentation mode.

**Features:**
- Section-by-section reveal
- Keyboard navigation
- Auto-advance option
- Animation effects

**Navigation Controls:**
- Arrow keys: Next/Previous section
- Space: Auto-advance toggle
- Escape: Exit presentation

---

## Wrapped Sections

Located in `src/pages/wrapped/sections/`:

| Section | Description |
|---------|-------------|
| IntroSection | Welcome and year overview |
| YearSummarySection | Key statistics |
| HeroAlbumSection | Featured album of the year |
| TopArtistsSection | Most collected artists |
| TopAlbumsPerMonthSection | Monthly highlights |
| MonthlyJourneySection | Timeline visualization |
| GenreBreakdownSection | Genre distribution |
| DecadesSection | Release decade analysis |
| ExploreSection | Links to browse collection |

---

## Wrapped Components

Located in `src/pages/wrapped/components/`:

### DynamicBentoGrid

Responsive grid layout for wrapped data cards.

```tsx
<DynamicBentoGrid>
  <AnimatedCard size="large" delay={0}>
    <StatDisplay value={42} label="Albums" />
  </AnimatedCard>
  <AnimatedCard size="small" delay={0.1}>
    <GenreList genres={topGenres} />
  </AnimatedCard>
</DynamicBentoGrid>
```

### AnimatedCard

Card with entrance animation.

```tsx
<AnimatedCard
  size="medium"
  delay={0.2}
  onClick={handleClick}
>
  {content}
</AnimatedCard>
```

### AnimatedCounter

Animated number display.

```tsx
<AnimatedCounter
  value={1234}
  duration={2000}
  delay={500}
/>
```

### RevealText

Text reveal animation.

```tsx
<RevealText delay={0.3}>
  Your collection grew by 42 albums this year!
</RevealText>
```

---

## Page Data Loading Pattern

All pages follow a consistent data loading pattern:

```tsx
function ExamplePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/collection.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <EmptyState />;

  return <PageContent data={data} />;
}
```

---

## Meta Tag Management

Pages use the `useMetaTags` hook for SEO:

```tsx
import { useMetaTags } from '@/hooks/useMetaTags';

function AlbumDetailPage({ album }) {
  useMetaTags({
    title: `${album.title} | russ.fm`,
    description: album.description,
    image: getAlbumOGImageUrl(album.slug),
    url: `https://russ.fm/album/${album.slug}`,
    type: 'music.album'
  });

  // ...
}
```

---

## Page Title Management

```tsx
import { usePageTitle } from '@/hooks/usePageTitle';

function AlbumsPage() {
  usePageTitle('Albums | russ.fm');
  // ...
}
```
