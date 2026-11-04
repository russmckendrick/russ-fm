"""Key the artist page's fly-poster walls (src/lib/artistWalls.ts).

Each wall photo (a Codex original in assets/artist-walls/<room-id>.png, made by
assets/artist-walls/generate.sh) has one landscape poster printed solid chroma-key green that carries the wall's
light and wear as shading: wrinkles, glue bubbles, creases, the lamp's falloff,
torn corners. Only the green is cut out, so the torn corners keep the wall over
the artist's poster, and the green's own shading becomes a multiply layer.

    uv run --with numpy --with scipy --with pillow \
        scripts/process-artist-walls.py [room-id ...]

With no ids, every wall in assets/artist-walls/. The originals are upscaled 4x
first (scripts/lib/upscale.py, cached in assets/.upscaled/artist-walls/).

Writes public/artist-walls/<id>-{hi-res,medium}.webp (4608 / 3072 wide),
<id>-shade.webp (the poster's box, 1200 wide), and the poster's box into
src/config/artist-walls.json (other walls' entries are kept). It also writes
public/artist-walls/poster-wear.webp, the scuffed-ink texture screened over
every poster, from assets/textures/poster-wear.png.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
from upscale import ASSETS, originals, upscaled  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'artist-walls'
CONFIG = ROOT / 'src' / 'config' / 'artist-walls.json'


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


OUT.mkdir(parents=True, exist_ok=True)
Image.open(ASSETS / 'textures' / 'poster-wear.png').convert('L').save(OUT / 'poster-wear.webp', quality=82, method=6)
print('poster-wear.webp')

ids = originals('artist-walls', sys.argv[1:])
src_dir = upscaled('artist-walls', ids)
meta = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
for rid in ids:
    img = np.asarray(Image.open(src_dir / f'{rid}.png').convert('RGB')).astype(np.float32)
    h, w, _ = img.shape
    px = w / 1448  # the upscale factor; distances below are at Codex's size
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    green = g - np.maximum(r, b)
    labels, n = ndimage.label(ndimage.binary_closing(green > 40, iterations=round(2 * px)))
    sizes = ndimage.sum(np.ones_like(green), labels, range(1, n + 1))
    poster = labels == np.argmax(sizes) + 1
    ys, xs = ndimage.find_objects(poster.astype(int))[0]
    # Holes inside the poster (a glue bubble's highlight, a stain) still belong to it.
    near = ndimage.binary_dilation(ndimage.binary_fill_holes(poster), iterations=round(3 * px))

    # Cut: soft on how green a pixel is, only on and around the poster.
    cut = np.where(near, ramp(green, 22, 60), 0)
    if (cut[ys, xs] > 0.5).mean() < 0.7:
        print(f'warning: {rid}: less than 70% of the poster box keyed')

    # Shade: the green channel against the poster's brightest paper, so the
    # lamp's falloff and the wrinkles survive; a 1.5 curve deepens them a
    # little past the photo's own, and a touch of blur hides the upscale's noise.
    lit = np.percentile(g[poster], 97)
    shade = np.clip(ndimage.gaussian_filter(g, 0.6 * px) / lit, 0, 1) ** 1.5
    shade = np.where(cut > 0, shade, 1.0)
    sh = Image.fromarray((shade[ys, xs] * 255).astype(np.uint8), 'L')
    sh.resize((1200, round(1200 * sh.height / sh.width)), Image.LANCZOS).save(OUT / f'{rid}-shade.webp', quality=86, method=6)

    # Despill any green left near the poster: the key's soft edge, and the green
    # the poster throws onto its own torn curls and the wall just beside it.
    spill = ndimage.binary_dilation(near, iterations=round(5 * px)) & (green > 0)
    img[..., 1] = np.where(spill, np.minimum(g, np.maximum(r, b)), g)
    rgba = Image.fromarray(np.dstack([img, (1 - cut) * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    for size, width in (('hi-res', 4608), ('medium', 3072)):
        rgba.resize((width, round(width * h / w)), Image.LANCZOS).save(OUT / f'{rid}-{size}.webp', quality=84, method=6)

    pct = lambda v, d: round(v / d * 100, 3)
    meta[rid] = {
        'aspect': round(w / h, 4),
        'poster': {'left': pct(xs.start, w), 'top': pct(ys.start, h), 'width': pct(xs.stop - xs.start, w), 'height': pct(ys.stop - ys.start, h)},
    }
    print(rid, w, h, meta[rid]['poster'])
CONFIG.write_text(json.dumps(dict(sorted(meta.items())), indent=2) + '\n')
