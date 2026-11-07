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

### The tonearm

The photos have no tonearm, only its base pillar. `RoomArm`
(`src/components/album/RoomArm.tsx`) draws the arm in 3D over the photo with
three.js (`src/lib/tonearm.ts`, loaded lazily on first use):

- **Camera.** An orthographic camera tilted down by `asin(ry / rx)`: that is
  the angle at which the record's circle becomes the photo's ellipse, so the
  arm lines up with no per-room tuning beyond the pivot. World units are the
  photo's pixels at 1536 × 1024, with the origin at the spindle on the
  record's surface.
- **Model.** Built in code: an S-shaped brushed tube, a gimbal, a knurled
  counterweight, an anodised headshell, a cartridge with its lead wires, and
  an arm rest. It is built to prog-art's proportions and scaled to each room
  by the pivot-to-spindle distance. The stylus sits on the record's surface.
  The same scene draws the centre spindle: a chrome pin with a rounded tip
  standing out of the label, sized to the record (`R * 0.024` across,
  `R * 0.085` tall), whose shadow falls on the label.
- **Light.** A neutral studio environment for the reflections, so the metal
  reads as steel, with warm key and rim lights for the room. Shadow-catcher
  planes on the record and the plinth darken the photo under the arm.
- **Motion.** The arm is either down on the lead-in or parked on its rest.
  Between the two it lifts on the cue, swings, and lowers with a soft settle
  (`LIFT_MS`, `SWING_MS`, `LOWER_MS`). Once down, it rides a slight warp in
  the record: a faint rise and fall (`WARP_LIFT`, about 1–2 px at the stylus)
  once a turn, timed to the record's spin (`TURN_MS`, or `TURN_FAST_MS` at 45),
  redrawn at 30 fps. Otherwise it draws only while it moves. Reduced motion
  jumps straight to the pose with no warp; without WebGL there is no arm.

`ReleaseRoom` drives it. The arm cues in once its room shows. When the next
record is in the same room, the record waits for the arm to park, swaps, and
the arm cues back in (if the arm never reports back, the record swaps after
3.5 s anyway). A record in another room crossfades the whole room as before,
and the new room's arm cues in.

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
- `src/config/release-rooms.json`: each room's board, record and arm-pivot
  geometry, written by the script below.
- `assets/release-rooms/arms.json`: the arm pivots, by hand.

### Making or redoing a room

1. Generate the photo with Codex (`codex-image`, 1536×1024). The prompt
   needs, square to camera, a record stand holding a square board filled
   with flat chroma-key green (`#00FF00`), left of centre, about 30% of the
   width; and a turntable right of centre, seen from slightly above, with a
   flat green record and a small white centre label. The turntable has **no
   tonearm**: only its short round base pillar, behind and right of the
   platter. Nothing else green. (The current originals were made by giving
   Codex the earlier photo, which had an arm, and asking it to take the arm
   off; their prompt logs say so.) Generate into a folder of its own (a running
   `codex-image.sh` collects every new image in its output folder), then save
   it as `assets/release-rooms/<room-id>.png` with its prompt log as
   `<room-id>.txt`. All the originals and their prompts are there (see
   [assets/README.md](../../assets/README.md)).
2. Key it:

   ```bash
   uv run --with numpy --with scipy --with opencv-python-headless --with pillow \
     scripts/process-release-rooms.py <room-id>
   ```

   With no id it does every room. The script upscales the original 4× first
   (the `codex-image` finisher, cached in `assets/.upscaled/release-rooms/`).

   The record's outline is an ellipse fitted to its green, drawn
   anti-aliased. The script warns when key green is still visible.

   Before keying, add the room to `assets/release-rooms/arms.json`: the
   centre of the arm pillar's top, in px at 1536 × 1024, measured by eye.
   The script copies it into the room's geometry as `arm`. A room without
   it has no 3D arm.
3. A new room id must exist in `TV_ROOMS` (`src/lib/tv.ts`).

`scripts/make-vinyl-textures.py` redraws the record textures (seeded, so a
rerun gives the same record).
