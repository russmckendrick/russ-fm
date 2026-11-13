# Source assets

These are the originals the site's generated images are made from. They are
under git control so any of them can be remade. The processed files the site
serves live in `public/`.

| Folder | What | Makes | How |
| --- | --- | --- | --- |
| `release-rooms/` | Codex listening rooms, one per `/tv` room id, with no tonearm (drawn in 3D); `arms.json` holds each arm's pivot | `public/release-rooms/`, `src/config/release-rooms.json` | `scripts/process-release-rooms.py` ([docs](../docs/frontend/release-room.md)) |
| `artist-walls/` | Codex fly-poster walls, one per `/tv` room id, and `generate.sh` with every prompt | `public/artist-walls/`, `src/config/artist-walls.json` | `scripts/process-artist-walls.py` ([docs](../docs/frontend/artist-wall.md)) |
| `index-headers/` | Codex photos for the /albums, /artists, /stats, /shuffle, /genres, /search, /tv/guide and browse-page headers: a shop ledge, a poster wall, record shelving, a spotlit rail behind a shop counter, a record-fair stall (`browse`), a shop window (`facet`), a pressing plant's sample wall (`coloured`), a radio studio's record shelf (`genres`), an archive's card catalogue (`search`) and a TV shop's window (`guide`, the screens green), each with a row of green slots | `public/index-headers/`, `src/config/index-headers.json` | `scripts/process-index-headers.py` ([docs](../docs/frontend/index-headers.md)) |
| `textures/` | `poster-wear.png`, the scuffed-ink texture on every artist poster | `public/artist-walls/poster-wear.webp` | `scripts/process-artist-walls.py` |
| `tv-rooms/` | Codex `/tv` rooms, one per room id | `public/tv-rooms/` | Keyed by hand in September 2026; there is no script yet |

Each original is `<room-id>.png`, with `<room-id>.txt` beside it: Codex's
prompt log (prompt, size, date).

## Running the scripts

```bash
uv run --with numpy --with scipy --with opencv-python-headless --with pillow scripts/process-release-rooms.py [room-id ...]
uv run --with numpy --with scipy --with pillow scripts/process-artist-walls.py [room-id ...]
uv run --with numpy --with scipy --with pillow scripts/process-index-headers.py [albums|artists|stats|shuffle|browse|facet|coloured|genres|search|guide]
```

With no ids, each script does every original in its folder.

The scripts upscale the originals 4× first (`scripts/lib/upscale.py`). The
upscale uses the `codex-image` skill's local finisher: FSRCNN on the CPU,
with no paid service. The script finds the finisher under the Claude app's
skills or `~/.claude/skills`, or set `CODEX_IMAGE_FINISH` to its `finish.sh`.

The upscales are cached in `assets/.upscaled/<folder>/`, which is
git-ignored, and redone when an original is newer. The upscale is
deterministic, so a rerun reproduces the committed files byte for byte.
