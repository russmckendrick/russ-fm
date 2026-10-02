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
| albums[].vinyl_colours | string[]? | Present only when the pressing is coloured vinyl: the colour of each vinyl disc set as Discogs words it (`["Red"]`, `["Blue Translucent"]`, `["Yellow Transparent", "Blue Transparent"]` for two LPs), in order without repeats. Black vinyl, other formats and releases whose colour is not recorded omit it. See [Pressing detail](#pressing-detail-format_details--vinyl_colours) |
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
> **Coloured vinyl (Sep 2026):** `vinyl_colours` sits right after `format_primary` and is left out
> when empty, so the index only grows for coloured pressings. It is derived at index time from the
> release's stored Discogs formats — see [Pressing detail](#pressing-detail-format_details--vinyl_colours).
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

#### Pressing detail (`format_details`, `vinyl_colours`)

Discogs records a coloured pressing as free text on the release's format, e.g.
`{"name": "Vinyl", "qty": "1", "descriptions": ["LP", "Album", "Limited Edition"], "text": "Cloudy Clear Vinyl"}`.
The plain `formats` list keeps only the names (`["Vinyl"]`), so the colour lives in two extra keys:

| Field | Type | Description |
|-------|------|-------------|
| `format_details` | object[]? | Discogs `formats[]` normalised to `{name, qty, descriptions, text, colour}` — one entry per disc set (a set of two different colours lists each LP as its own entry). `qty` is a string (the number of discs in the set), `descriptions` is `[]` and `text` is `null` when Discogs has none. `colour` is the vinyl colour derived from `text` (null for other formats and uncoloured vinyl). Present once the release's formats are stored; absent means "not backfilled", `[]` means Discogs lists none |
| `vinyl_colours` | string[]? | The `colour` of each `Vinyl` entry, in order without repeats. Present only when there is at least one; also copied to `collection.json`. The frontend expands `format_details` by `qty` for one colour per disc, and falls back to one disc per `vinyl_colours` entry where only the index is loaded |

The derivation (`scrapper/src/formats.rs`, with its word lists in the shared
[`src/config/vinyl-colours.json`](../../src/config/vinyl-colours.json)) is a heuristic over free text. One entry's `text`
describes a single disc, so its colour parts are one colour: `Yellow, Transparent` is a
transparent yellow LP (`colour: "Yellow Transparent"`). It splits `text` on
commas, semicolons and ` - `, keeps a piece that names a colour or pattern (clear, red, blue,
translucent, marbled, splatter, swirl, liquid, …) and drops weights (`180 Gram`), a trailing "Vinyl",
and pieces about the sleeve, labels or an anniversary (`Gatefold`, `30th Anniversary Edition`,
`Blue/White Labels`). The word "Edition" is only stripped, so `Crystal Clear Edition` is the colour
`Crystal Clear` while `Definitive Edition` (no colour) gives none. Plain black is not a colour. Colours Discogs words unusually
("Flame Vinyl", "Honey") are missed, so read `format_details[].text` when the exact wording
matters.

The source is `raw_data.discogs.formats` in the SQLite row — the Discogs array stored as-is by
`process_release` and the Discogs refresh, or filled for older rows by `scrapper backfill-formats`
(see [cli-commands.md](../backend/cli-commands.md#backfill-formats)). No SQLite schema change.

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

### Artist image JSON (`artist/{slug}/{slug}-image.json`)

Placement and colour notes for the artist photo next to it, written by
`scripts/generate-artist-images.js` (macOS only, run locally and committed; see
[asset-processing.md](../build-pipeline/asset-processing.md#artist-image-notes)).
Read only by the artist page (`useArtistImageInfo` in `src/lib/artistImage.ts`,
typed as `ArtistImageInfo`). A missing file is fine: the page falls back.

```json
{
  "v": 3,
  "hash": "7ccdd9834c16036f",
  "width": 1024,
  "height": 1024,
  "faces": [[0.456, 0.285, 0.15, 0.15]],
  "people": [[0.315, 0.237, 0.367, 0.756]],
  "subject": [0, 0.08, 1, 0.997],
  "focus": [0.581, 0.296],
  "backdrop": { "colour": "#16100d", "luminance": 0.02, "even": 0.796, "tone": "dark" },
  "edges": {
    "top":    { "colour": "#060605", "luminance": 0.002, "even": 0.99, "profile": ["#050505", "…12 stops"] },
    "left":   { "colour": "#0a0b0b", "luminance": 0.003, "even": 0.991, "profile": ["…"] },
    "right":  { "colour": "#0b0908", "luminance": 0.004, "even": 0.963, "profile": ["…"] },
    "bottom": { "colour": "#34322d", "luminance": 0.086, "even": 0.559 }
  },
  "luminance": 0.031
}
```

| Field | Meaning |
|-------|---------|
| `v` | Script `VERSION`; files from an older version are redone by a `--full` run |
| `hash` | First 16 hex chars of the photo's sha1, for reference (a replaced photo needs `--only <slug>` or `--full`) |
| `width`, `height` | Photo size in px |
| `faces`, `people` | Vision boxes, `[x, y, w, h]` as fractions of the photo, origin top-left |
| `subject` | `[x0, y0, x1, y1]` fractions: people and faces combined, else the salient area; `null` when nothing is found |
| `focus` | `[x, y]` fractions: centre of the faces, else the upper part of the subject; `null` when nothing is found. Sets the phone crop |
| `backdrop` | Top quarter plus outer columns: average `colour`, relative `luminance`, `even` (1 = flat), and `tone` (`light`/`dark`), which picks the blend mode |
| `edges.*` | Each edge's average colour, luminance and evenness; `left`, `right` and `top` also carry a 12-stop `profile` along the edge, drawn as a gradient to extend the photo |
| `luminance` | Whole-photo relative luminance |

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

### tv.json

The video index behind the `/tv` page. Written by the scrapper next to
`collection.json` every time that file is generated (`scrapper/src/output/tv.rs`), as
compact JSON because it is large (about 1.4 MB, 390 KB gzipped).

```json
{
  "version": 1,
  "releases": [
    {
      "uri": "/album/becoming-x-15763685/",
      "name": "Becoming X",
      "artist": "Sneaker Pimps",
      "date_added": "2026-06-02",
      "genres": ["Electronic"],
      "styles": ["Trip Hop"],
      "videos": [
        { "id": "2eBZqmL8ehg", "title": "6 Underground", "kind": "video", "duration": 236 }
      ]
    },
    {
      "uri": "/album/now-80s-alternative-27441879/",
      "name": "Now 80s Alternative",
      "artist": "Various",
      "date_added": "2026-03-14",
      "genres": ["Electronic", "Rock"],
      "styles": ["New Wave", "Synth-pop"],
      "videos": [
        { "id": "…", "title": "A Forest", "artist": "The Cure", "kind": "other", "duration": 297 }
      ]
    }
  ]
}
```

- **Playability**: videos last found unplayable in an embed are left out before
  anything else, so a dead official video never displaces a working Discogs upload.
  That covers private, deleted, age-gated and label-blocked videos (YouTube error 150);
  oEmbed misses the last kind. `scrapper backfill-videos --check` reads each video's
  `previewPlayabilityStatus` from YouTube's public embed page and caches the verdict in
  the `video_playability` table (`id`, `playable`, `detail`, `checked_at`). Every
  backfill and `collection` run checks the new ids it adds.
- **Sources**, merged per release (filled by `scrapper backfill-videos`; see
  [CLI commands](../backend/cli-commands.md#backfill-videos)):
  1. **TheAudioDB** official music videos, stored per artist at `raw_data.theaudiodb_videos`
     as `{ id, uri, track, album }`. Each video goes to the artist's records whose title
     matches its `album`, ignoring case, punctuation, a leading "The" and bracketed asides
     like `(Deluxe)`. With no album match, it goes to the artist's earliest record (by
     master year) that has the `track` in its tracklist. Otherwise it is dropped. These
     videos are **favoured**: they come first, they are always `kind: "video"` (or `live`
     when tagged so), and they replace any Discogs upload with the same id or the same song
     title. Live Discogs uploads are kept, because they are different footage. They borrow
     the Discogs `duration` when the id matches; TheAudioDB has none of its own.
  2. **Discogs release** `raw_data.discogs.videos` (the album JSON `videos` field only
     has bare URLs).
  3. **Discogs master** `raw_data.discogs.master_videos`, the videos of every edition.
- **`uri`** is byte-identical to the release's `uri_release` in `collection.json` (both
  come from the same helper), so it doubles as the join key. `date_added` matches too.
- **`name`** / **`artist`**: the release's `release_name` and `release_artist` as in
  `collection.json`, so the worker can title a shared video link (`/tv/<channel>/<video>`)
  without loading the collection.
- **`genres`** / **`styles`**: Discogs genres and styles, with `"Music"` removed.
- **Releases** are listed only when at least one video survives, sorted by `date_added`
  descending then `uri`, so regenerating is deterministic.
- **`id`**: the 11-character YouTube id from a `v=`, `youtu.be/` or `/embed/` URL.
  Videos without one, with `embed: false`, or repeating an id already seen on the
  release are dropped.
- **Audio-only uploads are dropped**: a description starting "Provided to YouTube by"
  (auto-generated art tracks), or a title tagged `(Official Audio)`, `[Audio]`,
  `- Official Audio`, `Official Audio` or `Visualiser`/`Visualizer`.
- **Videos about a record rather than of it are dropped**, mostly from Discogs masters:
  unboxings, album reviews, "Rank #N" and "… Ranked" lists, reactions ("reacts to",
  "reaction to/video", `(Reaction)`) and "first listen". Each counts only as a tag, so
  song titles like "Chain Reaction" stay. Trailers, interviews, documentaries and TV
  adverts stay too.
- **Whole-record uploads are dropped**: titles containing "full album/concert/show/LP/EP",
  "full length", "album full", "complete album/LP/EP", "album/audio/vinyl rip", or "side
  A/B" together with "full", and anything over 30 minutes (90 minutes for `live`).
- **`kind`**: `live` when "live" is a tag or performance phrase: inside brackets
  (`(Live at …)`, `[Live]`), closing a dash/pipe segment (`- Live`), or followed by
  at/from/in/on/@/session/performance/version/studio/vol and similar. Song names such as
  "Live Forever" or "I Live To Make You Smile" don't count. Otherwise `video` for
  official video / music video / promo / `(Video)` / `MV` tags; otherwise `other`.
- **`title`** is cleaned for on-screen credits: a leading `Artist - ` / `Artist: ` /
  `Artist "…"` credit is removed when it matches a headliner, the joined credit, or a Discogs
  track artist (compilations, guest tracks); so is a trailing ` - Artist`. Bracketed
  tags mentioning official, video, audio, HD, 4K, remaster(ed), lyric(s), visualiser,
  promo, MV, clip, HQ or high quality go, as do ` - Official …` and ` | …` tails,
  leading `01. ` track numbers and wrapping quotes. Bare trailing tags without brackets
  go too: `HD`, `HQ`, `in HD`, `Full HD`, `4K`, `1080p`, `720p`, `HD Remaster`,
  `Official (Music) Video`, `Music Video`, `Promo`. Other brackets, such as
  `(Live at …)`, stay. If nothing is left, the raw title is used.
- **`artist`** (optional, between `title` and `kind`): the credit found on the title
  when it is not the release's headliner, i.e. a compilation's track artist. A matched
  Discogs track artist (by name or name variation) is shown by its canonical `name`,
  without a `(2)` suffix or trailing `*`. On a "Various" release, an unmatched `X - Song`
  title with a single dash also yields `X`, unless `X` doesn't look like an artist
  (brackets, quotes, `#`, `:`, "trailer", "OST", "vol", over 40 characters). Omitted
  whenever it would equal the headliner.
- **`duration`** (seconds) is omitted when Discogs has none or `0`.

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
  format_details?: Array<Format & { colour?: string | null }>;   // album JSON; see Pressing detail
  vinyl_colours?: string[];    // coloured vinyl only; also in collection.json
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
  text?: string | null;  // free text: colour, weight, "Gatefold", …
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
