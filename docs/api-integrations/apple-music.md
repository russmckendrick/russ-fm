# Apple Music API Integration

Apple Music provides high-quality artwork and editorial content for album enrichment.

## Overview

- **Base URL**: `https://api.music.apple.com/v1`
- **Auth**: JWT token (ES256)
- **Rate Limit**: 1000 requests/hour
- **Documentation**: [developer.apple.com/musickit](https://developer.apple.com/documentation/applemusicapi)

## Configuration

```json
{
  "apple_music": {
    "key_id": "YOUR_KEY_ID",
    "team_id": "YOUR_TEAM_ID",
    "private_key_path": "/path/to/AuthKey_KEYID.p8",
    "storefront": "us",
    "rate_limit": 1000
  }
}
```

### Getting Credentials

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/)
2. Go to Certificates, Identifiers & Profiles
3. Create a MusicKit identifier
4. Generate a private key (.p8 file)
5. Note the Key ID and Team ID

### Private Key Format

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----
```

## Service Class

**File**: `scrapper/music_collection_manager/services/apple_music/apple_music_service.py`

```python
from music_collection_manager.services.apple_music import AppleMusicService

service = AppleMusicService(config)
```

## JWT Token Generation

```python
import jwt
import time

def generate_token(key_id, team_id, private_key):
    headers = {
        "alg": "ES256",
        "kid": key_id
    }

    payload = {
        "iss": team_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600  # 1 hour
    }

    return jwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers=headers
    )
```

## Methods

### authenticate()

Generate and validate JWT token.

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
        "id": "1097862062",
        "type": "albums",
        "href": "/v1/catalog/us/albums/1097862062",
        "attributes": {
            "name": "OK Computer",
            "artistName": "Radiohead",
            "releaseDate": "1997-06-16",
            "genreNames": ["Alternative", "Music", "Rock"],
            "trackCount": 12,
            "isComplete": True,
            "isSingle": False,
            "url": "https://music.apple.com/us/album/ok-computer/1097862062",
            "artwork": {
                "url": "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/.../1000x1000bb.jpg",
                "width": 1000,
                "height": 1000,
                "bgColor": "0d0f10",
                "textColor1": "f5f2ed",
                "textColor2": "c9c5c0",
                "textColor3": "c5c3bf",
                "textColor4": "a2a09c"
            },
            "editorialNotes": {
                "short": "A landmark album that redefined alternative rock.",
                "standard": "OK Computer is the third studio album by English rock band Radiohead, released on 16 June 1997..."
            },
            "contentRating": "clean",
            "copyright": "℗ 1997 XL Recordings Ltd"
        },
        "relationships": {
            "artists": {
                "data": [
                    {
                        "id": "657515",
                        "type": "artists"
                    }
                ]
            },
            "tracks": {
                "data": [...]
            }
        }
    }
]
```

---

### get_release_details(album_id)

Get detailed album information.

```python
album = service.get_release_details("1097862062")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| album_id | string | Yes | Apple Music album ID |

**Response:**
Same structure as search results, with full track list included.

---

### get_artist_details(artist_id)

Get artist information.

```python
artist = service.get_artist_details("657515")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artist_id | string | Yes | Apple Music artist ID |

**Response:**
```python
{
    "id": "657515",
    "type": "artists",
    "attributes": {
        "name": "Radiohead",
        "genreNames": ["Alternative", "Rock"],
        "url": "https://music.apple.com/us/artist/radiohead/657515",
        "artwork": {
            "url": "https://is1-ssl.mzstatic.com/image/thumb/...",
            "width": 1000,
            "height": 1000
        }
    }
}
```

---

### get_artwork_url(artwork_url, size)

Transform artwork URL for specific dimensions.

```python
url = service.get_artwork_url(
    "https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.jpg",
    2000
)
# Returns: "https://is1-ssl.mzstatic.com/image/thumb/Music/2000x2000bb.jpg"
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| artwork_url | string | Yes | Template URL with {w}x{h} |
| size | int | Yes | Desired dimension (square) |

**URL Template Patterns:**
- `{w}` - Width placeholder
- `{h}` - Height placeholder

**Common Sizes:**
- 2000x2000 - Maximum quality
- 1400x1400 - Hi-res for display
- 800x800 - Medium
- 300x300 - Thumbnail

---

## Search Optimization

### Query Normalization

```python
def normalize_search_query(artist, album):
    """Normalize search terms for better matching."""
    # Remove special characters
    artist = re.sub(r'[^\w\s]', '', artist)
    album = re.sub(r'[^\w\s]', '', album)

    # URL encode
    query = f"{artist} {album}"
    return urllib.parse.quote(query)
```

### Fallback Searches

```python
# Try exact match first
results = service.search_release(artist, album)

if not results:
    # Try without edition markers
    album_clean = re.sub(r'\(.*?\)', '', album).strip()
    results = service.search_release(artist, album_clean)

if not results:
    # Try artist only
    results = service.search_release(artist, "")
```

## Error Handling

```python
try:
    album = service.get_release_details(album_id)
except RateLimitError:
    # 1000/hour limit hit
    time.sleep(3600)  # Wait 1 hour
except AuthenticationError:
    # Token expired, regenerate
    service.authenticate()
    album = service.get_release_details(album_id)
except ServiceError as e:
    print(f"API error: {e}")
```

## Editorial Notes

Apple Music provides editorial content for many albums:

```python
album = service.get_release_details(album_id)

# Check for editorial notes
editorial = album.get("attributes", {}).get("editorialNotes", {})

# Short version (1-2 sentences)
short_note = editorial.get("short")

# Standard version (full editorial)
standard_note = editorial.get("standard")
```

**Frontend Usage:**
```typescript
// Priority order for descriptions
const description =
  album.raw_data?.services?.apple_music?.editorial_notes?.short ||
  album.raw_data?.services?.apple_music?.editorial_notes?.standard ||
  album.raw_data?.services?.lastfm?.wiki_summary ||
  album.raw_data?.services?.perplexity?.description;
```

## Artwork Colors

Apple Music provides color palette for artwork:

```python
artwork = album["attributes"]["artwork"]

colors = {
    "bgColor": artwork.get("bgColor"),      # Background color
    "textColor1": artwork.get("textColor1"), # Primary text
    "textColor2": artwork.get("textColor2"), # Secondary text
    "textColor3": artwork.get("textColor3"), # Tertiary text
    "textColor4": artwork.get("textColor4")  # Quaternary text
}
```

**Note:** Colors are hex without `#` prefix.

## Usage Examples

### Enrich Album

```python
from music_collection_manager.services.apple_music import AppleMusicService

service = AppleMusicService(config)

# Search for album
results = service.search_release("Radiohead", "OK Computer")

if results:
    best_match = results[0]
    album_id = best_match["id"]

    # Get full details
    details = service.get_release_details(album_id)

    # Extract data
    artwork_url = service.get_artwork_url(
        details["attributes"]["artwork"]["url"],
        2000
    )
    editorial = details["attributes"].get("editorialNotes", {})
    genres = details["attributes"].get("genreNames", [])

    print(f"Found: {details['attributes']['name']}")
    print(f"Artwork: {artwork_url}")
    print(f"Editorial: {editorial.get('short', 'N/A')}")
```

### Download High-Res Artwork

```python
import requests

# Get artwork URL
url = service.get_artwork_url(artwork_template, 2000)

# Download
response = requests.get(url)
with open("cover.jpg", "wb") as f:
    f.write(response.content)
```

## Data Mapping

### Apple Music → Release Model

| Apple Music Field | Model Field |
|-------------------|-------------|
| id | apple_music_id |
| attributes.name | release_name_apple_music |
| attributes.url | apple_music_url |
| attributes.artwork.url | images |
| attributes.editorialNotes | raw_data.services.apple_music |
| attributes.genreNames | genres |
| relationships.artists.data[0].id | artist.apple_music_id |

## Storefronts

Apple Music uses storefront codes:

| Code | Country |
|------|---------|
| us | United States |
| gb | United Kingdom |
| ca | Canada |
| au | Australia |
| de | Germany |
| fr | France |
| jp | Japan |

Configure in `config.json`:
```json
"apple_music": {
  "storefront": "us"
}
```

## Related Documentation

- [Backend Services](../backend/services.md)
- [Orchestration](../backend/orchestration.md)
- [Data Models](../data/models.md)
