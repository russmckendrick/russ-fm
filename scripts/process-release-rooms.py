"""Key the album page's listening rooms (src/lib/releaseRooms.ts).

Each room photo (a Codex original in assets/release-rooms/<room-id>.png, see
docs/frontend/release-room.md) has two chroma-green
areas: the square board on the record stand and the record on the turntable.
Both are cut out: the real sleeve shows through the board, and a spinning CSS
record in the pressing's colour shows through the platter, under the tonearm.

    uv run --with numpy --with scipy --with opencv-python-headless --with pillow \
        scripts/process-release-rooms.py [room-id ...]

With no ids, every room in assets/release-rooms/. The originals are upscaled 4x
first (scripts/lib/upscale.py, cached in assets/.upscaled/release-rooms/).

Writes public/release-rooms/<id>-{hi-res,medium}.webp (4608 / 3072 wide) and the stand/record
geometry into src/config/release-rooms.json (other rooms' entries are kept).

A room whose original has no tonearm (just the arm's base pillar) is listed in
assets/release-rooms/arms.json with the pillar top's centre, in px at Codex's
1536 size, measured by eye. The script copies it into the room's geometry as
`arm`, and the site draws the arm there in 3D (src/lib/tonearm.ts).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
from upscale import originals, upscaled  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'release-rooms'
CONFIG = ROOT / 'src' / 'config' / 'release-rooms.json'
ARMS = ROOT / 'assets' / 'release-rooms' / 'arms.json'


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


ids = originals('release-rooms', sys.argv[1:])
src_dir = upscaled('release-rooms', ids)
meta = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
arms = json.loads(ARMS.read_text()) if ARMS.exists() else {}
OUT.mkdir(parents=True, exist_ok=True)
for rid in ids:
    img = np.asarray(Image.open(src_dir / f'{rid}.png').convert('RGB')).astype(np.float32)
    h, w, _ = img.shape
    px = w / 1536  # the upscale factor; pixel distances below are at Codex's 1536 size
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    green = g - np.maximum(r, b)

    labels, n = ndimage.label(ndimage.binary_closing(green > 45, iterations=round(3 * px)))
    sizes = ndimage.sum(np.ones_like(green), labels, range(1, n + 1))
    two = np.argsort(sizes)[::-1][:2] + 1
    boxes = [ndimage.find_objects((labels == i).astype(int))[0] for i in two]
    # The board is the squarer of the two; the record is a wide ellipse.
    aspect = [(s[1].stop - s[1].start) / (s[0].stop - s[0].start) for s in boxes]
    sleeve_i, disc_i = (0, 1) if abs(aspect[0] - 1) < abs(aspect[1] - 1) else (1, 0)
    # The tonearm (or the stand's feet) can cut a key into pieces; take every
    # green pixel in and just around each one's box, not only the biggest piece.
    keyed = green > 45

    def gather(i, pad):
        y, x = boxes[i]
        py, px_ = round((y.stop - y.start) * pad), round((x.stop - x.start) * pad)
        area = np.zeros((h, w), bool)
        area[max(0, y.start - py):y.stop + py, max(0, x.start - px_):x.stop + px_] = True
        return (labels == two[i]) | (keyed & area)

    board = gather(sleeve_i, 0.03)
    ring = gather(disc_i, 0.15) & ~board
    sb = ndimage.find_objects(board.astype(int))[0]
    ds = ndimage.find_objects(ring.astype(int))[0]

    # The record's outline: an ellipse fitted to the convex hull of its green
    # (the hull fills in the tonearm's notch), grown a little past the key's edge
    # and drawn anti-aliased. Colour alone gives a ragged edge, and a key strong
    # enough for the shadowed rim also eats the green the record reflects onto
    # the cartridge.
    hull = cv2.convexHull(np.argwhere(ring)[:, ::-1].astype(np.int32))
    (ex, ey), (ew, eh), ang = cv2.fitEllipse(hull)
    grow = 2 * px
    face_u8 = np.zeros((h, w), np.uint8)
    cv2.ellipse(face_u8, ((ex, ey), (ew + 2 * grow, eh + 2 * grow), ang), 255, -1, cv2.LINE_AA)
    face = face_u8.astype(np.float32) / 255
    fy_, fx_ = ndimage.find_objects((face_u8 > 127).astype(int))[0]
    cy, cx = (fy_.start + fy_.stop) / 2, (fx_.start + fx_.stop) / 2
    ry, rx = (fy_.stop - fy_.start) / 2, (fx_.stop - fx_.start) / 2

    # Its centre label: the biggest pale, non-green patch near the middle. Its
    # centre is the spindle, which the record turns round.
    yy, xx = np.ogrid[0:h, 0:w]
    pale = (np.hypot((xx - cx) / rx, (yy - cy) / ry) < 0.6) & (green < 12) & (img.min(axis=2) > 140)
    parts, k = ndimage.label(pale)
    biggest = np.argmax(ndimage.sum(pale, parts, range(1, k + 1))) + 1
    patch = parts == biggest
    hy, hx = ndimage.find_objects(patch.astype(int))[0]
    sy, sx = (hy.start + hy.stop) / 2, (hx.start + hx.stop) / 2
    hole = (hx.stop - hx.start) / 2 / rx * 1.04
    # Radius (in units of the record's half-width) that reaches every part of
    # the outline from the spindle, so the spun record always fills the cut-out.
    edge = cv2.ellipse2Poly((round(ex), round(ey)), (round(ew / 2 + grow), round(eh / 2 + grow)), round(ang), 0, 360, 2)
    cover = float(np.max(np.hypot((edge[:, 0] - sx) / rx, (edge[:, 1] - sy) / ry))) * 1.02

    alpha = np.ones((h, w), np.float32)
    board_zone = ndimage.binary_dilation(board, iterations=round(6 * px))
    alpha[board_zone] = 1 - ramp(green[board_zone], 8, 40)
    feather = ndimage.gaussian_filter(alpha, 0.9 * px)
    alpha[board_zone] = np.minimum(alpha[board_zone], feather[board_zone])
    # Inside the outline, only what is clearly not record stays: the tonearm and
    # cartridge (a little green spill on them is still far from the record's green).
    inside = face > 0
    keep = 1 - ramp(green, 22, 55)
    alpha[inside] = 1 - face[inside] * (1 - keep[inside])
    alpha[ndimage.binary_dilation(patch, iterations=round(4 * px))] = 0
    zones = ndimage.binary_dilation(board_zone | inside, iterations=round(3 * px))

    # Self-check: chroma green the cut-outs missed would show on the page.
    left = int(((green > 60) & (alpha > 0.5)).sum() / (px * px))
    if left > 40:
        print(f'WARNING {rid}: about {left} px (at 1536 wide) of key green still visible', file=sys.stderr)

    # Despill near the keys: pull green down to the larger of red/blue.
    out = img
    spill = ndimage.binary_dilation(zones, iterations=round(4 * px)) & (g > np.maximum(r, b))
    out[..., 1][spill] = np.maximum(r, b)[spill]

    rgba = Image.fromarray(np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
    # Served at 4608 and 3072 wide: a 6144 photo decodes to ~100 MB, and the
    # home page holds a few rooms at once.
    rgba.resize((4608, 3072), Image.LANCZOS).save(OUT / f'{rid}-hi-res.webp', quality=84, method=6)
    rgba.resize((3072, 2048), Image.LANCZOS).save(OUT / f'{rid}-medium.webp', quality=84, method=6)

    assert abs(w / h - 1.5) < 0.01, f'{rid}: room photos must be 3:2'
    meta[rid] = {
        'sleeve': {'left': round(sb[1].start / w * 100, 3), 'top': round(sb[0].start / h * 100, 3),
                   'width': round((sb[1].stop - sb[1].start) / w * 100, 3), 'height': round((sb[0].stop - sb[0].start) / h * 100, 3)},
        # The record: spindle position, half-axes (% of photo width / height),
        # how far the spun disc must reach, and the label's radius (both in half-widths).
        # fx, fy: the centre of the record's outline (in perspective it sits off the spindle).
        'record': {'x': round(sx / w * 100, 3), 'y': round(sy / h * 100, 3),
                   'fx': round(cx / w * 100, 3), 'fy': round(cy / h * 100, 3),
                   'rx': round(rx / w * 100, 3), 'ry': round(ry / h * 100, 3),
                   'cover': round(cover, 3), 'hole': round(hole, 3)},
    }
    if rid in arms:
        # The 3D arm's pivot: the top of its base pillar, % of the photo.
        ax, ay = arms[rid]['pivot']
        meta[rid]['arm'] = {'x': round(ax / 1536 * 100, 3), 'y': round(ay / 1024 * 100, 3)}
    print(rid, meta[rid])

CONFIG.write_text(json.dumps(dict(sorted(meta.items())), indent=2) + '\n')
