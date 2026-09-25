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

Auto-searching variant with debouncing.

```typescript
import { useInstantSearch } from '@/hooks/useSearch';

function InstantSearch() {
  const { query, setQuery, results } = useInstantSearch({
    debounceMs: 300,
    minLength: 2
  });

  // Results update automatically as user types
}
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| debounceMs | `number` | 300 | Debounce delay |
| minLength | `number` | 2 | Minimum query length |
| limit | `number` | 20 | Max results |

---

### useMobileSearch

Mobile-optimized search with simplified results.

```typescript
import { useMobileSearch } from '@/hooks/useSearch';

function MobileSearch() {
  const { query, setQuery, results, isLoading } = useMobileSearch();
  // Uses relaxed matching for touch interfaces
}
```

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

All colour hooks read the pre-extracted `/album-colors.json` (URI → palette), which is
fetched once and cached in memory. Turn a palette into page colours with `floodFor()` from
[`src/lib/sleeveColour.ts`](./utilities.md#sleeve-colours-srclibsleevecolourts).

```typescript
interface AlbumColorPalette {
  background: string;  // dark background swatch
  foreground: string;  // text colour on the background
  accent: string;      // most vibrant swatch (often near-black on dark covers)
  muted: string;       // secondary swatch
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

---

### useAlbumColorMap

The whole URI → palette map. Use it when a page paints many sleeves at once (grids, shelves,
the crate, browse cards, the genre map, Wrapped) instead of calling `useAlbumColors` per
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

Same as `useAlbumColors` but never `null`: returns a neutral dark palette when the album has
no entry.

---

### preloadAlbumColors

`preloadAlbumColors(): Promise<void>` starts loading `album-colors.json` ahead of use.

---

## Flood Hooks

Defined in `src/components/player/flood-context.ts` and exported from
`@/components/player`. They need `FloodProvider`, which wraps the app in `App.tsx`.

### usePageFlood

Sets the page's flood colour while the calling page is mounted. The sticky navigation paints
itself in the same colour until the page scrolls, and `--flood` / `--flood-ink` are set on
`<html>`. Call it in any page with a colour hero.

```typescript
import { usePageFlood } from '@/components/player';

const flood = floodFor(palette);
usePageFlood(album ? flood.flood : null, album ? flood.ink : null);
```

**Parameters:** `flood`, `ink` (`string | null | undefined`). Passing `null` for either
resets to the dark ground; the flood is also reset when the page unmounts. Unchanged values
are ignored, so it is safe to call on every render.

### useFloodValue

Reads the current `{ flood, ink }`. Used by `Navigation`.

```typescript
import { useFloodValue } from '@/components/player';

const { flood, ink } = useFloodValue();
```

---

## Theme Hooks

### useTheme (`src/hooks/useTheme.ts`)

Returns `'light' | 'dark'` from the `dark` class that `ThemeProvider` sets on `<html>`
(following the system preference), and updates when it changes. The site itself is
dark-ground only and does not use it for styling; `SpotifyEmbed` and `AppleMusicEmbed` pass
it to the embeds.

```typescript
import { useTheme } from '@/hooks/useTheme';

const theme = useTheme(); // 'light' | 'dark'
```

---

## Animation Hooks

### useCountAnimation (`src/hooks/useCountAnimation.ts`)

Animate counting from 0 to target number.

```typescript
import { useCountAnimation } from '@/hooks/useCountAnimation';

function StatDisplay({ value }) {
  const count = useCountAnimation(value, {
    duration: 2000,
    delay: 500
  });

  return <span>{count}</span>;
}
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| duration | `number` | 1500 | Animation duration (ms) |
| delay | `number` | 0 | Start delay (ms) |
| easing | `(t: number) => number` | easeOutQuad | Easing function |

**Custom Easing:**
```typescript
const count = useCountAnimation(1000, {
  easing: t => t * t * t // Cubic easing
});
```

---

### useScrollAnimation (`src/hooks/useScrollAnimation.ts`)

Intersection Observer for scroll-triggered animations.

```typescript
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

function AnimatedSection() {
  const { ref, isVisible } = useScrollAnimation({
    threshold: 0.2,
    once: true
  });

  return (
    <div
      ref={ref}
      className={isVisible ? 'animate-in' : 'opacity-0'}
    >
      Content reveals on scroll
    </div>
  );
}
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| threshold | `number` | 0.1 | Visibility threshold |
| rootMargin | `string` | '0px' | Observer margin |
| delay | `number` | 0 | Animation delay |
| once | `boolean` | true | Only animate once |

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

`WrappedPresentation` currently uses the hook for scroll-snap section state, chapter jumps,
and keyboard previous/next navigation. The hook still supports auto-advance, but the Crate
Journey presentation does not expose timed playback by default.

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
  const { colors } = useAlbumColors(slug);
  const { isAuthenticated } = useLastFmAuth();

  useEffect(() => {
    fetch(`/album/${slug}/index.json`)
      .then(r => r.json())
      .then(setAlbum);
  }, [slug]);

  return {
    album,
    colors,
    canScrobble: isAuthenticated
  };
}
```
