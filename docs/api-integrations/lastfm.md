# Last.fm API Integration

Last.fm provides wiki content, tags, and scrobbling functionality.

## Overview

- **Base URL**: `https://ws.audioscrobbler.com/2.0`
- **Auth**: API key (+ shared secret for scrobbling)
- **Rate Limit**: 60 requests/minute
- **Documentation**: [last.fm/api](https://www.last.fm/api)

## Configuration

```json
{
  "lastfm": {
    "api_key": "YOUR_API_KEY",
    "shared_secret": "YOUR_SHARED_SECRET",
    "username": "YOUR_USERNAME",
    "rate_limit": 60
  }
}
```

### Getting Credentials

1. Go to [last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Create an API account
3. Note API Key and Shared Secret

## Service Class

**File**: `scrapper/music_collection_manager/services/lastfm/lastfm_service.py`

```python
from music_collection_manager.services.lastfm import LastFmService

service = LastFmService(config)
```

## Methods

### authenticate()

Test API key validity.

```python
is_valid = service.authenticate()
# Returns: bool
```

---

### search_release(artist, album)

Search for albums.

```python
results = service.search_release("Radiohead", "OK Computer")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist | string | Yes | Artist name |
| album | string | Yes | Album title |

**Response:**
```python
[
    {
        "name": "OK Computer",
        "artist": "Radiohead",
        "url": "https://www.last.fm/music/Radiohead/OK+Computer",
        "image": [...],
        "mbid": "a1234567-89ab-cdef-0123-456789abcdef"
    }
]
```

---

### get_album_info(artist, album, mbid=None)

Get detailed album information with wiki content.

```python
album = service.get_album_info("Radiohead", "OK Computer")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist | string | Yes | Artist name |
| album | string | Yes | Album title |
| mbid | string | No | MusicBrainz ID |

**Response:**
```python
{
    "name": "OK Computer",
    "artist": "Radiohead",
    "mbid": "a1234567-89ab-cdef-0123-456789abcdef",
    "url": "https://www.last.fm/music/Radiohead/OK+Computer",
    "listeners": "2500000",
    "playcount": "85000000",
    "image": [
        {"#text": "https://lastfm.freetls.fastly.net/...", "size": "small"},
        {"#text": "https://lastfm.freetls.fastly.net/...", "size": "medium"},
        {"#text": "https://lastfm.freetls.fastly.net/...", "size": "large"},
        {"#text": "https://lastfm.freetls.fastly.net/...", "size": "extralarge"},
        {"#text": "https://lastfm.freetls.fastly.net/...", "size": "mega"}
    ],
    "tags": {
        "tag": [
            {"name": "alternative rock", "url": "..."},
            {"name": "rock", "url": "..."},
            {"name": "90s", "url": "..."}
        ]
    },
    "wiki": {
        "published": "01 Jan 2008, 00:00",
        "summary": "OK Computer is the third studio album by the English rock band Radiohead, released on 16 June 1997...<a href=\"...\">Read more on Last.fm</a>",
        "content": "OK Computer is the third studio album by the English rock band Radiohead, released on 16 June 1997 on Parlophone in the United Kingdom..."
    },
    "tracks": {
        "track": [
            {
                "name": "Airbag",
                "url": "...",
                "duration": "284",
                "@attr": {"rank": "1"}
            }
        ]
    }
}
```

---

### get_artist_info(artist, mbid=None)

Get artist information.

```python
artist = service.get_artist_info("Radiohead")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist | string | Yes | Artist name |
| mbid | string | No | MusicBrainz ID |

**Response:**
```python
{
    "name": "Radiohead",
    "mbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711",
    "url": "https://www.last.fm/music/Radiohead",
    "image": [...],
    "stats": {
        "listeners": "4500000",
        "playcount": "450000000"
    },
    "similar": {
        "artist": [
            {"name": "Thom Yorke", "url": "..."},
            {"name": "Atoms for Peace", "url": "..."}
        ]
    },
    "tags": {
        "tag": [
            {"name": "alternative rock", "url": "..."},
            {"name": "electronic", "url": "..."}
        ]
    },
    "bio": {
        "summary": "Radiohead are an English rock band from Abingdon, Oxfordshire...",
        "content": "Full biography..."
    }
}
```

---

### search_artist(artist_name)

Search for artists.

```python
results = service.search_artist("Radiohead")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist_name | string | Yes | Artist name to search |

**Response:**
```python
[
    {
        "name": "Radiohead",
        "listeners": "4500000",
        "mbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711",
        "url": "https://www.last.fm/music/Radiohead",
        "image": [...]
    }
]
```

---

## Wiki Content

Last.fm provides wiki summaries and full content:

```python
album = service.get_album_info(artist, album)

wiki = album.get("wiki", {})
summary = wiki.get("summary", "")
content = wiki.get("content", "")

# Clean HTML links
import re
summary_clean = re.sub(r'<a href=.*?>Read more on Last.fm</a>', '', summary)
```

**Usage in Frontend:**
```typescript
// Fallback chain for descriptions
const description =
  album.raw_data?.services?.apple_music?.editorial_notes?.short ||
  album.raw_data?.services?.lastfm?.wiki_summary ||
  album.raw_data?.services?.perplexity?.description;
```

## Frontend Scrobbling

### OAuth Flow

```typescript
// src/hooks/useLastFmAuth.ts
const login = () => {
  const callbackUrl = encodeURIComponent(window.location.origin + '/auth/callback');
  window.location.href = `https://www.last.fm/api/auth/?api_key=${API_KEY}&cb=${callbackUrl}`;
};
```

### Session Authentication

```typescript
// After OAuth callback with token
const response = await fetch('/api/auth/lastfm', {
  method: 'POST',
  body: JSON.stringify({ token })
});

const { session_key, username } = await response.json();
// Store in localStorage
```

### Scrobble Request

```typescript
// src/hooks/useScrobble.ts
const scrobble = async (track: ScrobbleRequest) => {
  const response = await fetch('/api/scrobble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist: track.artist,
      track: track.track,
      album: track.album,
      timestamp: Math.floor(Date.now() / 1000)
    })
  });
};
```

### Album Scrobbling

`POST /api/scrobble/album` walks the tracklist, staggering timestamps by 3 minutes to
simulate a listen. Two rules keep compilations working:

**Artist resolution.** Each track is scrobbled as its own per-track artist
(`tracklist[].artists[0].name`), falling back to the release artist. Compilations must carry
per-track credits, or every track resolves to the release artist — `Various` — which Last.fm
filters. Tracks that resolve to a placeholder (`Various`, `Various Artists`, `V/A`,
`Unknown Artist`, `Soundtrack`) are **skipped before the request** and reported as skipped,
rather than posted as guaranteed no-ops. If no track survives, the endpoint returns `422`.

The frontend builds the payload with `toScrobbleTracks()` (`src/lib/scrobbleTracks.ts`),
which also drops Discogs' position-less section-header rows ("Side :/", box set album
titles) so they are never scrobbled as songs.

**Ignored scrobbles.** `track.scrobble` returns HTTP 200 with an `ignoredMessage` code when
Last.fm accepts the request but bins the play. These never reach the profile, so the worker
treats a non-zero code as a failure rather than a success:

| Code | Meaning |
|------|---------|
| `1` | Artist name filtered |
| `2` | Track name filtered |
| `3` | Timestamp too far in the past |
| `4` | Timestamp too far in the future |
| `5` | Daily scrobble limit reached |

The album response carries `summary.skipped` alongside `successful`/`failed`, and the button
reports a partial run ("Scrobbled 13 of 15") instead of a clean tick.

### Signature Generation

Scrobble requests require MD5 signature:

```python
import hashlib

def generate_signature(params, secret):
    """Generate Last.fm API signature."""
    # Sort parameters alphabetically
    sorted_params = sorted(params.items())

    # Concatenate key-value pairs
    signature_string = ''.join(
        f"{key}{value}" for key, value in sorted_params
    )

    # Append shared secret
    signature_string += secret

    # MD5 hash
    return hashlib.md5(signature_string.encode()).hexdigest()
```

## Error Handling

```python
try:
    album = service.get_album_info(artist, album)
except RateLimitError:
    time.sleep(60)
    album = service.get_album_info(artist, album)
except ServiceError as e:
    if "Album not found" in str(e):
        print("Album not in Last.fm database")
    else:
        print(f"API error: {e}")
```

## Usage Examples

### Get Album Wiki

```python
from music_collection_manager.services.lastfm import LastFmService

service = LastFmService(config)

album = service.get_album_info("Radiohead", "OK Computer")

wiki = album.get("wiki", {})
if wiki:
    print(f"Summary: {wiki.get('summary')}")
    print(f"Full: {wiki.get('content')}")
else:
    print("No wiki content available")
```

### Get Tags

```python
album = service.get_album_info(artist, album)

tags = album.get("tags", {}).get("tag", [])
tag_names = [t["name"] for t in tags]

print(f"Tags: {', '.join(tag_names)}")
```

## Data Mapping

### Last.fm → Release Model

| Last.fm Field | Model Field |
|---------------|-------------|
| mbid | lastfm_mbid |
| url | lastfm_url |
| wiki.summary | raw_data.services.lastfm.wiki_summary |
| wiki.content | raw_data.services.lastfm.wiki_content |
| tags.tag | raw_data.services.lastfm.tags |

## MusicBrainz IDs

Last.fm uses MusicBrainz IDs for precise matching:

```python
# Search with MBID if known
album = service.get_album_info(
    artist="Radiohead",
    album="OK Computer",
    mbid="a1234567-89ab-cdef-0123-456789abcdef"
)
```

## Related Documentation

- [Backend Services](../backend/services.md)
- [Frontend Hooks](../frontend/hooks.md) - useScrobble, useLastFmAuth
- [Worker API](../build-pipeline/deployment.md) - Scrobble endpoints
