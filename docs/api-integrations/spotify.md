# Spotify API Integration

Spotify provides streaming links, popularity data, and album metadata.

## Overview

- **API Base URL**: `https://api.spotify.com/v1`
- **Auth URL**: `https://accounts.spotify.com/api/token`
- **Auth**: OAuth 2.0 Client Credentials
- **Rate Limit**: 100 requests/minute
- **Documentation**: [developer.spotify.com/documentation](https://developer.spotify.com/documentation/web-api)

## Configuration

```json
{
  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "market": "US",
    "rate_limit": 100
  }
}
```

### Getting Credentials

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Copy Client ID and Client Secret

## Service Class

**File**: `scrapper/music_collection_manager/services/spotify/spotify_service.py`

```python
from music_collection_manager.services.spotify import SpotifyService

service = SpotifyService(config)
```

## OAuth Flow

### Client Credentials

```python
import base64
import requests

def get_token(client_id, client_secret):
    auth = base64.b64encode(
        f"{client_id}:{client_secret}".encode()
    ).decode()

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={"Authorization": f"Basic {auth}"},
        data={"grant_type": "client_credentials"}
    )

    data = response.json()
    return {
        "access_token": data["access_token"],
        "expires_in": data["expires_in"]  # Usually 3600 seconds
    }
```

### Token Refresh

```python
def ensure_token_valid(self):
    """Refresh token if expired."""
    if time.time() >= self.token_expires - 60:  # 1 min buffer
        self.authenticate()
```

## Methods

### authenticate()

Perform OAuth and get access token.

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
        "id": "6dVIqQ8qmQ5GBnJ9shOYGE",
        "name": "OK Computer",
        "album_type": "album",
        "total_tracks": 12,
        "release_date": "1997-06-16",
        "release_date_precision": "day",
        "artists": [
            {
                "id": "4Z8W4fKeB5YxbusRsdQVPb",
                "name": "Radiohead",
                "external_urls": {
                    "spotify": "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"
                }
            }
        ],
        "images": [
            {
                "url": "https://i.scdn.co/image/...",
                "width": 640,
                "height": 640
            },
            {
                "url": "https://i.scdn.co/image/...",
                "width": 300,
                "height": 300
            },
            {
                "url": "https://i.scdn.co/image/...",
                "width": 64,
                "height": 64
            }
        ],
        "external_urls": {
            "spotify": "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE"
        },
        "uri": "spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE"
    }
]
```

---

### get_release_details(album_id)

Get detailed album information.

```python
album = service.get_release_details("6dVIqQ8qmQ5GBnJ9shOYGE")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| album_id | string | Yes | Spotify album ID |

**Response:**
```python
{
    "id": "6dVIqQ8qmQ5GBnJ9shOYGE",
    "name": "OK Computer",
    "album_type": "album",
    "total_tracks": 12,
    "release_date": "1997-06-16",
    "popularity": 78,
    "label": "XL Recordings",
    "copyrights": [
        {
            "text": "© 1997 XL Recordings Ltd",
            "type": "C"
        },
        {
            "text": "℗ 1997 XL Recordings Ltd",
            "type": "P"
        }
    ],
    "external_ids": {
        "upc": "634904012427"
    },
    "genres": [],  # Usually empty for albums
    "artists": [...],
    "images": [...],
    "tracks": {
        "items": [
            {
                "id": "2rtGaCAeYtmcIvuZsvgTf6",
                "name": "Airbag",
                "track_number": 1,
                "duration_ms": 284066,
                "explicit": False,
                "artists": [...]
            }
        ],
        "total": 12
    },
    "external_urls": {
        "spotify": "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE"
    }
}
```

---

### get_artist_details(artist_id)

Get artist information.

```python
artist = service.get_artist_details("4Z8W4fKeB5YxbusRsdQVPb")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist_id | string | Yes | Spotify artist ID |

**Response:**
```python
{
    "id": "4Z8W4fKeB5YxbusRsdQVPb",
    "name": "Radiohead",
    "genres": [
        "alternative rock",
        "art rock",
        "melancholia",
        "oxford indie",
        "permanent wave",
        "rock"
    ],
    "popularity": 75,
    "followers": {
        "total": 8000000
    },
    "images": [
        {
            "url": "https://i.scdn.co/image/...",
            "width": 640,
            "height": 640
        }
    ],
    "external_urls": {
        "spotify": "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"
    }
}
```

---

### get_artist_albums(artist_id)

List artist's albums.

```python
albums = service.get_artist_albums("4Z8W4fKeB5YxbusRsdQVPb")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist_id | string | Yes | Spotify artist ID |

**Response:**
```python
[
    {
        "id": "6dVIqQ8qmQ5GBnJ9shOYGE",
        "name": "OK Computer",
        "album_type": "album",
        "release_date": "1997-06-16",
        "total_tracks": 12,
        "images": [...]
    },
    {
        "id": "19RUuDQ8LWXJ9tuMCwdC5p",
        "name": "Kid A",
        "album_type": "album",
        "release_date": "2000-10-02",
        "total_tracks": 10,
        "images": [...]
    }
    // ... more albums
]
```

---

## Popularity Score

Spotify provides a popularity score (0-100):

```python
album = service.get_release_details(album_id)
popularity = album.get("popularity", 0)

# Interpret score
if popularity >= 80:
    print("Very popular")
elif popularity >= 50:
    print("Moderately popular")
else:
    print("Less popular")
```

## Market Parameter

Some endpoints require a market code:

```python
# Albums available in specific market
response = requests.get(
    f"https://api.spotify.com/v1/albums/{album_id}",
    headers={"Authorization": f"Bearer {token}"},
    params={"market": "US"}
)
```

**Common Markets:**
| Code | Country |
|------|---------|
| US | United States |
| GB | United Kingdom |
| CA | Canada |
| AU | Australia |
| DE | Germany |
| JP | Japan |

## Error Handling

```python
try:
    album = service.get_release_details(album_id)
except RateLimitError:
    # 429 Too Many Requests
    time.sleep(30)
    album = service.get_release_details(album_id)
except AuthenticationError:
    # Token expired
    service.authenticate()
    album = service.get_release_details(album_id)
except ServiceError as e:
    if "404" in str(e):
        print("Album not found")
    else:
        print(f"API error: {e}")
```

## Usage Examples

### Enrich Album

```python
from music_collection_manager.services.spotify import SpotifyService

service = SpotifyService(config)

# Search for album
results = service.search_release("Radiohead", "OK Computer")

if results:
    best = results[0]

    # Get URL for frontend
    spotify_url = best["external_urls"]["spotify"]
    spotify_id = best["id"]

    # Get full details for popularity
    details = service.get_release_details(spotify_id)
    popularity = details.get("popularity", 0)

    print(f"Spotify URL: {spotify_url}")
    print(f"Popularity: {popularity}/100")
```

### Get Artist Genres

```python
# Spotify provides genres on artists, not albums
artist = service.get_artist_details(artist_id)
genres = artist.get("genres", [])

print(f"Genres: {', '.join(genres)}")
```

### Build Embed URL

```python
def build_embed_url(spotify_url):
    """Convert Spotify URL to embed URL."""
    # https://open.spotify.com/album/123
    # -> https://open.spotify.com/embed/album/123
    return spotify_url.replace(
        "open.spotify.com/album/",
        "open.spotify.com/embed/album/"
    )
```

**Frontend Usage:**
```typescript
const embedUrl = `https://open.spotify.com/embed/album/${albumId}?utm_source=generator`;

<iframe
  src={embedUrl}
  width="100%"
  height="352"
  frameBorder="0"
  allow="encrypted-media"
/>
```

## Data Mapping

### Spotify → Release Model

| Spotify Field | Model Field |
|---------------|-------------|
| id | spotify_id |
| name | release_name_spotify |
| external_urls.spotify | spotify_url |
| images | images |
| popularity | raw_data.services.spotify.popularity |
| tracks.items | tracklist |
| artists[0].id | artist.spotify_id |

## API Limits

| Endpoint | Rate Limit |
|----------|------------|
| Search | 100/min |
| Albums | 100/min |
| Artists | 100/min |
| Tracks | 100/min |

## Related Documentation

- [Backend Services](../backend/services.md)
- [Frontend Utilities](../frontend/utilities.md) - musicServiceUtils.ts
- [Data Models](../data/models.md)
