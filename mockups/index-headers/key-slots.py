"""Key the index-page header photos: every solid-green slot becomes a hole.

Like scripts/process-artist-walls.py, but for many slots (sleeves on a ledge,
posters in a row) instead of one. The green's own shading becomes one
full-frame multiply layer, so the shop's light falls across whatever shows
through the holes.

    uv run --with numpy --with scipy --with pillow mockups/index-headers/key-slots.py <upscaled.png> <id> [out-dir]

Writes assets/<id>.webp (RGBA, holes), assets/<id>-shade.webp and the slot
boxes (fractions of the frame, left to right) into assets/slots.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).resolve().parent / 'assets'
OUT.mkdir(exist_ok=True)
src, rid = Path(sys.argv[1]), sys.argv[2]


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


img = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = img.shape
px = w / 1536  # distances below are at Codex's size
r, g, b = img[..., 0], img[..., 1], img[..., 2]
green = g - np.maximum(r, b)
labels, n = ndimage.label(ndimage.binary_closing(green > 40, iterations=round(2 * px)))
sizes = ndimage.sum(np.ones_like(green), labels, range(1, n + 1))
# A slot is any green blob at least a fifth the size of the biggest one.
keep = [i + 1 for i, s in enumerate(sizes) if s > sizes.max() / 5]
slots = np.isin(labels, keep)
near = ndimage.binary_dilation(ndimage.binary_fill_holes(slots), iterations=round(3 * px))
cut = np.where(near, ramp(green, 22, 60), 0)

lit = np.percentile(g[slots], 97)
shade = np.clip(ndimage.gaussian_filter(g, 0.6 * px) / lit, 0, 1) ** 1.5
shade = np.where(cut > 0, shade, 1.0)
Image.fromarray((shade * 255).astype(np.uint8), 'L').resize((w // 2, h // 2), Image.LANCZOS).save(OUT / f'{rid}-shade.webp', quality=86, method=6)

spill = ndimage.binary_dilation(near, iterations=round(5 * px)) & (green > 0)
img[..., 1] = np.where(spill, np.minimum(g, np.maximum(r, b)), g)
Image.fromarray(np.dstack([img, (1 - cut) * 255]).clip(0, 255).astype(np.uint8), 'RGBA').save(OUT / f'{rid}.webp', quality=84, method=6)

boxes = []
for i in keep:
    ys, xs = ndimage.find_objects((labels == i).astype(int))[0]
    boxes.append([round(v, 5) for v in (xs.start / w, ys.start / h, (xs.stop - xs.start) / w, (ys.stop - ys.start) / h)])
boxes.sort(key=lambda bx: (round(bx[1] * 4), bx[0]))  # rows, then left to right
meta_path = OUT / 'slots.json'
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
meta[rid] = {'aspect': round(w / h, 4), 'slots': boxes}
meta_path.write_text(json.dumps(meta, indent=2) + '\n')
print(rid, w, h, len(boxes), 'slots', [round(bx[2] / bx[3], 2) for bx in boxes])
