# Source assets

These are the originals the site's generated images are made from. They are
under git control so any of them can be remade. The processed files the site
serves live in `public/`.

| Folder | What | Makes | How |
| --- | --- | --- | --- |
| `release-rooms/` | Codex listening rooms, one per `/tv` room id | `public/release-rooms/`, `src/config/release-rooms.json` | `scripts/process-release-rooms.py` ([docs](../docs/frontend/release-room.md)) |
| `artist-walls/` | Codex fly-poster walls, one per `/tv` room id, and `generate.sh` with every prompt | `public/artist-walls/`, `src/config/artist-walls.json` | `scripts/process-artist-walls.py` ([docs](../docs/frontend/artist-wall.md)) |
| `textures/` | `poster-wear.png`, the scuffed-ink texture on every artist poster | `public/artist-walls/poster-wear.webp` | `scripts/process-artist-walls.py` |
| `tv-rooms/` | Codex `/tv` rooms, one per room id | `public/tv-rooms/` | Keyed by hand in September 2026; there is no script yet |

Each original is `<room-id>.png`, with `<room-id>.txt` beside it: Codex's
prompt log (prompt, size, date).

## Running the scripts

```bash
uv run --with numpy --with scipy --with opencv-python-headless --with pillow scripts/process-release-rooms.py [room-id ...]
uv run --with numpy --with scipy --with pillow scripts/process-artist-walls.py [room-id ...]
```

With no ids, each script does every original in its folder.

Both scripts upscale the originals 4× first (`scripts/lib/upscale.py`). The
upscale uses the `codex-image` skill's local finisher: FSRCNN on the CPU,
with no paid service. The script finds the finisher under the Claude app's
skills or `~/.claude/skills`, or set `CODEX_IMAGE_FINISH` to its `finish.sh`.

The upscales are cached in `assets/.upscaled/<folder>/`, which is
git-ignored, and redone when an original is newer. The upscale is
deterministic, so a rerun reproduces the committed files byte for byte.
