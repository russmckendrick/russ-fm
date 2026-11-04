# Artist poster wall (artist hero)

The artist page opens on the artist's fly-poster, pasted on a wall. The
photo is printed on the paper with the name overprinted and the newest
sleeves along the bottom. The poster carries the wall's own creases and
light, and the wall is tinted with the page's flood. Below it is a slim
band in the flood with facts and links only. It follows the album page's
[release room](./release-room.md).

## How it is drawn

`PosterWall` (`src/components/artist/PosterWall.tsx`) takes a wall, the
photo, the name and up to four sleeves. The wall photo has its poster cut
out (transparent) and sits over two layers:

- **The poster** (`.artist-poster`, `--u` is 1% of its width):
  - **Photo:** the artist's photo, printed onto the paper. It is
    `mix-blend-mode: multiply` on `#e9dfcb`, so its colour stays and its
    whites warm, and it is aged a little (`sepia`, less saturation).
  - **Name:** the page's `h1`, a `FitTitle` up to 16% of the poster's
    width. It is overprinted in cream, a little off register over the
    flood (`text-shadow`). A long name balances over a few lines
    (ORCHESTRAL / MANOEUVRES / IN THE DARK).
  - **Sleeves:** the four newest records, one per title, printed small
    with paper borders. Each links to its record.
  - **Wear:** a scuffed-ink texture (`poster-wear.webp`) is screened over
    the poster at 50%. It lifts the print back towards the paper, with
    fold lines and rain streaks.
- **The shade** (`.artist-wall-shade`): the wall's light and creases on the
  poster, read off the green in the photo and multiplied over it. Leaf
  shadows, the lamp's falloff, wrinkles and glue bubbles come from the
  photo itself.

Over the photo, a `mix-blend-mode: color` layer tints the whole wall,
poster included, with the flood (16%), so the poster sits in the room's
light. The page sets `room: true` in `usePageFlood`, so the header is
see-through over the wall. The wall is pulled up under it
(`-mt-16 md:-mt-[84px]`).

The photo covers the box (×1.06). The poster is centred across, and a
little above the middle of what the header leaves. The box is
`clamp(420px, 125vw, 940px)` tall on phones, where the poster is nearly
full width, and `clamp(460px, 78svh, 940px)` from `md`.

The wall fades in once two things are ready: the wall photo has decoded,
and the poster's photo has loaded or failed. So the poster never shows as
blank paper.

### The poster's photo

The photo is the artist's TheAudioDB fanart (`fanart` in the
`-image.json`), else their own photo (the image chosen in the scrapper
when there is one). `phoneCrop()` (`src/lib/artistImage.ts`) crops it
round the faces into the poster's shape. If the fanart fails to load,
their own photo takes its place.

### The band

The band is one row in the flood (`newestFlood`: the newest addition's
sleeve, skipping monochrome ones). On the left is a `<dl>`:

- From and Formed (when the artist JSON has them)
- Records, then Soundtracks or Box sets when there are any
- Released (the span of original years)
- Last.fm listeners
- Genres (three, linking to `/genre/:slug`)

On the right are 44px round icon buttons:

- the artist's TV channel (when there are videos)
- the services, with their brand icons (`serviceIconFor`)
- the Thread

On phones the facts wrap into a grid and Genres spans its width. The
poster carries the name, so the band doesn't repeat it.

## Which wall

`artistWallFor(records)` (`src/lib/artistWalls.ts`) picks the `/tv` room
most of the artist's records play in: `tvRoomFor(genre_names, styles)`, as
the album page's listening room. Ties go to the newest record's room, and
an artist with none gets the living room (`shelves`). The 15 walls:

| Room | Wall |
| --- | --- |
| `shelves` | a record shop's red-brick side wall, afternoon sun, a bike |
| `basement` | a venue stairwell, painted brick, a caged bulb |
| `bedroom` | a teenager's flyer wall, fairy lights, a lava lamp |
| `prog-art` | an art-school corridor, cork strip, strip light |
| `electronic` | a concrete underpass, cyan and magenta strip lights |
| `metal` | a steel roller shutter under a floodlight |
| `post-punk` | an estate's concrete wall in drizzle |
| `punk` | a squat venue wall of xeroxed flyers, a red bulb |
| `hip-hop` | a New York construction hoarding, golden hour |
| `soul-funk` | a 70s club entrance, wood panels, globe lights |
| `folk` | a barn noticeboard, overcast |
| `pop` | a pastel pink wall in bright sun |
| `soundtracks` | an art deco cinema wall, marquee bulbs |
| `jazz-blues` | a rainy side street outside a jazz club |
| `live` | the alley by a venue's side door, crowd barriers |

## Assets

- `public/artist-walls/<room>-{hi-res,medium}.webp`: 4608 and 3072 wide,
  4:3, the poster cut out. `getArtistWallUrl(room, size)`.
- `public/artist-walls/<room>-shade.webp`: the poster's shade, 1200 wide.
  `getArtistWallUrl(room, 'shade')`.
- `public/artist-walls/poster-wear.webp`: the scuffed-ink texture.
- `src/config/artist-walls.json`: each wall's aspect and its poster's box
  (% of the photo). It is written by the script below.

### Making or redoing a wall

1. Generate the photo with Codex: `sh assets/artist-walls/generate.sh <room-id>`.
   The script holds every wall's prompt and saves the photo as
   `assets/artist-walls/<room-id>.png`, with its prompt log as `.txt`. It
   skips walls that already have an original, so move one aside to redo it.
   - The prompt asks for one landscape (4:3) poster, square to camera,
     about 46% of the width.
   - The poster is printed solid chroma-key green (`#00FF00`). It must
     carry the scene's light and wear only as shading on the green,
     including one torn corner and a small rip.
   - Nothing else may be green.
   - Codex returns these at 1448×1086. See
     [assets/README.md](../../assets/README.md).
2. Key it:

   ```bash
   uv run --with numpy --with scipy --with pillow \
     scripts/process-artist-walls.py <room-id>
   ```

   With no id it does every wall. The script upscales the original 4× first
   (the `codex-image` finisher, cached in `assets/.upscaled/artist-walls/`).

   - **Cut:** only the green, soft on how green each pixel is. Torn
     corners and curls keep the wall over the poster.
   - **Shade:** the green channel against the poster's brightest paper,
     on a 1.5 curve.
   - **Despill:** clears any green within a few pixels of the poster, so
     no fringe shows on its edges and curls.
   - The script warns when less than 70% of the poster's box keyed.
   - Every run also rewrites `poster-wear.webp` from
     `assets/textures/poster-wear.png`: a black printed poster with the ink
     scuffed and rubbed to the paper.
3. A new room id must exist in `TV_ROOMS` (`src/lib/tv.ts`).

The mockup the design came from is `mockups/artist-room/`. Open it at
`/mockups/artist-room/?artist=<slug>&room=<id>` on the dev server.
