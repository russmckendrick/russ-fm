# Release room (album and home heroes)

The album page and the home page open on a listening room: a photo of a
room with the record's sleeve on a stand and the record playing on a
turntable, the room tinted with the sleeve's flood, and a slim band in the
flood below. Box sets keep the cover hero (`CoverHero` + `BoxHeroArt`).

## How it is drawn

`ReleaseRoom` (`src/components/album/ReleaseRoom.tsx`) takes a list of
records and the active one. Each room photo has the stand's board and the
record on the turntable cut out (transparent), and sits over:

- **the sleeve**, an `<img>` in the board's cut-out, so the stand's lip stays
  in front of it;
- **the record**, the site's `Vinyl` (`room-vinyl`) round the photo's spindle,
  squashed with `scaleY` into the turntable's perspective and sized past the
  cut-out (`cover`), so the tonearm and the platter's rim stay on top. Only
  the pressing's pattern and the label turn (6s a turn; 45 while scrobbling).
  The grooves and the light on the record are round, so they are still layers
  (`::before` / `::after`), pinned to the photo's record outline rather than
  the spindle (in perspective the two are apart). The grooves are white on
  black vinyl and `mix-blend-mode: overlay` on a coloured pressing, so a
  colour isn't washed out.

A masked `mix-blend-mode: color` layer tints the room with the flood, as on
`/tv`. The page sets `room: true` in `usePageFlood`, and the header is
see-through over the room until it scrolls (`overRoom` in `Navigation.tsx`);
the room is pulled up under it with `-mt-16 md:-mt-[84px]`.

The layout is a port of `TvRoom`'s: the photo covers the box, the sleeve
is sized against the box, and the stand and turntable are framed together
when both fit (just the stand on phones).

### Several records (home)

The home hero passes its latest additions. Records in the same room
crossfade in place; a record in another room crossfades the whole room.
A room only shows once its photo has loaded and decoded, and the previous
record stays up until then, so switching never fades through black. Only
the rooms in play are mounted (on show, the active and next records', and
the one fading out), because a decoded photo is tens of MB.

### The band

One row in the flood: a details line, the title in `.room-title-box` (a
fixed-height, one-line box the title scales into with `FitTitle fitHeight`
and `whitespace-nowrap`, so the band keeps its height between records), the
artist line, and actions on the right. The album band's actions are
`AlbumScrobbleButton` and icon buttons with the services' brand icons
(`serviceIconFor`) and the Thread. While scrobbling, the genres give way
to the track being scrobbled. The home band's actions are the 01–08
progress bars with previous / next.

## Which room

`releaseRoomFor()` (`src/lib/releaseRooms.ts`) picks the record's `/tv`
room: `tvRoomFor(genre_names, styles)` in `src/lib/tv.ts`, the room of its
first genre channel (the living room, `shelves`, when it has none). So a
record plays in the same room on its album page, the home page and TV.

## Assets

- `public/release-rooms/<room>-{hi-res,medium}.webp`: 4608 and 3072 wide,
  3:2, one per `/tv` room id. `getReleaseRoomUrl(room, size)`.
- `public/release-rooms/vinyl-{grooves,sheen}.webp`: the record textures.
- `src/config/release-rooms.json`: each room's board and record geometry,
  written by the script below.

### Making or redoing a room

1. Generate the photo with Codex (`codex-image`, 1536×1024). The prompt
   needs, square to camera, a record stand holding a square board filled
   with flat chroma-key green (`#00FF00`), left of centre, about 30% of the
   width; and a turntable right of centre, seen from slightly above, with a
   flat green record, a small white centre label and the tonearm on the
   record. Nothing else green. The originals and their prompts are in
   `mockups/release/rooms/genre/`.
2. Upscale it 4× locally (the `codex-image` finisher,
   `finish.sh <room>.png --upscale-only --scale 4`) into a folder of
   `<room-id>.png` files. Keep that folder outside the folder Codex is
   writing to: a running `codex-image.sh` collects every new image there.
3. Key it:

   ```bash
   uv run --with numpy --with scipy --with opencv-python-headless --with pillow \
     scripts/process-release-rooms.py mockups/release/rooms/genre-4x <room-id>
   ```

   The record's outline is an ellipse fitted to its green, drawn
   anti-aliased; inside it only what is clearly not record (the tonearm and
   cartridge) stays. The script warns when key green is still visible.
4. A new room id must exist in `TV_ROOMS` (`src/lib/tv.ts`).

`scripts/make-vinyl-textures.py` redraws the record textures (seeded, so a
rerun gives the same record).
