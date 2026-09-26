# Data Schemas

This document details all JSON structures and the database schema used in russ.fm.

## JSON Schemas

### collection.json

Main collection index used for album listings.

```json
{
  "generated_at": "2024-01-15T10:30:00Z",
  "total_albums": 1234,
  "albums": [
    {
      "release_name": "OK Computer",
      "release_artist": "Radiohead",
      "uri_release": "/album/radiohead-ok-computer",
      "uri_artist": "/artist/radiohead",
      "date_added": "2024-01-10T15:00:00Z",
      "date_release_year": 1997,
      "year_original": 1997,
      "discogs_id": "123456",
      "genre_names": ["Alternative Rock", "Art Rock"],
      "artists": [
        {
          "name": "Radiohead",
          "slug": "radiohead",
          "uri": "/artist/radiohead"
        }
      ],
      "images_uri_release": {
        "hi-res": "/album/radiohead-ok-computer/radiohead-ok-computer-hi-res.jpg",
        "medium": "/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg"
      },
      "images_uri_artist": {
        "hi-res": "/artist/radiohead/radiohead-hi-res.jpg",
        "medium": "/artist/radiohead/radiohead-medium.jpg",
        "avatar": "/artist/radiohead/radiohead-avatar.jpg"
      },
      "spotify_url": "https://open.spotify.com/album/...",
      "apple_music_url": "https://music.apple.com/us/album/...",
      "discogs_url": "https://www.discogs.com/release/123456"
    }
  ]
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| generated_at | string | ISO 8601 timestamp of generation |
| total_albums | number | Total album count |
| albums[].release_name | string | Album title |
| albums[].release_artist | string | Primary artist name |
| albums[].uri_release | string | Album URL path |
| albums[].uri_artist | string | Primary artist URL path |
| albums[].date_added | string | When added to collection |
| albums[].date_release_year | string | Release date (`YYYY-MM-DD`). Prefers Apple Music, then Spotify, then the pressing's Discogs year, so it is often a reissue date |
| albums[].year_original | number \| null | Original release year: the Discogs master year when known, otherwise the earliest year any source reports. Use this (via `src/lib/releaseYear.ts`) for anything that orders, groups, filters or labels by year |
| albums[].discogs_id | string | Discogs release ID |
| albums[].genre_names | string[] | Genre list |
| albums[].styles | string[] | Discogs styles (excluding generic "Music"); used by detail page + browse |
| albums[].formats | string[] | All Discogs format descriptors (Vinyl, LP, Album, Compilation, Box Set, …) |
| albums[].format_primary | string \| null | Single canonical format bucket: Vinyl / CD / Cassette / Box Set / Digital. Powers the `/albums?format=…` filter and the Stats page format donut. |
| albums[].labels | string[] | Record label names; powers `/labels` and `/label/:slug` |
| albums[].country | string \| null | Discogs release country; powers `/countries` and `/country/:slug` |
| albums[].lastfm_listeners | number \| null | Last.fm `album.getInfo` listener count; powers the Stats "Hidden gems" section |
| albums[].artists | object[] | Headline artist objects (band-member credits are excluded — see `members`) |
| albums[].members | object[]? | Present only when the release credits a band's line-up: `[{name, uri_artist, json_detailed_artist}]` in credit order. The link fields are null when the member has no published artist page |
| albums[].images_uri_release | object | Album image paths |
| albums[].images_uri_artist | object | Artist image paths |
| albums[].spotify_url | string? | Spotify album URL |
| albums[].apple_music_url | string? | Apple Music URL |
| albums[].discogs_url | string | Discogs release URL |
| albums[].boxset | object? | Present only on boxset members: `{parent_discogs_id, name, uri_release}` linking to the parent box. `name`/`uri_release` are null if the parent has no collection entry |
| albums[].boxset_contents | object[]? | Present only on boxset parents with linked members: `[{release_name, uri_release, images_uri_release}]`, sorted by release year then name |

> **Phase 1 data-leverage update (May 2026):** the five fields `styles`, `formats`, `format_primary`, `labels`, `country`, `lastfm_listeners` were added to the collection.json index so faceted browse pages and Stats v2 don't need to lazy-load every per-album JSON. They are denormalised at index time by the collection generator ([`scrapper/src/output/collection.rs`](../../scrapper/src/output/collection.rs)).
>
> collection.json is regenerated after every mutating scrapper action — collection runs, CLI
> `--save` commands, and every TUI detail-editor edit/refresh — so it always reflects the DB.
>
> **Original year (Sep 2026):** `year_original` sits right after `date_release_year`. It comes
> from `raw_data.discogs.master_year` on the release row (the Discogs master's `year`); without
> one the generator takes the earliest year from the Discogs `year` / `released`, Apple Music
> `releaseDate` and Spotify `release_date`, including years parsed out of Python-era repr
> strings. `date_release_year` is unchanged and the album JSON does not carry `year_original`.
> Backfill older rows with `scrapper backfill-original-years`.
>
> **Band members (Sep 2026):** Discogs credits some releases as a band followed by its players
> ("James Taylor Trio", "James Taylor", "Orlando Le Fleming", …). Those line-up credits carry
> `role: "member"` in the release row's `artists` (and in the album JSON's `artists[].role`).
> The generator builds `release_artist`, `uri_artist` and `artists[]` from the headliners only
> and lists the line-up under `members`. Member credits don't seed artist rows, so they get no
> artist page of their own unless they headline elsewhere. Auto-detection and the backfill are
> described in [`docs/backend/README.md`](../backend/README.md).
>
> **Boxsets (Aug 2026):** albums inside a boxset are added individually via
> `scrapper release <id> --save --boxset <parent_id>`; the link is stored in the release row's
> `raw_data.boxset` and the generator denormalises it in both directions (`boxset` on members,
> `boxset_contents` on parents). Members inherit the parent's `date_added`. Frontend policy: a
> member (`boxset != null`) stays in search, its own page, sitemap, and album-colors, but is
> excluded from stats, home recents/hero/walls, `/albums`, `/artists` counts, random pages,
> facet browse, the genre explorer, and wrapped — the helper is
> [`src/lib/boxsets.ts`](../../src/lib/boxsets.ts). The `boxset` key inside DB `raw_data` is
> deliberately not emitted into the public album JSON (`release_services` whitelists keys).
> The same `raw_data.boxset` object can instead carry `single_release: true` (set from the TUI
> Boxsets screen) on a box-format release that is really one album; it has no parent link, so
> the generator ignores it and nothing reaches collection.json or the album JSON.

---

### Album JSON (`album/{slug}/{slug}.json`)

Full album data for detail views.

```json
{
  "release_name": "OK Computer",
  "release_artist": "Radiohead",
  "discogs_id": "123456",
  "date_added": "2024-01-10T15:00:00Z",
  "date_release_year": 1997,
  "uri_release": "/album/radiohead-ok-computer",
  "uri_artist": "/artist/radiohead",

  "artists": [
    {
      "name": "Radiohead",
      "slug": "radiohead",
      "uri": "/artist/radiohead",
      "discogs_id": "3840"
    }
  ],

  "genre_names": ["Alternative Rock", "Art Rock"],
  "style_names": ["Experimental", "Post-Rock"],

  "labels": [
    {
      "name": "Parlophone",
      "catalog_number": "7243 8 55229 2 5"
    }
  ],

  "formats": [
    {
      "name": "CD",
      "qty": "1",
      "descriptions": ["Album"]
    }
  ],

  "country": "UK",

  "tracklist": [
    {
      "position": "1",
      "title": "Airbag",
      "duration": "4:44",
      "artists": []
    },
    {
      "position": "2",
      "title": "Paranoid Android",
      "duration": "6:23",
      "artists": []
    }
  ],

  "images_uri_release": {
    "hi-res": "/album/radiohead-ok-computer/radiohead-ok-computer-hi-res.jpg",
    "medium": "/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg"
  },

  "images_uri_artist": {
    "hi-res": "/artist/radiohead/radiohead-hi-res.jpg",
    "medium": "/artist/radiohead/radiohead-medium.jpg",
    "avatar": "/artist/radiohead/radiohead-avatar.jpg"
  },

  "spotify_url": "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE",
  "apple_music_url": "https://music.apple.com/us/album/ok-computer/1097862062",
  "discogs_url": "https://www.discogs.com/release/123456",
  "lastfm_url": "https://www.last.fm/music/Radiohead/OK+Computer",

  "raw_data": {
    "services": {
      "discogs": {
        "id": 123456,
        "master_id": 21491
      },
      "apple_music": {
        "id": "1097862062",
        "artwork": {
          "url": "https://is1-ssl.mzstatic.com/image/..."
        },
        "editorial_notes": {
          "short": "A landmark album...",
          "standard": "OK Computer is the third studio album..."
        }
      },
      "spotify": {
        "id": "6dVIqQ8qmQ5GBnJ9shOYGE",
        "popularity": 78
      },
      "lastfm": {
        "mbid": "...",
        "wiki_summary": "OK Computer is the third studio album...",
        "wiki_content": "Full wiki content..."
      },
      "perplexity": {
        "description": "AI-generated description...",
        "generated_at": "2024-01-15T10:30:00Z",
        "model": "sonar"
      }
    }
  }
}
```

---

### Artist JSON (`artist/{slug}/{slug}.json`)

Full artist data.

```json
{
  "name": "Radiohead",
  "slug": "radiohead",
  "uri": "/artist/radiohead",

  "discogs_id": "3840",
  "apple_music_id": "657515",
  "spotify_id": "4Z8W4fKeB5YxbusRsdQVPb",

  "biography": "Radiohead are an English rock band formed in Abingdon...",

  "genres": ["Alternative Rock", "Art Rock", "Electronic"],

  "country": "UK",
  "formed_date": "1985",

  "images": {
    "hi-res": "/artist/radiohead/radiohead-hi-res.jpg",
    "medium": "/artist/radiohead/radiohead-medium.jpg",
    "avatar": "/artist/radiohead/radiohead-avatar.jpg"
  },

  "external_urls": {
    "discogs": "https://www.discogs.com/artist/3840",
    "spotify": "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb",
    "apple_music": "https://music.apple.com/us/artist/radiohead/657515",
    "wikipedia": "https://en.wikipedia.org/wiki/Radiohead"
  },

  "popularity": {
    "spotify_followers": 8000000,
    "spotify_popularity": 75
  },

  "discography_count": 15,

  "raw_data": {
    "services": {
      "discogs": {...},
      "spotify": {...},
      "apple_music": {...},
      "lastfm": {...},
      "wikipedia": {...}
    }
  }
}
```

The artist page's biography reads `services.lastfm.bio_content` (Last.fm's full
biography, HTML with a "Read more on Last.fm" link and licence line at the end)
and uses it when it is longer than `biography`. Keep that key in the per-artist
JSON.

---

### album-colors.json

Sleeve colours for every album, decided at build time by
`scripts/generate-album-colors.js` (see
[asset-processing.md](../build-pipeline/asset-processing.md#color-extraction)).
Keyed by `uri_release`, one album per line, in `collection.json` order. Albums no
longer in the collection are dropped.

```json
{
  "/album/bloom-38528559/": {"v":2,"flood":"#d2d5df","ink":"#0e0d0c","ground":"#1b1b1e","glow":"#d2d5df","secondary":null,"hue":0.762,"vivid":0},
  "/album/glastonbury-1994-38527017/": {"v":2,"flood":"#05abcb","ink":"#0e0d0c","ground":"#0a232b","glow":"#05abcb","secondary":"#0f5a97","hue":0.605,"vivid":0.94}
}
```

**Fields:**

| Field | Description |
|-------|-------------|
| v | Palette version (currently `2`); the generator redoes entries from older versions |
| flood | The sleeve's colour, used for heroes, tiles, bars and chips. A pale neutral tinted with the sleeve's own cast when `vivid` is 0 |
| ink | `#0e0d0c` or `#fbf7ef`, whichever reads better on the flood |
| ground | The sleeve's own dark (OKLab L 0.17–0.24), used for page bodies and vinyl labels. Never pure black |
| glow | The flood, lightened (keeping its hue) until it reaches 3:1 on the ground |
| secondary | A second sleeve colour that clearly differs from the flood, or `null` |
| hue | Flood hue, 0–1 (OKLCH), for colour sorting |
| vivid | How bold the flood is: 0 for monochrome sleeves, up to about 2.6 |

Albums without artwork get the default palette (flood `#e8e2d6`, ground `#1c1916`,
`vivid` 0).

---

### album-swatches.json

The sleeve's main colours, for the "Sleeve colours" section on the album page. Same
keys as `album-colors.json`; each value is up to six `[hex, percentOfSleeve]` pairs,
largest first (empty for albums without artwork).

```json
{
  "/album/glastonbury-1994-38527017/": [["#183139",23],["#465428",23],["#135084",11],["#efc74e",11],["#9c7f32",10],["#39b7b0",9]]
}
```

It is a separate file because only the album page uses it: folded into
`album-colors.json` it would roughly double the size of the map every page loads
(about 138 KB gzipped for the map, 178 KB for the swatches). The frontend fetches it
on first use through `useAlbumSwatches()`.

---

### wrapped.json

Year-in-review data structure.

```json
{
  "years": {
    "2024": {
      "year": 2024,
      "isYearToDate": false,
      "summary": {
        "totalAlbums": 42,
        "totalArtists": 35,
        "newArtists": 12,
        "firstAlbum": {...},
        "lastAlbum": {...}
      },
      "releases": [
        {
          "release_name": "Album Title",
          "release_artist": "Artist Name",
          "date_added": "2024-03-15T10:00:00Z",
          "date_release_year": 2024,
          "year_original": 1997,
          "slug": "artist-album",
          "images": {...},
          "colors": {
            "v": 2,
            "flood": "#e6752f",
            "ink": "#0e0d0c",
            "ground": "#281c12",
            "glow": "#e6752f",
            "secondary": "#923026",
            "hue": 0.134,
            "vivid": 0.88
          }
        }
      ],
      "insights": {
        "genres": {
          "top": [
            {"name": "Electronic", "count": 15},
            {"name": "Rock", "count": 10}
          ],
          "distribution": {...}
        },
        "decades": {
          "2020s": 20,
          "2010s": 12,
          "2000s": 5,
          "1990s": 3,
          "1980s": 2
        },
        "timeline": {
          "January": 3,
          "February": 5,
          "March": 8
        },
        "topArtists": [
          {"name": "Artist 1", "count": 5},
          {"name": "Artist 2", "count": 3}
        ],
        "topAlbumsByMonth": {
          "January": {...},
          "February": {...}
        }
      }
    }
  }
}
```

---

## Database Schema

### SQLite Tables

#### releases

```sql
CREATE TABLE releases (
    id TEXT PRIMARY KEY,
    discogs_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artists TEXT,  -- JSON array
    year INTEGER,
    released TEXT,
    country TEXT,
    formats TEXT,  -- JSON array
    labels TEXT,   -- JSON array
    genres TEXT,   -- JSON array
    styles TEXT,   -- JSON array
    images TEXT,   -- JSON array
    tracklist TEXT,  -- JSON array
    videos TEXT,     -- JSON array of URL strings

    -- Per-source display names
    release_name_discogs TEXT,
    release_name_apple_music TEXT,
    release_name_spotify TEXT,

    -- External IDs
    apple_music_id TEXT,
    spotify_id TEXT,
    lastfm_mbid TEXT,

    -- URLs
    discogs_url TEXT,
    apple_music_url TEXT,
    spotify_url TEXT,
    lastfm_url TEXT,

    -- Enrichment data
    enrichment_data TEXT,  -- JSON
    local_images TEXT,     -- JSON {hi-res, medium, small} relative paths
    raw_data TEXT,  -- JSON (per-service payloads; see note below)

    -- Timestamps
    created_at TEXT,
    updated_at TEXT,
    date_added TEXT
);

CREATE INDEX idx_releases_discogs_id ON releases(discogs_id);
CREATE INDEX idx_releases_year ON releases(year);
```

> **`raw_data` layout:** each service's payload is stored at the top level of `raw_data`
> (`raw_data.apple_music`, `raw_data.spotify`, `raw_data.lastfm`, `raw_data.perplexity`) — this
> is what the public `services{}` block is derived from. The canonical Perplexity location is the
> top-level `raw_data.perplexity`; rows written by the retired Python pipeline may still nest it
> under `raw_data.services.perplexity`, and readers fall back to that legacy key.
>
> `raw_data.discogs` holds the release's source `images`, `master_id` (null when the release has
> no master) and `master_year`, the master's original release year. `master_year: null` means
> "looked up, no master or no year"; an absent key means not looked up yet (or the lookup
> failed), which is what `backfill-original-years` picks up. Set by `process_release`, the
> detail editor's Discogs refresh and the backfill; no schema change.

#### artists

```sql
CREATE TABLE artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    biography TEXT,

    -- External IDs
    discogs_id TEXT,
    apple_music_id TEXT,
    spotify_id TEXT,
    lastfm_mbid TEXT,

    -- URLs
    discogs_url TEXT,
    apple_music_url TEXT,
    spotify_url TEXT,
    lastfm_url TEXT,
    wikipedia_url TEXT,

    -- Images
    images TEXT,  -- JSON
    local_images TEXT,  -- JSON

    -- Details
    genres TEXT,  -- JSON
    popularity INTEGER,
    followers INTEGER,
    country TEXT,
    formed_date TEXT,

    -- Enrichment
    enrichment_data TEXT,  -- JSON
    raw_data TEXT,  -- JSON

    -- Timestamps
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_artists_discogs_id ON artists(discogs_id);
```

Release saves seed missing credited artists into this table as unenriched
placeholder rows keyed by case-insensitive name or Discogs id. `artist-batch`
also backfills placeholders from existing release rows before listing work.
Existing artist rows are preserved so enrichment data is not overwritten by
collection imports.

#### collection_items

```sql
CREATE TABLE collection_items (
    id TEXT PRIMARY KEY,
    release_id TEXT,
    folder_id TEXT,
    instance_id TEXT,
    date_added TEXT,
    notes TEXT,
    rating INTEGER,
    basic_information TEXT,  -- JSON
    processed BOOLEAN DEFAULT FALSE,
    enriched BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE INDEX idx_collection_processed ON collection_items(processed);
CREATE INDEX idx_collection_date ON collection_items(date_added);
```

---

## TypeScript Interfaces

### Album Type (`src/types/album.ts`)

```typescript
interface Album {
  release_name: string;
  release_artist: string;
  discogs_id: string;
  date_added: string;
  date_release_year: string;      // often the reissue/pressing date
  year_original?: number | null;  // original release year (Discogs master, else earliest known)
  uri_release: string;
  uri_artist: string;

  artists: Artist[];
  genre_names: string[];
  style_names?: string[];

  labels?: Label[];
  formats?: Format[];
  country?: string;
  tracklist?: Track[];

  images_uri_release: {
    'hi-res': string;
    medium: string;
  };

  images_uri_artist?: {
    'hi-res': string;
    medium: string;
    avatar: string;
  };

  spotify_url?: string;
  apple_music_url?: string;
  discogs_url: string;
  lastfm_url?: string;

  json_detailed_release?: string;
  json_detailed_artist?: string;

  raw_data?: {
    services: {
      discogs?: DiscogsData;
      apple_music?: AppleMusicData;
      spotify?: SpotifyData;
      lastfm?: LastFmData;
      perplexity?: PerplexityData;
    };
  };
}

interface Artist {
  name: string;
  slug: string;
  uri: string;
  discogs_id?: string;
}

interface Track {
  position: string;
  title: string;
  duration?: string;
  artists?: Artist[];
}

interface Label {
  name: string;
  catalog_number?: string;
}

interface Format {
  name: string;
  qty?: string;
  descriptions?: string[];
}
```

### Color Palette Type

```typescript
// src/hooks/useAlbumColors.ts; ColorPalette in src/types/wrapped.ts is an alias
interface AlbumColorPalette {
  v: number;
  flood: string;
  ink: string;
  ground: string;
  glow: string;
  secondary: string | null;
  hue: number;   // 0–1
  vivid: number; // 0 for monochrome, up to ~2.6
}

type AlbumColors = Record<string, AlbumColorPalette>;
type AlbumSwatch = [string, number]; // [hex, percent of the sleeve]
type AlbumSwatches = Record<string, AlbumSwatch[]>;
```

### Search Result Type

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

### Wrapped Types (`src/types/wrapped.ts`)

```typescript
interface WrappedRelease {
  release_name: string;
  release_artist: string;
  date_added: string;
  date_release_year: string;
  year_original?: number | null;
  slug: string;
  images: {
    'hi-res': string;
    medium: string;
  };
  artists: { name: string; slug: string }[];
  colors?: ColorPalette;
}

interface WrappedData {
  year: number;
  isYearToDate: boolean;
  summary: WrappedSummary;
  releases: WrappedRelease[];
  insights: WrappedInsights;
  theme?: WrappedTheme;
}

interface WrappedSummary {
  totalAlbums: number;
  totalArtists: number;
  newArtists: number;
  firstAlbum: WrappedRelease;
  lastAlbum: WrappedRelease;
}

interface WrappedInsights {
  genres: {
    top: { name: string; count: number }[];
    distribution: Record<string, number>;
  };
  decades: Record<string, number>;
  timeline: Record<string, number>;
  topArtists: { name: string; count: number }[];
  topAlbumsByMonth: Record<string, WrappedRelease>;
}
```

---

## Validation

### Required Fields

**collection.json albums:**
- `release_name` - Cannot be empty
- `release_artist` - Cannot be empty
- `uri_release` - Must start with `/album/`
- `images_uri_release.medium` - Required for display

**Album JSON:**
- All collection.json fields plus:
- `discogs_id` - Must be valid number string
- `tracklist` - Should have at least one track

### Image Path Format

```
/album/{slug}/{slug}-{size}.jpg
/artist/{slug}/{slug}-{size}.jpg
```

Where `{size}` is one of: `hi-res`, `medium`, `avatar`

### URL Format

```
Spotify: https://open.spotify.com/album/{id}
Apple Music: https://music.apple.com/{storefront}/album/{name}/{id}
Discogs: https://www.discogs.com/release/{id}
Last.fm: https://www.last.fm/music/{artist}/{album}
```
