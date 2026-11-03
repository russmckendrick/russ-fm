"""Draw the record textures for the album page's listening room (.room-vinyl).

    uv run --with numpy --with pillow scripts/make-vinyl-textures.py

Two square white-on-transparent layers, the record's edge at the image's edge,
both round so they sit still while the label and pattern turn:

- public/release-rooms/vinyl-grooves.webp: the grooves themselves, a slightly
  different sheen per track, smooth gaps between tracks and the run-out.
- public/release-rooms/vinyl-sheen.webp: the room's light caught in the grooves,
  two streaks either side of the spindle, broken up by the grooves and dark at
  the gaps (smooth vinyl doesn't scatter it).

Seeded, so a rerun draws the same record.
"""
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 2048
OUT = Path(__file__).resolve().parent.parent / 'public' / 'release-rooms'
rng = np.random.default_rng(33)

# Radii as a share of the record's: label to 0.335, run-out to 0.39, music to 0.965.
LABEL, RUNOUT, MUSIC_END = 0.335, 0.39, 0.965

# One value per sliver of radius (~0.3px at 2048), so every ring is one groove's width.
n = SIZE * 3
radius = np.linspace(0, 1, n)
fine = rng.random(n)
fine = np.convolve(fine, np.ones(3) / 3, mode='same')  # grooves blur a little into each other
fine = (fine - fine.min()) / (fine.max() - fine.min())

# Tracks: 9-ish bands of their own groove density, with smooth gaps between.
bounds = np.sort(rng.uniform(RUNOUT + 0.03, MUSIC_END - 0.03, 8))
track_shade = np.zeros(n)
edges = np.concatenate([[RUNOUT], bounds, [MUSIC_END]])
for a, b in zip(edges[:-1], edges[1:]):
    track_shade[(radius >= a) & (radius < b)] = rng.uniform(-1, 1)
gap = np.zeros(n)
for b in bounds:
    gap = np.maximum(gap, np.clip(1 - np.abs(radius - b) / 0.0035, 0, 1))

music = (radius >= RUNOUT) & (radius < MUSIC_END)
runout = (radius >= LABEL) & (radius < RUNOUT)
lead_in = (radius >= MUSIC_END) & (radius < 0.995)

# Groove layer alpha per radius.
groove = np.zeros(n)
groove[music] = 0.04 + 0.02 * track_shade[music] + 0.045 * fine[music]
groove[lead_in] = 0.03 + 0.04 * fine[lead_in]
groove[runout] = 0.012 + 0.012 * fine[runout]
groove *= 1 - 0.9 * gap

# Sheen strength per radius: grooves scatter the light, gaps and the run-out barely.
glint = np.zeros(n)
glint[music] = (0.3 + 0.7 * fine[music]) * (1 + 0.15 * track_shade[music])
glint[lead_in] = 0.5 + 0.5 * fine[lead_in]
glint[runout] = 0.12
glint *= 1 - 0.85 * gap

yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
c = (SIZE - 1) / 2
r = np.hypot(xx - c, yy - c) / c
theta = np.arctan2(yy - c, xx - c)
idx = np.clip((r * (n - 1)).astype(int), 0, n - 1)
on_record = (r >= LABEL) & (r < 0.995)


def streak(at, width):
    d = np.angle(np.exp(1j * (theta - at)))
    return np.exp(-((d / width) ** 2))


light = 0.85 * streak(np.radians(-38), 0.32) + 0.6 * streak(np.radians(142), 0.28)
sheen = np.where(on_record, light * glint[idx] * 0.55 + 0.03 * glint[idx], 0)
# The record's edge catches a thin line of light all round.
sheen = np.maximum(sheen, np.where((r >= 0.982) & (r < 0.995), 0.09 + 0.12 * light, 0))
grooves = np.where(on_record, groove[idx], 0)


def save(alpha, name):
    rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(OUT / name, quality=90, method=6)
    print(name, f'{(OUT / name).stat().st_size // 1024} KB')


save(grooves, 'vinyl-grooves.webp')
save(sheen, 'vinyl-sheen.webp')
