"""Key the /albums, /artists, /stats and /shuffle headers (src/components/browse/IndexRoom.tsx).

Each photo (a Codex original in assets/index-headers/<id>.png) has a row of
solid chroma-key green slots: sleeves on a record-shop ledge for albums,
posters on a fly-posting wall for artists. Every slot becomes a hole, as in
scripts/process-artist-walls.py but for many slots, and the green's own
shading becomes one full-frame multiply layer, so the shop's light falls
across whatever shows through the holes.

    uv run --with numpy --with scipy --with pillow \
        scripts/process-index-headers.py [id ...]

With no ids, every photo in assets/index-headers/. The originals are upscaled
4x first (scripts/lib/upscale.py, cached in assets/.upscaled/index-headers/).

Writes public/index-headers/<id>-{hi-res,medium}.webp (4608 / 3072 wide) and
<id>-shade.webp (1536 wide), and the slot boxes, left to right, into
src/config/index-headers.json (other ids' entries are kept).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
from upscale import originals, upscaled  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'index-headers'
CONFIG = ROOT / 'src' / 'config' / 'index-headers.json'


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


OUT.mkdir(parents=True, exist_ok=True)
ids = originals('index-headers', sys.argv[1:])
src_dir = upscaled('index-headers', ids)
meta = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
for rid in ids:
    img = np.asarray(Image.open(src_dir / f'{rid}.png').convert('RGB')).astype(np.float32)
    h, w, _ = img.shape
    px = w / 1536  # the upscale factor; distances below are at Codex's size
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    green = g - np.maximum(r, b)
    labels, n = ndimage.label(ndimage.binary_closing(green > 40, iterations=round(2 * px)))
    sizes = ndimage.sum(np.ones_like(green), labels, range(1, n + 1))
    # A slot is any green blob at least a fifth the size of the biggest one.
    keep = [i + 1 for i, s in enumerate(sizes) if s > sizes.max() / 5]
    slots = np.isin(labels, keep)
    near = ndimage.binary_dilation(ndimage.binary_fill_holes(slots), iterations=round(3 * px))
    cut = np.where(near, ramp(green, 22, 60), 0)

    # Shade: the green channel against the slots' brightest paper, with the
    # artist walls' 1.5 curve and a touch of blur for the upscale's noise.
    lit = np.percentile(g[slots], 97)
    shade = np.clip(ndimage.gaussian_filter(g, 0.6 * px) / lit, 0, 1) ** 1.5
    shade = np.where(cut > 0, shade, 1.0)
    Image.fromarray((shade * 255).astype(np.uint8), 'L').resize((1536, round(1536 * h / w)), Image.LANCZOS).save(OUT / f'{rid}-shade.webp', quality=86, method=6)

    # Despill the key's soft edge and the green thrown onto curls and the wall beside.
    spill = ndimage.binary_dilation(near, iterations=round(5 * px)) & (green > 0)
    img[..., 1] = np.where(spill, np.minimum(g, np.maximum(r, b)), g)
    rgba = Image.fromarray(np.dstack([img, (1 - cut) * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    for size, width in (('hi-res', 4608), ('medium', 3072)):
        rgba.resize((width, round(width * h / w)), Image.LANCZOS).save(OUT / f'{rid}-{size}.webp', quality=84, method=6)

    pct = lambda v, d: round(v / d * 100, 3)
    boxes = []
    for i in keep:
        ys, xs = ndimage.find_objects((labels == i).astype(int))[0]
        boxes.append({'left': pct(xs.start, w), 'top': pct(ys.start, h), 'width': pct(xs.stop - xs.start, w), 'height': pct(ys.stop - ys.start, h)})
    boxes.sort(key=lambda bx: (round(bx['top'] / 25), bx['left']))  # rows, then left to right
    meta[rid] = {'aspect': round(w / h, 4), 'slots': boxes}
    print(rid, w, h, f'{len(boxes)} slots')
CONFIG.write_text(json.dumps(dict(sorted(meta.items())), indent=2) + '\n')
