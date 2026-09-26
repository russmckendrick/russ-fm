# Hooks Reference

This document covers all custom React hooks in russ.fm.

## Search Hooks

### useSearch (`src/hooks/useSearch.ts`)

Primary search hook with Fuse.js integration.

```typescript
import { useSearch } from '@/hooks/useSearch';

function SearchComponent() {
  const {
    query,
    setQuery,
    results,
    isLoading,
    isIndexing,
    search,
    clearResults
  } = useSearch();

  return (
    <input
      value={query}
      onChange={e => setQuery(e.target.value)}
      placeholder="Search albums and artists..."
    />
  );
}
```

**Returns:**
| Property | Type | Description |
|----------|------|-------------|
| query | `string` | Current search query |
| setQuery | `(query: string) => void` | Update query |
| results | `SearchResult[]` | Search results |
| isLoading | `boolean` | Search in progress |
| isIndexing | `boolean` | Building search index |
| search | `(query: string) => void` | Trigger search |
| clearResults | `() => void` | Clear results |

**Options** (all optional): `debounceMs` (default 150), `limit` (20), `threshold`,
`includeMatches`, `filterByType` (`'album' | 'artist'`), `autoSearch` (`true`) and `enabled`
(`true`). The index is built from the shared collection (`loadCollection()` in
`src/lib/collection.ts`), not a separate fetch. With `enabled: false` the hook does not build
the Fuse index; it starts when `enabled` becomes `true`, so search UI can defer the work until
it is opened.

**Search Result Structure:**
```typescript
interface SearchResult {
  id: string;
  type: 'album' | 'artist';
  title: string;
  subtitle?: string;
  image?: string;
  url: string;
  year?: number;
  genres?: string[];
  score: number;
  matches?: FuseMatch[];
}
```

---

### useInstantSearch

Auto-searching variant with a 100ms debounce and up to 10 results.

```typescript
import { useInstantSearch } from '@/hooks/useSearch';

function InstantSearch({ isVisible }: { isVisible: boolean }) {
  const { query, setQuery, results } = useInstantSearch('', isVisible);

  // Results update automatically as user types
}
```

**Parameters:** `initialQuery` (default `''`) and `enabled` (default `true`). `SearchOverlay`
passes its `isVisible` prop, so the index is only built once the overlay opens.

---

### useMobileSearch

Mobile-optimized search with simplified results.

```typescript
import { useMobileSearch } from '@/hooks/useSearch';

function MobileSearch({ isOpen }: { isOpen: boolean }) {
  const { query, setQuery, results, isLoading } = useMobileSearch(isOpen);
  // 200ms debounce, up to 15 results
}
```

**Parameters:** `enabled` (default `true`). `MobileSearchModal` passes `isOpen`, so the index
is only built once the modal opens.

---

### useTypeAheadSearch

Search with typeahead suggestions.

```typescript
import { useTypeAheadSearch } from '@/hooks/useSearch';

function TypeAhead() {
  const { suggestions, selectSuggestion } = useTypeAheadSearch();

  return (
    <ul>
      {suggestions.map(s => (
        <li key={s.id} onClick={() => selectSuggestion(s)}>
          {s.title}
        </li>
      ))}
    </ul>
  );
}
```

---

## Color Hooks

The palette hooks read the pre-extracted `/album-colors.json` (URI → palette), which is
fetched once and cached in memory. Every colour is decided at build time by
`scripts/generate-album-colors.js`, Apple Music artwork colours included, so pages only read
it. Turn a palette into page colours with `floodFor()` from
[`src/lib/sleeveColour.ts`](./utilities.md#sleeve-colours-srclibsleevecolourts).

```typescript
interface AlbumColorPalette {
  v: number;                // palette version
  flood: string;            // the sleeve's colour; a tinted neutral when vivid is 0
  ink: string;              // dark ink or cream, whichever reads on the flood
  ground: string;           // the sleeve's own dark (page body, vinyl labels), never pure black
  glow: string;             // the flood, lightened if needed to reach 3:1 on the ground
  secondary: string | null; // a second, clearly different sleeve colour
  hue: number;              // flood hue, 0–1 (OKLCH), for colour sorting
  vivid: number;            // how bold the flood is: 0 for monochrome, up to ~2.6
}
```

### useAlbumColors (`src/hooks/useAlbumColors.ts`)

Palette for one album.

```typescript
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';

const palette = useAlbumColors(album.uri_release); // or a slug
const flood = floodFor(palette);
```

**Parameters:** `albumIdentifier?: string` — a URI (`/album/slug/`) or a slug.

**Returns:** `AlbumColorPalette | null` (`null` while loading or when the album has no entry).

Once `album-colors.json` has loaded, the palette is resolved synchronously and returned on the
first render (lookups are cached per identifier), so a page floods in the right colour
without a neutral flash.

---

### useAlbumColorMap

The whole URI → palette map. Use it when a page paints many sleeves at once (grids, shelves,
the artist discography, browse cards, the genre map, Wrapped) instead of calling `useAlbumColors` per
tile.

```typescript
import { useAlbumColorMap } from '@/hooks/useAlbumColors';

const colourMap = useAlbumColorMap();

albums.map(album => (
  <RecordTile key={album.uri_release} album={album} palette={colourMap?.[album.uri_release]} />
));
```

**Returns:** `Record<string, AlbumColorPalette> | null` — `null` until loaded. Keys are album
URIs with a trailing slash (`/album/slug/`).

---

### useAlbumColorsWithFallback

Same as `useAlbumColors` but never `null`: returns the neutral palette (flood `#e8e2d6`,
ground `#1c1916`, `vivid` 0) when the album has no entry.

---

### preloadAlbumColors

`preloadAlbumColors(): Promise<void>` starts loading `album-colors.json` ahead of use.

---

### useAlbumSwatches

The sleeve's main swatches, largest first, from `/album-swatches.json`. Only the album page
shows them, so they live in their own file, fetched once on first use.

```typescript
import { useAlbumSwatches, type AlbumSwatch } from '@/hooks/useAlbumColors';

const swatches: AlbumSwatch[] = useAlbumSwatches(album.uri_release);
// [['#183139', 23], ['#465428', 23], ...] — [hex, percent of the sleeve]
```

**Parameters:** `uri?: string` — the album's `uri_release`.

**Returns:** `AlbumSwatch[]` (`[hex, percent]` pairs, up to six). Empty until loaded, and for
albums without artwork.

### useBackdropTone (`src/hooks/useBackdropTone.ts`)

`useBackdropTone(src): 'light' | 'dark' | null`. Loads its own CORS-enabled copy of an image
(pass a small size, e.g. the artist avatar), draws it to a 24×30 canvas and averages the
luminance of the top quarter and outer columns, where a portrait's backdrop shows. The
visible `<img>` is untouched. Results are cached per URL. Returns `null` until measured or
when the host doesn't send CORS headers for the current origin (`assets.russ.fm` allows
`https://russ.fm`), so callers need a fallback. The artist page uses it to pick the
portrait's blend mode.

---

## Flood Hooks

Defined in `src/components/player/flood-context.ts` and exported from
`@/components/player`. They need `FloodProvider`, which wraps the app in `App.tsx`. The value
and the setter live in separate contexts (`FloodValueContext` and `FloodSetterContext`), so a
page that sets the flood does not re-render when the flood changes; only the navigation,
which reads the value, does.

### usePageFlood

Sets the page's flood colour while the calling page is mounted. The sticky navigation paints
itself in the same colour until the page scrolls, and `--flood` / `--flood-ink` are set on
`<html>`. Call it in any page with a colour hero.

```typescript
import { usePageFlood } from '@/components/player';

const flood = floodFor(palette);
usePageFlood(
  album ? flood.flood : null,
  album ? flood.ink : null,
  album ? { cover: getAlbumImageFromData(album.uri_release, 'hi-res'), ground: flood.ground } : undefined,
);
```

**Parameters:** `flood`, `ink` (`string | null | undefined`), and an optional
`{ cover, ground }`. `ground` (usually the sleeve's `ground` swatch) becomes `--ground` for the
whole page. `cover` is an image URL the page already shows. The spinning logo and the footer record put that sleeve on
their labels; pass the size the page itself loads so it comes from cache. Only the home hero,
album and artist (latest addition) pages pass one. Passing `null` for either
resets to the dark ground; the flood is also reset when the page unmounts. Unchanged values
are ignored, so it is safe to call on every render.

### useFloodValue

Reads the current `{ flood, ink, cover, ground }`. Used by `Navigation` and `Footer`.

```typescript
import { useFloodValue } from '@/components/player';

const { flood, ink } = useFloodValue();
```

---

## Media Query Hooks

### useMediaQuery (`src/hooks/useMediaQuery.ts`)

Whether a CSS media query matches, updating when it changes
(`useSyncExternalStore` over `matchMedia`). `false` during server rendering.

```typescript
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';

const isWide = useMediaQuery('(min-width: 640px)');
const reducedMotion = usePrefersReducedMotion();
```

The Shuffle page uses both: the board's column count and whether the tiles animate.

---

## Meta Hooks

### usePageTitle (`src/hooks/usePageTitle.ts`)

Set document title with cleanup.

```typescript
import { usePageTitle } from '@/hooks/usePageTitle';

function AlbumPage({ album }) {
  usePageTitle(`${album.title} | russ.fm`);

  // Title resets on unmount
}
```

---

### useMetaTags (`src/hooks/useMetaTags.ts`)

Manage OG and Twitter meta tags.

```typescript
import { useMetaTags } from '@/hooks/useMetaTags';

function AlbumDetailPage({ album }) {
  useMetaTags({
    title: `${album.title} by ${album.artist}`,
    description: album.description || `${album.title} (${album.year})`,
    image: getAlbumOGImageUrl(album.slug),
    url: `https://russ.fm/album/${album.slug}`,
    type: 'music.album'
  });
}
```

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| title | `string` | Page title |
| description | `string` | Meta description |
| image | `string` | OG image URL |
| url | `string` | Canonical URL |
| type | `string` | OG type (website, music.album) |

**Generated Tags:**
```html
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="..." />
<meta property="og:url" content="..." />
<meta property="og:type" content="..." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="..." />
<meta name="twitter:description" content="..." />
<meta name="twitter:image" content="..." />
```

---

## Last.fm Hooks

### useLastFmAuth (`src/hooks/useLastFmAuth.ts`)

Last.fm authentication management.

```typescript
import { useLastFmAuth } from '@/hooks/useLastFmAuth';

function LastFmStatus() {
  const {
    isAuthenticated,
    user,
    login,
    logout,
    checkAuthStatus
  } = useLastFmAuth();

  if (!isAuthenticated) {
    return <button onClick={login}>Connect Last.fm</button>;
  }

  return (
    <div>
      Logged in as {user.username}
      <button onClick={logout}>Disconnect</button>
    </div>
  );
}
```

**Returns:**
| Property | Type | Description |
|----------|------|-------------|
| isAuthenticated | `boolean` | Auth status |
| user | `LastFmUser \| null` | User info |
| login | `() => void` | Start OAuth flow |
| logout | `() => void` | Clear session |
| checkAuthStatus | `() => Promise<boolean>` | Verify session |

---

### useScrobbleScene (`src/hooks/useScrobbleScene.ts`)

Drives the album hero's scrobble animation from `AlbumScrobbleButton`'s progress reports.

```typescript
const { scene, onProgress } = useScrobbleScene(albumPath);

<AlbumScrobbleButton album={...} onProgress={onProgress} leadInMs={SCENE_LEAD_IN_MS} trackMs={SCENE_TRACK_MS} />
<HeroRecord ... scene={scene} ringColour={flood.flood} />
```

`scene.phase` runs `idle → out → lift → play → done → back → idle`; `scene.done` / `scene.total` light the ring; `scene.stamp` runs `added → scrobbled → returning → returned`, fading "Added" back in 10s after the scene ends. Changing `resetKey` (the album path) resets everything. Timings and the full choreography: [design-system.md](./design-system.md).

---

### useScrobble (`src/hooks/useScrobble.ts`)

Scrobble tracks to Last.fm.

```typescript
import { useScrobble } from '@/hooks/useScrobble';

function TrackRow({ track, album }) {
  const { scrobble, isScrobbling, lastScrobbled } = useScrobble();

  const handleScrobble = () => {
    scrobble({
      artist: track.artist,
      track: track.title,
      album: album.title,
      timestamp: Date.now()
    });
  };

  return (
    <div>
      {track.title}
      <button onClick={handleScrobble} disabled={isScrobbling}>
        Scrobble
      </button>
    </div>
  );
}
```

**Scrobble Request:**
```typescript
interface ScrobbleRequest {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
  duration?: number;
}
```

**Album Scrobbling:**
```typescript
const { scrobbleAlbum, progress } = useScrobble();

// Scrobble all tracks
await scrobbleAlbum({
  artist: album.artist,
  album: album.title,
  tracks: album.tracklist.map(t => ({
    title: t.title,
    duration: t.duration
  }))
});
```

---

## Player Hooks

### useMusicPlayerPreferences (`src/hooks/useMusicPlayerPreferences.ts`)

Store player UI preferences.

```typescript
import { useMusicPlayerPreferences } from '@/hooks/useMusicPlayerPreferences';

function PlayerSection() {
  const {
    preferredPlayer,
    setPreferredPlayer,
    isPlayerExpanded,
    setPlayerExpanded
  } = useMusicPlayerPreferences();

  return (
    <PlayerToggle
      active={preferredPlayer}
      onChange={setPreferredPlayer}
    />
  );
}
```

**Stored in localStorage:**
```typescript
interface PlayerPreferences {
  preferredPlayer: 'spotify' | 'apple-music';
  isExpanded: boolean;
  volume: number;
}
```

---

## Wrapped Hooks

### useWrappedNavigation (`src/pages/wrapped/hooks/useWrappedNavigation.ts`)

Navigation state for wrapped presentation mode.

```typescript
import { useWrappedNavigation } from './hooks/useWrappedNavigation';

function WrappedPresentation() {
  const navigation = useWrappedNavigation({
    totalSections: 6,
  });

  return (
    <div>
      <Section index={navigation.currentSection} />
      <nav>
        <button onClick={navigation.prevSection}>Previous</button>
        <span>{navigation.currentSection + 1} / {navigation.totalSections}</span>
        <button onClick={navigation.nextSection}>Next</button>
      </nav>
    </div>
  );
}
```

`WrappedPresentation` uses the hook for scroll-snap section state, chapter jumps and
keyboard previous/next navigation. It does not use the hook's auto-advance (which ticks
React state every 50ms); the transport's Play button drives playback with a CSS
`.hero-progress` animation per chapter instead, advancing on `animationend`.

---

## Hook Best Practices

### Dependency Arrays

Always include all dependencies:

```typescript
// Correct
useEffect(() => {
  fetchAlbum(slug);
}, [slug]);

// Incorrect - stale closure
useEffect(() => {
  fetchAlbum(slug);
}, []);
```

### Cleanup Functions

Return cleanup functions when needed:

```typescript
function useEventListener(event, handler) {
  useEffect(() => {
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  }, [event, handler]);
}
```

### Memoization

Use useMemo/useCallback for expensive operations:

```typescript
function useFilteredAlbums(albums, filter) {
  return useMemo(() => {
    return albums.filter(a => matchesFilter(a, filter));
  }, [albums, filter]);
}
```

### Custom Hook Composition

Compose hooks for complex functionality:

```typescript
function useAlbumDetail(slug) {
  const [album, setAlbum] = useState(null);
  const palette = useAlbumColors(slug);
  const { isAuthenticated } = useLastFmAuth();

  useEffect(() => {
    fetch(`/album/${slug}/index.json`)
      .then(r => r.json())
      .then(setAlbum);
  }, [slug]);

  return {
    album,
    flood: floodFor(palette),
    canScrobble: isAuthenticated
  };
}
```
