# discogs-sub — Discogs submission drafts

`discogs-sub/` is a separate Rust binary for records that are in hand but **not yet on
Discogs**, so the scrapper can't pick them up. It builds a draft from Discogs, MusicBrainz,
Apple Music and Spotify that follows the Discogs Release Submission Guidelines (RSG). It lists
what to change after Discogs' "Copy to Draft" and marks every field you need to fill in or
check against the record.

It never submits anything. The Discogs API has no endpoint for adding releases, so you enter
the draft through the website. Once the release is live, add it to your Discogs collection
and `scrapper collection --resume` handles it like any other record.

## Usage

```bash
cd discogs-sub
cargo run -- check 199584675817                       # is this barcode already on Discogs?
cargo run -- draft "The Pineapple Thief" "Far and Wide" -i
cargo run -- draft "The Fierce & The Dead" "Regional Theatre" \
  --barcode 5031802079128 --colour "Red" --sides 5,5 --matrix "A=SPM010-A" --matrix "B=SPM010-B"
cargo run -- draft "Various" "Clowns and Jugglers = The Songs of Syd Barrett" --lps 3
```

Or install it: `cargo install --path discogs-sub`. It reads the scrapper's `config.json` the
same way `scrapper` does (`./config.json`, then `~/.config/scrapper/config.json`). Apple Music
and Spotify are skipped when their credentials are missing.

Output goes to `discogs-sub/drafts/<artist-title-format>/` (git-ignored):

| File | Contents |
|------|----------|
| `draft.md` | The draft in "Add Release" form order. It starts with the Copy to Draft edit list, followed by TODO/Verify notes on each field, reference durations, hints and source links. |
| `draft.json` | Same data in Discogs API release shape (`artists`, `labels`, `formats`, `tracklist[].type_`, `extraartists`, `companies`, `identifiers`…) plus `flags`, `hints` and `copy_to_draft_edits`. |

### Flags

| Flag | Effect |
|------|--------|
| `--format vinyl\|cd\|cassette` | Carrier of your copy (default vinyl). |
| `--barcode` | Checked against Discogs first, and drafting stops if the barcode is already there (`--force` overrides). Written as Printed (usual spacing) and Scanned rows. If the label numbers each variant from its barcode (Sony: catno = barcode minus check digit), the catalogue number is derived from it. |
| `--colour`, `--weight` | Format free text, most distinctive word first. |
| `--limited` / `--not-limited`, `--numbered` | Adjust format descriptions. |
| `--lps`, `--sides 5,4` | Vinyl layout when the closest version is a CD and nothing knows the sides. |
| `--matrix "A=…"` | Runout per side, verbatim. |
| `--notes` | Extra release-notes text. |
| `--base <release id>` | Start from a specific Discogs version. |
| `--fill-durations` | Put reference durations into the duration field (see below). |
| `-i` | Prompt for all of the above. |

## How a draft is built

1. **Barcode check.** Discogs barcode search, plus MusicBrainz. A new release can be on
   Discogs before anyone links it to the master, so this catches what master browsing misses.
2. **Siblings.** The tool searches Discogs by artist and title. If nothing matches, it tries
   the title alone, then the main title, which handles compilations and parallel titles like
   "A = B". Any master's version list is merged in, and up to 8 versions are fetched in full.
   Test pressings, promos and unofficial releases are ignored.
3. **Base version.** This is the version you would "Copy to Draft".
   - It is the richest version of the same carrier, preferring your barcode's market when
     MusicBrainz knows it.
   - If there's none on the same carrier, it is the version with the fewest media of another
     carrier, so the plain CD wins over the deluxe box.
   - Credits come from the base, or from the version with the most credits if the base has none.
4. **References.**
   - MusicBrainz provides releases, vinyl side positions, durations, writers, and
     disambiguation such as "transparent light blue vinyl, ltd edition of 500".
   - Apple Music provides durations, the ℗ line, label, release date, genres and writers.
   - Spotify provides durations, ℗/© lines, label and per-track artists.
5. **Rules applied.** RSG section numbers are cited in the draft.
   - Titles use First Letter Of Each Word capitalisation and typewriter apostrophes (§1.2.1, §1.2.4).
   - Tracks moved from CD to vinyl are renumbered A1, B1… Sides come from `--sides`, then a
     MusicBrainz vinyl release, then a split balanced by running time, which is flagged
     (§12.2.9, §1.5.6). Release-level credit `Tracks` strings are remapped to match.
   - Headings, companies and roles for another carrier are dropped: Glass Mastered At,
     5.1/Atmos mixes, BD tracks.
   - Manufacturing companies (Pressed By, Printed By…) are dropped across carriers and
     flagged within one.
   - A sibling's barcode and runouts are never copied (§5.2). Rights Society and Label Code
     are copied but flagged.
   - Sibling note lines about the other variant's colour are dropped.
   - When most tracks have their own artist, there's a warning to use "Various" (§2.3.1).
   - Submission Notes are generated (§1.3.1).

### Durations and credits

The RSG is strict about both, and the tool follows it rather than the quickest fill:

- **Durations (§12.6.4):** "The timings must be taken from the exact release – please do not
  transfer timings between releases."
  - Durations printed on a same-carrier sibling are kept, flagged *Verify*. Durations from
    another carrier are cleared.
  - Times from MusicBrainz, Apple Music, Spotify and other Discogs versions appear in a
    *Reference times* column.
  - `--fill-durations` copies them in and adds the required Submission Notes line plus
    "Track durations are not printed on the release." to the Release Notes.
- **Credits (§10.7.2, §1.5.5):** credits are not transferred between releases.
  - Sibling credits are copied (as Copy to Draft would) and flagged: delete any not printed
    on your copy.
  - Writers and copyright lines from streaming services are only hints. Adding one that
    isn't printed needs `[Uncredited]` and a source in the Submission Notes (§10.7.1).

## Code map

| File | Role |
|------|------|
| `src/main.rs` | clap CLI (`draft`, `check`), interactive prompts, output files |
| `src/sources.rs` | Discogs sibling discovery, reference albums from MusicBrainz / Apple Music / Spotify (`RefAlbum`) |
| `src/musicbrainz.rs` | MusicBrainz client (1 request per 1.1 s, descriptive User-Agent) |
| `src/draft.rs` | Draft model (Discogs API shape) and `build()` |
| `src/rules.rs` | RSG conventions as pure functions: capitalisation, durations, side splits, positions, barcode spacing, catno derivation, credit-track remapping (unit-tested) |
| `src/render.rs` | Markdown in form order |

The crate depends on `scrapper` as a path dependency for `Config`, `DiscogsService`,
`AppleMusicService`, `SpotifyService` and the HTTP helpers. It uses the anonymous Discogs
search methods described in
[Discogs integration](../api-integrations/discogs.md#anonymous-catalogue-search-discogs-sub).
A failed Discogs search is retried after a minute and then aborts, because treating
"rate-limited" as "not on Discogs" leads to duplicate submissions.
