# Discogs API Integration

Discogs is the primary data source for russ.fm, providing collection management and release metadata.

## Overview

- **Base URL**: `https://api.discogs.com`
- **Auth**: Personal access token
- **Rate Limit**: 60 requests/minute
- **Documentation**: [discogs.com/developers](https://www.discogs.com/developers)

## Configuration

```json
{
  "discogs": {
    "access_token": "YOUR_PERSONAL_ACCESS_TOKEN",
    "username": "YOUR_DISCOGS_USERNAME",
    "rate_limit": 60
  }
}
```

### Getting Credentials

1. Go to [discogs.com/settings/developers](https://www.discogs.com/settings/developers)
2. Click "Generate new token"
3. Copy the token to your config

## Service Class

**File**: `scrapper/music_collection_manager/services/discogs/discogs_service.py`

```python
from music_collection_manager.services.discogs import DiscogsService

service = DiscogsService(config)
```

## Methods

### authenticate()

Test API authentication.

```python
is_valid = service.authenticate()
# Returns: bool
```

**Example Response**: `True` if token is valid

---

### search_artist(artist_name, limit=25)

Search for artists by name.

```python
results = service.search_artist("Radiohead", limit=10)
```

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| artist_name | string | Yes | - | Artist name to search |
| limit | int | No | 25 | Maximum results |

**Response:**
```python
[
    {
        "id": 3840,
        "name": "Radiohead",
        "resource_url": "https://api.discogs.com/artists/3840",
        "uri": "https://www.discogs.com/artist/3840-Radiohead",
        "thumb": "https://img.discogs.com/..."
    }
]
```

---

### search_release(artist, album)

Search for releases.

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
        "id": 123456,
        "title": "OK Computer",
        "year": "1997",
        "format": ["CD", "Album"],
        "label": ["Parlophone"],
        "country": "UK",
        "genre": ["Electronic", "Rock"],
        "style": ["Alternative Rock", "Art Rock"],
        "thumb": "https://img.discogs.com/...",
        "cover_image": "https://img.discogs.com/...",
        "resource_url": "https://api.discogs.com/releases/123456"
    }
]
```

---

### get_release(discogs_id)

Get detailed release information.

```python
release = service.get_release(123456)
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| discogs_id | int/string | Yes | Discogs release ID |

**Response:**
```python
{
    "id": 123456,
    "title": "OK Computer",
    "artists": [
        {
            "id": 3840,
            "name": "Radiohead",
            "resource_url": "https://api.discogs.com/artists/3840"
        }
    ],
    "artists_sort": "Radiohead",
    "year": 1997,
    "released": "1997-06-16",
    "country": "UK",
    "genres": ["Electronic", "Rock"],
    "styles": ["Alternative Rock", "Art Rock"],
    "labels": [
        {
            "id": 233,
            "name": "Parlophone",
            "catno": "7243 8 55229 2 5"
        }
    ],
    "formats": [
        {
            "name": "CD",
            "qty": "1",
            "descriptions": ["Album"]
        }
    ],
    "tracklist": [
        {
            "position": "1",
            "title": "Airbag",
            "duration": "4:44"
        },
        {
            "position": "2",
            "title": "Paranoid Android",
            "duration": "6:23"
        }
        // ... more tracks
    ],
    "images": [
        {
            "type": "primary",
            "uri": "https://img.discogs.com/...",
            "resource_url": "https://api.discogs.com/images/...",
            "width": 600,
            "height": 600
        }
    ],
    "uri": "https://www.discogs.com/release/123456",
    "master_id": 21491,
    "master_url": "https://api.discogs.com/masters/21491",
    "data_quality": "Correct",
    "community": {
        "have": 45000,
        "want": 8000,
        "rating": {
            "count": 3500,
            "average": 4.6
        }
    },
    "identifiers": [
        {
            "type": "Barcode",
            "value": "724385522925"
        }
    ],
    "videos": [
        {
            "uri": "https://www.youtube.com/watch?v=...",
            "title": "Radiohead - Paranoid Android"
        }
    ]
}
```

---

### get_collection_items(username)

Fetch user's collection.

```python
items = service.get_collection_items("username")
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | Yes | Discogs username |

**Response:**
```python
[
    {
        "id": 12345,
        "instance_id": 67890,
        "folder_id": 0,
        "date_added": "2024-01-10T15:00:00-08:00",
        "rating": 0,
        "basic_information": {
            "id": 123456,
            "title": "OK Computer",
            "year": 1997,
            "artists": [
                {
                    "id": 3840,
                    "name": "Radiohead"
                }
            ],
            "labels": [...],
            "formats": [...],
            "genres": [...],
            "styles": [...],
            "thumb": "https://img.discogs.com/...",
            "cover_image": "https://img.discogs.com/..."
        }
    }
]
```

**Pagination:**
The method handles pagination automatically, fetching all pages.

---

### get_collection_release_instances(discogs_id)

Get instances of a release in collection.

```python
instances = service.get_collection_release_instances(123456)
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| discogs_id | int/string | Yes | Discogs release ID |

**Response:**
```python
[
    {
        "instance_id": 67890,
        "folder_id": 0,
        "date_added": "2024-01-10T15:00:00-08:00",
        "notes": [
            {
                "field_id": 1,
                "value": "Near Mint"
            }
        ]
    }
]
```

---

## Rate Limiting

Discogs limits to 60 requests per minute:

```python
# Built-in rate limiter
service.rate_limiter.wait()  # Called automatically before each request
```

### Headers

Include user agent for higher limits:
```python
headers = {
    "User-Agent": "RussFM/1.0 +https://russ.fm",
    "Authorization": f"Discogs token={access_token}"
}
```

## Error Handling

```python
from music_collection_manager.services.base import (
    ServiceError,
    RateLimitError,
    AuthenticationError
)

try:
    release = service.get_release(123456)
except RateLimitError:
    # Wait 60 seconds and retry
    time.sleep(60)
    release = service.get_release(123456)
except AuthenticationError:
    print("Invalid token")
except ServiceError as e:
    print(f"API error: {e}")
```

## Usage Examples

### Process Collection

```python
from music_collection_manager.services.discogs import DiscogsService

service = DiscogsService(config)

# Get all collection items
items = service.get_collection_items("username")

for item in items:
    release_id = item["basic_information"]["id"]
    release = service.get_release(release_id)

    print(f"Processing: {release['title']}")
    # ... enrichment logic
```

### Search and Match

```python
# Search for a release
results = service.search_release("Björk", "Homogenic")

# Filter by year
matches = [r for r in results if r.get("year") == "1997"]

if matches:
    best = matches[0]
    release = service.get_release(best["id"])
```

### Get High-Quality Images

```python
release = service.get_release(123456)

# Get primary image (highest quality)
images = release.get("images", [])
primary = next((img for img in images if img["type"] == "primary"), None)

if primary:
    image_url = primary["uri"]
    # Download image
```

## Data Mapping

### Discogs → Release Model

| Discogs Field | Model Field |
|---------------|-------------|
| id | discogs_id |
| title | title |
| year | year |
| released | released |
| country | country |
| genres | genres |
| styles | styles |
| labels[].name | labels |
| formats[].name | formats |
| tracklist | tracklist |
| images | images |
| artists | artists |
| uri | discogs_url |

## Related Documentation

- [Backend Services](../backend/services.md)
- [Orchestration](../backend/orchestration.md)
- [Data Models](../data/models.md)
