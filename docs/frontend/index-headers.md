# Index headers (/albums, /artists)

Page 1 of `/albums` and `/artists` opens on a place, like the detail pages'
[release room](./release-room.md) and [artist poster wall](./artist-wall.md):

- **/albums:** the back wall of a record shop. The page's first eight records
  stand on a ledge above the browser bins, and the grid carries on from the
  ninth. The paging doesn't change: the shelf is part of page 1.
- **/artists:** a fly-posted brick wall. The seven most collected artists each
  have a poster, printed like the artist page's.

Below the photo is a one-row band in the flood: the `h1` with its count, then
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
- **Shade:** one full-frame multiply layer. It carries the photo's own light
  over the slots: the lamp's falloff on the sleeves, the posters' wrinkles.
- **Photo:** covers the box, the row centred across and below the header. It
  fades in once it has decoded.
- **Tint:** the page's flood in `color` blend at 16%.

On a phone the photo still covers the box, so only the middle slots show.

## Making the photos

The originals are Codex photos in `assets/index-headers/<id>.png`, with
their prompt logs beside them. Each has one row of solid chroma-key green
slots (`#00FF00`), facing the camera dead-on, with clear gaps between
them so each keys as its own blob.

```bash
uv run --with numpy --with scipy --with pillow scripts/process-index-headers.py [albums|artists]
```

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

The mockup these came from is `mockups/index-headers/`.
