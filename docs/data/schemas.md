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
| albums[].date_release_year | number | Release year |
| albums[].discogs_id | string | Discogs release ID |
| albums[].genre_names | string[] | Genre list |
| albums[].styles | string[] | Discogs styles (excluding generic "Music"); used by detail page + browse |
| albums[].formats | string[] | All Discogs format descriptors (Vinyl, LP, Album, Compilation, Box Set, …) |
| albums[].format_primary | string \| null | Single canonical format bucket: Vinyl / CD / Cassette / Box Set / Digital. Powers the `/albums?format=…` filter and the Stats page format donut. |
| albums[].labels | string[] | Record label names; powers `/labels` and `/label/:slug` |
| albums[].country | string \| null | Discogs release country; powers `/countries` and `/country/:slug` |
| albums[].lastfm_listeners | number \| null | Last.fm `album.getInfo` listener count; powers the Stats "Hidden gems" section |
| albums[].artists | object[] | Artist objects |
| albums[].images_uri_release | object | Album image paths |
| albums[].images_uri_artist | object | Artist image paths |
| albums[].spotify_url | string? | Spotify album URL |
| albums[].apple_music_url | string? | Apple Music URL |
| albums[].discogs_url | string | Discogs release URL |

> **Phase 1 data-leverage update (May 2026):** the five fields `styles`, `formats`, `format_primary`, `labels`, `country`, `lastfm_listeners` were added to the collection.json index so faceted browse pages and Stats v2 don't need to lazy-load every per-album JSON. They are denormalised at index time by [`scrapper/music_collection_manager/utils/collection_generator.py`](../../scrapper/music_collection_manager/utils/collection_generator.py).

---

### Album JSON (`album/{slug}/index.json`)

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

### Artist JSON (`artist/{slug}/index.json`)

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

---

### album-colors.json

Pre-extracted color palettes for dynamic theming.

```json
{
  "radiohead-ok-computer": {
    "background": "#1a1a2e",
    "foreground": "#ffffff",
    "accent": "#4a90a4",
    "muted": "#6b7b8a"
  },
  "radiohead-kid-a": {
    "background": "#0d1117",
    "foreground": "#ffffff",
    "accent": "#dc3545",
    "muted": "#555555"
  }
}
```

**Color Definitions:**

| Color | Description |
|-------|-------------|
| background | Dark color derived from album artwork |
| foreground | Text color (typically white) |
| accent | Most vibrant color from palette |
| muted | Secondary/subtle accent color |

---

### album-colors.css

CSS custom properties for album colors.

```css
.radiohead-ok-computer {
  --album-bg: #1a1a2e;
  --album-fg: #ffffff;
  --album-accent: #4a90a4;
  --album-muted: #6b7b8a;
}

.radiohead-kid-a {
  --album-bg: #0d1117;
  --album-fg: #ffffff;
  --album-accent: #dc3545;
  --album-muted: #555555;
}
```

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
          "slug": "artist-album",
          "images": {...},
          "colors": {
            "background": "#1a1a2e",
            "foreground": "#ffffff",
            "accent": "#ff6600",
            "muted": "#666666"
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
    raw_data TEXT,  -- JSON

    -- Timestamps
    created_at TEXT,
    updated_at TEXT,
    date_added TEXT
);

CREATE INDEX idx_releases_discogs_id ON releases(discogs_id);
CREATE INDEX idx_releases_year ON releases(year);
```

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
  date_release_year: number;
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
interface ColorPalette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

type AlbumColors = Record<string, ColorPalette>;
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
  date_release_year: number;
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
