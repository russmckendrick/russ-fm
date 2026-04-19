# Pages Reference

This document covers all route-level page components in russ.fm.

> **Editorial redesign (April 2026).** Every page listed here was
> rebuilt around paper/ink tokens, `SectionHeader`, and editorial
> tiles (`AlbumCard`, `ArtistCard`). Data-fetching contracts,
> query-string deep links, and feature surface (scrobble, embeds,
> wrapped presentation, search) are preserved — only the visual
> rhythm changed. See `docs/project/Redesign/CHANGELOG.md` for
> per-page before/after notes.

## Editorial structure by page

| Route | Structure |
|-------|-----------|
| `/` | Coverflow hero → Recent Albums wall → Recent Artists wall → Genres mosaic → Random crate → Random roster → Catalogue strip. Main column + sticky `StatsAside` on desktop. |
| `/albums/:page` | `BrowseHeader` → hairline `FilterBar` → 6-col tile grid with `CAT.` indices → mono pager. |
| `/artists/:page` | `BrowseHeader` → search+sort row → full-width A–Z strip → 6-col circular-portrait grid → mono pager. |
| `/album/:slug` | Tinted wash hero (sleeve right, title+artist+KV+chips+actions left) → `About this record` → `Tracklist` with hairline side dividers → `Listen to …` embed panel → videos → per-artist bios → sticky sidebar with release details / identifiers / copyright. |
| `/artist/:slug` | Tinted wash hero (circular portrait + KV + chips + service buttons) → `Biography` → numbered release grid → sticky sidebar with quick facts + genre chips. |
| `/stats` | Hero + 4-wide KPI strip → 12 numbered editorial sections (decade bars, genre donut, golden year, top years, top artists, artist-depth trio, recent additions, additions histogram, from-the-crates, random roster). All charts are hand-rolled inline SVG. |
| `/random` | Tinted wash hero with cross-fade on shuffle, sleeve + KV + chips + actions; peek strip of 8 upcoming records below. `Space` shuffles. |
| `/search?q=…` | `BrowseHeader` with `Query / Results / Albums / Artists` count strip → segregated result list. |
| `/wrapped/:year` | Editorial dossier by default — giant `YYYY` word treatment, KPI strip, Album of the year, Top 10 list, Top artists grid, Genres + Decades breakdowns, 12-bar monthly summary + one `DragWall` per month, year pager. `Presentation` toggle returns the full-screen snap-scroll experience. |
| `/wrapped/ytd` | Redirects to current year; same dossier shape with a `YEAR TO DATE` kicker and projected-total subtitle. |
| `/genres` | **Not touched.** D3 force-simulation mindmap preserved as-is per the author's request. |

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
- Featured coverflow hero built from the 10 latest releases, with a blurred active-sleeve backdrop
- Recently added albums section
- Recently added artists section
- Random collection samples
- Genre highlights

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
- Artist biography
- Profile image
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

**Statistics Calculated:**
```typescript
interface CollectionStats {
  totalAlbums: number;
  totalArtists: number;
  uniqueGenres: number;
  totalTracks: number;
  decadeBreakdown: Record<string, number>;
  genreBreakdown: Record<string, number>;
  yearlyAdditions: Record<string, number>;
  topLabels: { name: string; count: number }[];
}
```

---

### GenrePage (`src/pages/GenrePage.tsx`)

Genre browser and filter.

**Route:** `/genres`

**Features:**
- Genre cloud/grid display
- Click to filter albums by genre
- Album count per genre
- Color-coded tags

---

### RandomPage (`src/pages/RandomPage.tsx`)

Random album discovery.

**Route:** `/random`

**Features:**
- Random album selection
- "Spin again" button
- Full album preview

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
