# Other API Integrations

This document covers Wikipedia, Wikidata, MusicBrainz, TheAudioDB, and lightweight frontend analytics integrations.

## Wikipedia

### Overview

- **REST API**: `https://en.wikipedia.org/api/rest_v1`
- **Wiki API**: `https://en.wikipedia.org/w/api.php`
- **Auth**: None required
- **Rate Limit**: No official limit (be respectful)

### Configuration

```json
{
  "wikipedia": {
    "language": "en",
    "user_agent": "MusicCollectionManager/1.0 (https://russ.fm)"
  }
}
```

### Matching

The scrapper never looks an artist's article up by name. The article title comes from Wikidata,
keyed by the artist's Discogs ID (see [Wikidata and MusicBrainz](#wikidata-and-musicbrainz)), and
the summary is fetched for that exact title. An artist Wikidata doesn't know gets no Wikipedia
biography, and a summary whose `type` is `disambiguation` is ignored.

### Service Class

**Source**: `scrapper/src/services/wikipedia` (Rust)

The Wikipedia service exposes the methods below. The response shapes documented here
describe the data each call returns.

### Methods

#### search_pages(query, limit=30)

Search Wikipedia pages.

```python
results = service.search_pages("Radiohead band", limit=10)
```

**Response:**
```python
[
    {
        "pageid": 26340,
        "title": "Radiohead",
        "snippet": "...English rock band formed in Abingdon..."
    }
]
```

---

#### get_page_info(page_title, include_extract=True)

Get page information with summary.

```python
page = service.get_page_info("Radiohead", include_extract=True)
```

**Response:**
```python
{
    "pageid": 26340,
    "title": "Radiohead",
    "extract": "Radiohead are an English rock band formed in Abingdon, Oxfordshire, in 1985. The band consists of Thom Yorke (vocals, guitar, piano), brothers Jonny Greenwood (lead guitar, keyboards) and Colin Greenwood (bass), Ed O'Brien (guitar, backing vocals), and Philip Selway (drums)...",
    "thumbnail": {
        "source": "https://upload.wikimedia.org/wikipedia/commons/thumb/.../220px-...",
        "width": 220,
        "height": 165
    },
    "originalimage": {
        "source": "https://upload.wikimedia.org/wikipedia/commons/...",
        "width": 2000,
        "height": 1500
    },
    "fullurl": "https://en.wikipedia.org/wiki/Radiohead",
    "description": "English rock band"
}
```

---

#### get_artist_summary(artist_name)

Get artist biography summary.

```python
summary = service.get_artist_summary("Radiohead")
```

**Response:**
```python
{
    "title": "Radiohead",
    "extract": "Radiohead are an English rock band...",
    "image": "https://upload.wikimedia.org/...",
    "url": "https://en.wikipedia.org/wiki/Radiohead"
}
```

---

#### search_release(artist, album)

Search for album pages.

```python
results = service.search_release("Radiohead", "OK Computer")
```

**Search Patterns:**
1. `"OK Computer" album Radiohead`
2. `OK Computer Radiohead album`
3. `OK Computer Radiohead`

---

### Usage

During artist processing the orchestrator calls `get_artist_summary(artist_name)` to
fetch a biography and image. If no page is found, the artist is enriched from the other
sources instead (see Data Priority in the [API Integrations overview](./README.md)).

### Data Mapping

| Wikipedia Field | Model Field |
|-----------------|-------------|
| fullurl | wikipedia_url |
| extract | biography |
| thumbnail.source | images |
| originalimage.source | raw_data.services.wikipedia.image |

---

## Wikidata and MusicBrainz

Used to find an artist's other pages by ID instead of by name (`scrapper/src/ops/identity.rs`).
Name lookups go wrong for shared and common names: a TheAudioDB search for "Stevie Wonder"
returned The Supremes, and the Wikipedia page titled "Santana" is a disambiguation page.

- **Wikidata** (`scrapper/src/services/wikidata.rs`): one SPARQL query to
  `https://query.wikidata.org/sparql` maps up to 200 Discogs artist IDs (property P1953) to the
  item, its MusicBrainz artist IDs (P434) and its article on the configured Wikipedia. No auth;
  the client sends a descriptive User-Agent and runs 30 queries a minute at most. A Discogs ID
  claimed by two items is ignored. In a sample of the collection about 86% of artists resolve.
- **MusicBrainz** (`scrapper/src/services/musicbrainz.rs`): `GET /ws/2/url?resource=https://www.discogs.com/artist/{id}&inc=artist-rels`
  gives the MusicBrainz artist linked to a Discogs page. Used when Wikidata has no MBID for the
  artist or several (aliases, unmerged duplicates). No auth; one request a second (the client
  runs 50 a minute).

The result is stored on the artist row as `raw_data.identity`
(`{wikidata_id, musicbrainz_id, wikipedia_title, resolved_at}`; any of the first three may be
null). It is then used for:

| Service | Lookup |
|---------|--------|
| Wikipedia | Summary of `wikipedia_title`; nothing when there is none |
| TheAudioDB | `artist-mb.php?i={mbid}`, then a name search that only accepts a hit whose name matches (`&`/"and", a leading "The", accents and punctuation ignored) and whose MBID, when both are known, agrees |
| Last.fm | `artist.getInfo` by `mbid`, then by name when Last.fm doesn't know the MBID |
| `lastfm_mbid` | The resolved MBID, when there is one |

`scrapper backfill-identities` resolves stored artists and repairs what earlier name lookups got
wrong (see [cli-commands.md](../backend/cli-commands.md#backfill-identities)).

---

## TheAudioDB

### Overview

- **Base URL**: `https://theaudiodb.com/api/v1/json/`
- **Auth**: Token in the URL path. The public test key `2` is used when none is set.
- **Rate Limit**: 30 requests a minute with the test keys (`2`, `123`) and 100 a minute
  with a premium key. The client's limiter picks the rate from the token.
- **Documentation**: [theaudiodb.com/api_guide.php](https://www.theaudiodb.com/api_guide.php)

### Configuration

```json
{
  "TheAudioDB": {
    "api_token": "2",
    "base_url": "https://theaudiodb.com/api/v1/json/"
  }
}
```

**Note:** Token `"2"` is the free tier.

### Service Class

**Source**: `scrapper/src/services/theaudiodb` (Rust)

The TheAudioDB service exposes the methods below. The response shapes documented here
describe the data each call returns.

### Methods

#### authenticate()

Test API connection.

```python
is_valid = service.authenticate()
```

---

#### search_artist(artist_name)

Search for artists.

```python
results = service.search_artist("Radiohead")
```

**Response:**
```python
[
    {
        "idArtist": "111239",
        "strArtist": "Radiohead",
        "strArtistStripped": "Radiohead",
        "strArtistAlternate": "",
        "strLabel": "XL Recordings",
        "idLabel": "45116",
        "intFormedYear": "1985",
        "intBornYear": "",
        "intDiedYear": "",
        "strDisbanded": "",
        "strStyle": "Rock/Pop",
        "strGenre": "Alternative Rock",
        "strMood": "Melancholic",
        "strWebsite": "radiohead.com",
        "strFacebook": "radiohead",
        "strTwitter": "radiohead",
        "strBiographyEN": "Radiohead are an English rock band from Abingdon, Oxfordshire...",
        "strBiographyDE": "...",
        "strBiographyFR": "...",
        "strGender": "Male",
        "intMembers": "5",
        "strCountry": "Oxford, England",
        "strCountryCode": "GB",
        "strArtistThumb": "https://www.theaudiodb.com/images/media/artist/thumb/...",
        "strArtistLogo": "https://www.theaudiodb.com/images/media/artist/logo/...",
        "strArtistClearart": "...",
        "strArtistWideThumb": "...",
        "strArtistFanart": "...",
        "strArtistFanart2": "...",
        "strArtistFanart3": "...",
        "strArtistBanner": "...",
        "strMusicBrainzID": "a74b1b7f-71a5-4011-9441-d0b5e4122711",
        "strLastFMChart": "...",
        "intCharted": "2",
        "strLocked": "unlocked"
    }
]
```

---

#### get_music_videos(artist_id)

`mvid.php?i=<artist id>`: an artist's music videos (`{"mvids": null}` when there are
none). Each entry carries `idAlbum`, `idTrack`, `strTrack`, `strMusicVid` (a YouTube
URL) and `strDescriptionEN`.

`backfill-videos --theaudiodb`, `process_artist`, and saving a new release (its headline
artists, via `ops::videos::refresh_release_artist_videos`) store these on the artist as
`raw_data.theaudiodb_videos`, as `{ id, uri, track, album }`, with `album` resolved from
`album.php` (fetched only when there are videos). `tv.json` matches them to records and
favours them over Discogs uploads; see [tv.json](../data/schemas.md#tvjson).
`TheAudioDbService::artist_id_of` reads the id from a stored `raw_data.theaudiodb`
block: `idArtist` on API payloads, `id` on the legacy mapped shape.

---

#### get_artist_by_id(artist_id)

Get artist by TheAudioDB ID.

```python
artist = service.get_artist_by_id("111239")
```

---

#### get_artist_by_musicbrainz_id(mb_id)

Get artist by MusicBrainz ID.

```python
artist = service.get_artist_by_musicbrainz_id("a74b1b7f-71a5-4011-9441-d0b5e4122711")
```

---

#### get_album_by_id(album_id)

Get album details.

```python
album = service.get_album_by_id("2110923")
```

**Response:**
```python
{
    "idAlbum": "2110923",
    "idArtist": "111239",
    "idLabel": "45116",
    "strAlbum": "OK Computer",
    "strAlbumStripped": "OK Computer",
    "strArtist": "Radiohead",
    "strArtistStripped": "Radiohead",
    "intYearReleased": "1997",
    "strStyle": "Art Rock",
    "strGenre": "Alternative Rock",
    "strLabel": "Parlophone",
    "strReleaseFormat": "Album",
    "intSales": "10000000",
    "strAlbumThumb": "https://www.theaudiodb.com/images/media/album/thumb/...",
    "strAlbumThumbHQ": "...",
    "strAlbumThumbBack": "...",
    "strAlbumCDart": "...",
    "strAlbumSpine": "...",
    "strAlbum3DCase": "...",
    "strAlbum3DFlat": "...",
    "strAlbum3DFace": "...",
    "strAlbum3DThumb": "...",
    "strDescriptionEN": "OK Computer is the third studio album...",
    "intLoved": "15",
    "intScore": "9.2",
    "intScoreVotes": "150",
    "strReview": "...",
    "strMood": "Anxious",
    "strTheme": "Technology, Alienation",
    "strSpeed": "Medium",
    "strLocation": "Studio",
    "strMusicBrainzID": "...",
    "strMusicBrainzArtistID": "...",
    "strAllMusicID": "...",
    "strBBCReviewID": "...",
    "strRateYourMusicID": "...",
    "strDiscogsID": "...",
    "strWikidataID": "...",
    "strWikipediaID": "...",
    "strGeniusID": "...",
    "strLyricWikiID": "...",
    "strMusicMozID": "...",
    "strItunesID": "...",
    "strAmazonID": "...",
    "strLocked": "unlocked"
}
```

---

### Artist Images

TheAudioDB provides multiple image types:

| Field | Description |
|-------|-------------|
| strArtistThumb | Square thumbnail |
| strArtistLogo | Transparent logo |
| strArtistClearart | Transparent cutout |
| strArtistWideThumb | Wide banner |
| strArtistFanart | Fan art 1 |
| strArtistFanart2 | Fan art 2 |
| strArtistFanart3 | Fan art 3 |
| strArtistBanner | Banner image |

---

### Usage

When `--theaudiodb` is enabled, artist processing searches TheAudioDB by name (or
MusicBrainz ID) and uses the first match for biography (`strBiographyEN`), country,
genre, and high-quality artwork (`strArtistThumb` and the fan-art fields above).

### CLI Integration

```bash
# Enable TheAudioDB in artist processing
scrapper artist "Radiohead" --theaudiodb --save

# Batch processing with TheAudioDB
scrapper artist-batch --theaudiodb --save
```

### Data Mapping

| TheAudioDB Field | Model Field |
|------------------|-------------|
| idArtist | raw_data.services.theaudiodb.id |
| strBiographyEN | biography |
| strArtistThumb | images |
| strCountry | country |
| intFormedYear | formed_date |
| strMusicBrainzID | lastfm_mbid |

---

## Plausible Analytics

### Overview

- **Package**: `@plausible-analytics/tracker`
- **Endpoint**: `https://plausible.io/api/event`
- **Domain**: `russ.fm`
- **Auth**: None in the frontend
- **Runtime**: Production browser builds only

### Frontend Initialization

Plausible is initialized once from `src/lib/analytics.ts` and imported by
`src/main.tsx` before the React app renders. The NPM tracker is bundled with
the Vite application instead of loading Plausible's remote script tag in
`index.html`.

```typescript
init({
  domain: 'russ.fm',
  autoCapturePageviews: true,
  outboundLinks: true,
  fileDownloads: true,
  formSubmissions: true,
  bindToWindow: true,
  logging: false,
})
```

`autoCapturePageviews` tracks SPA navigation through `BrowserRouter`.
Outbound links, file downloads, and form submissions are enabled to match the
site-specific Plausible script settings.
`bindToWindow` keeps `window.plausible` available for Plausible's installation
verification tool and future custom event calls.

---

## Error Handling

Both services use graceful degradation. Wikipedia is tried first for an artist
biography; if it fails or returns nothing, TheAudioDB's `strBiographyEN` is used as a
fallback. A failure in either service is logged and processing continues with whatever
data is available.

---

## Related Documentation

- [Backend Services](../backend/services.md)
- [Artist Orchestration](../backend/orchestration.md)
- [Data Models](../data/models.md)
