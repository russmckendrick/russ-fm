# Index headers (/albums, /artists, /stats, /shuffle and the browse pages)

Page 1 of `/albums` and `/artists` opens on a place, like the detail pages'
[release room](./release-room.md) and [artist poster wall](./artist-wall.md):

- **/albums:** the back wall of a record shop. The page's first eight records
  stand on a ledge above the browser bins, and the grid carries on from the
  ninth. The paging doesn't change: the shelf is part of page 1.
- **/artists:** a fly-posted brick wall. The seven most collected artists each
  have a poster, printed like the artist page's.
- **/stats:** an oak cube unit in a record room, six records face out, each
  under a card with a collection fact drawn at random on every visit (see
  [pages.md](./pages.md#statspage-srcpagesstatspagetsx)). It always shows.
- **/shuffle:** the brass rail behind a shop counter at night, eight sleeves
  each under its own spotlight. A light chases along them and stops on the
  pick (see [pages.md](./pages.md#randompage-srcpagesrandompagetsx)). It
  draws its own band rather than the one below.
- **/browse and the facet lists (/labels, /decades, /countries):** a record-fair
  stall (`browse`), five crates on a trestle table with one sleeve propped in
  front of each. On /browse each crate is a section (Genres, Labels, Decades,
  Countries, Coloured vinyl) and links to it; on a list it is one of the five
  biggest values. Each crate takes the first sleeve of its fan that is not
  already out, so no record shows twice.
- **/label/:slug, /decade/:slug, /country/:slug, /genre/:slug:** a record
  shop's window at dusk (`facet`), five of that value's sleeves on easels,
  each linking to its record. It replaced the fan of sleeves beside the title.
- **/coloured-vinyl:** a pressing plant's sample wall (`coloured`), six round
  slots. Each holds a `Vinyl` in the pressing's own look, the sleeve on its
  label, for the first six records of the current filter.

The browse pages all draw theirs through `SleeveRoom`
(`src/components/browse/SleeveRoom.tsx`): an `IndexRoom` whose slots are
links, with the page's `FloodBand` below it as glass (`glass`: it straddles
the photo's bottom edge, see the band note below). `topShade` darkens the top of
a pale photo (`.room-top-shade`) so the see-through header reads over it; the
stall and the white wall use it. /genres keeps its own record.

The band is glass, not a block of the flood (`.glass-band
.glass-band-straddle` in `player.css`, as on the
[release room](./release-room.md#the-band)): it overlaps the photo's bottom
120px at every width, the photo blurring and running out into the page
ground behind it, with cream text and the flood only warming the glass.
`IndexRoom` takes `bottomInset` (`GLASS_STRADDLE_INSET`) so its row centres
above the band. The facet pages' taller band and the browse pages'
`FloodBand glass` straddle the same way. On /albums, /artists and /stats it
is one row: the `h1` with its count, then
the collection in numbers.
- `/albums`: Vinyl, Box sets, Added this year.
- `/artists`: Records, Most collected (linked), New this year.

The header is see-through over the photo (`useRecordsFlood(…, room)`).

The photo only shows on page 1 with no filters: no search, genre, year,
format or letter. On `/albums` the colour sort is also left out. Every
other view keeps the plain `FloodBand` title.

## How it is drawn

`IndexRoom` (`src/components/browse/IndexRoom.tsx`) takes a room id, a
`renderSlot(i, size)` callback and the flood. It reuses the artist wall's
layer, shade, photo and tint styles in `player.css`:

- **Slots:** one box per slot, left to right, under the photo's holes.
  - Each box runs 3px past the hole's edge.
  - `--u` is 1% of the box's width.
  - On `/albums` each slot is a sleeve, `.index-room-sleeve`, which links to
    its record.
  - On `/artists` each slot is an `.artist-poster` holding an `IndexPoster`
    (`src/components/browse/IndexPoster.tsx`). It shows:
    - the artist's fanart, else their own photo, cropped round the faces with `phoneCrop`
    - the name overprinted with that artist's own flood
    - the wear texture

    There are no sleeves. The name keeps clear of torn bottom and right
    corners.
- **Loaded:** an optional `onLoaded()` fires once the photo has decoded and
  starts to fade in (/shuffle starts its first chase from it).
- **Over:** an optional `renderOver(i)` draws above the photo in a box the
  same as slot `i`'s, not clipped (`.index-room-over`). /stats hangs its
  tags there, since anything inside a slot is covered by the photo outside
  the hole.
- **Shade:** one full-frame multiply layer. It carries the photo's own light
  over the slots: the lamp's falloff on the sleeves, the posters' wrinkles.
- **Photo:** covers the box, the row centred across and below the header. It
  fades in once it has decoded; until then the box holds a dim wash of the
  flood (`--room-wash`, from `tint`, shared with the artist wall).
- **Tint:** the page's flood in `color` blend at 16%.

On a phone the photo still covers the box, so only the middle slots show.

## Making the photos

The originals are Codex photos in `assets/index-headers/<id>.png`, with
their prompt logs beside them. Each has one row of solid chroma-key green
slots (`#00FF00`), facing the camera dead-on, with clear gaps between
them so each keys as its own blob.

```bash
uv run --with numpy --with scipy --with pillow scripts/process-index-headers.py [albums|artists|stats|shuffle|browse|facet|coloured]
```

A slot can be any shape: the hole follows the green, and the config holds its
bounding box (the discs on `coloured` are circles).

The script upscales 4× (`scripts/lib/upscale.py`, cached in
`assets/.upscaled/index-headers/`). It keys every green blob at least a
fifth the size of the biggest, and writes:

- `public/index-headers/<id>-{hi-res,medium}.webp` (4608 / 3072 wide, the
  slots transparent): `getIndexHeaderUrl(id, size)`
- `public/index-headers/<id>-shade.webp`, the full-frame shade (1536 wide):
  `getIndexHeaderUrl(id, 'shade')`
- `src/config/index-headers.json`: the aspect and each slot's box in
  percent, read through `src/lib/indexHeaders.ts`

The number of slots comes from the photo. A new photo with more or fewer
slots needs no code change.

The mockups these came from are `mockups/index-headers/` and `mockups/stats/`.
