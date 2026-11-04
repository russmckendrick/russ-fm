"""Key the fly-poster walls (walls/generate.sh): one green poster per wall.

    uv run --with numpy --with scipy --with pillow mockups/artist-room/key-walls.py <dir of upscaled <room-id>.png> [room-id ...]

Writes, per wall, into assets/walls/:
  <id>.webp        the photo with the poster cut out. Only the green goes, so torn
                   corners and rips keep the wall over the artist's poster.
  <id>-shade.webp  the poster's own light and wear (wrinkles, glue bubbles, the
                   lamp's falloff), read off the green as greys and multiplied over the poster.
and walls.json: the poster's box as [x, y, w, h] fractions, plus the photo's aspect.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
OUT = HERE / 'assets' / 'walls'
OUT.mkdir(parents=True, exist_ok=True)
META = OUT / 'walls.json'
meta = json.loads(META.read_text()) if META.exists() else {}


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


src_dir = Path(sys.argv[1])
ids = sys.argv[2:] or sorted(p.stem for p in src_dir.glob('*.png'))
for rid in ids:
    img = np.asarray(Image.open(src_dir / f'{rid}.png').convert('RGB')).astype(np.float32)
    h, w, _ = img.shape
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    green = g - np.maximum(r, b)
    labels, n = ndimage.label(ndimage.binary_closing(green > 40, iterations=4))
    sizes = ndimage.sum(np.ones_like(green), labels, range(1, n + 1))
    poster = labels == np.argmax(sizes) + 1
    ys, xs = ndimage.find_objects(poster.astype(int))[0]
    # Holes inside the poster (a glue bubble's highlight, a stain) still belong to it.
    area = ndimage.binary_fill_holes(poster)
    near = ndimage.binary_dilation(area, iterations=6)

    # Cut: soft on how green a pixel is, only on and around the poster.
    cut = np.where(near, ramp(green, 22, 60), 0)
    alpha = 1 - cut
    if (cut[ys, xs] > 0.5).mean() < 0.7:
        print(f'warning: {rid}: less than 70% of the poster box keyed')

    # Shade: the green channel against the poster's brightest paper, so the lamp's
    # falloff and the wrinkles survive; a touch of blur hides the photo's noise.
    lit = np.percentile(g[poster], 97)
    # A 1.5 curve deepens the creases and shadows a little past the photo's own.
    shade = np.clip(ndimage.gaussian_filter(g, 1.2) / lit, 0, 1) ** 1.5
    shade = np.where(cut > 0, shade, 1.0)
    sh = (shade[ys, xs] * 255).astype(np.uint8)
    Image.fromarray(sh, 'L').save(OUT / f'{rid}-shade.webp', quality=86)

    # Despill any green left near the poster: the key's soft edge, and the green
    # the poster throws onto its own torn curls and the wall just beside it.
    spill = ndimage.binary_dilation(near, iterations=10) & (green > 0)
    img[..., 1] = np.where(spill, np.minimum(g, np.maximum(r, b)), g)
    rgba = np.dstack([img, alpha * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(OUT / f'{rid}.webp', quality=86)

    box = [round(xs.start / w, 4), round(ys.start / h, 4), round((xs.stop - xs.start) / w, 4), round((ys.stop - ys.start) / h, 4)]
    meta[rid] = {'aspect': round(w / h, 4), 'poster': box}
    print(rid, w, h, box, f'lit={lit:.0f}', f'shade p5={np.percentile(sh, 5):.0f}')
META.write_text(json.dumps(meta, indent=1))
