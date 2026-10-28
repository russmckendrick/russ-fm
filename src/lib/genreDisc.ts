/**
 * Geometry for the genre record: every record in the collection is one tile
 * on a vinyl disc. Families are slices (angle in proportion to their size),
 * filled groove by groove from the rim inwards, so the oldest records sit at
 * the edge and the newest by the label. Radii are in disc units (1 = edge).
 */

export const DISC = {
  /** Outermost groove of music. */
  music: 0.943,
  /** Centre label radius. */
  label: 0.327,
  /** Where the music should end, leaving a run-out groove before the label. */
  runout: 0.39,
  /** Gap between slices, in radians. */
  sliceGap: (1.4 * Math.PI) / 180,
  /** Gap between tiles, as a share of the groove pitch. */
  tileGap: 0.18,
};

export interface DiscRow {
  /** Groove centre radius. */
  r: number;
  /** Angle of the first tile's leading edge. */
  start: number;
  /** Angular width of each tile. */
  step: number;
  /** Index (in the family's album list) of the first tile on this row. */
  first: number;
  count: number;
}

export interface DiscSlice {
  a0: number;
  a1: number;
  mid: number;
  rows: DiscRow[];
}

export interface DiscLayout {
  pitch: number;
  slices: DiscSlice[];
}

/** Lay out slices for families of the given sizes (in disc order). */
export function layoutDisc(sizes: number[]): DiscLayout {
  const total = sizes.reduce((sum, n) => sum + n, 0);
  const usable = Math.PI * 2 - DISC.sliceGap * sizes.length;
  if (!total) return { pitch: 0.03, slices: [] };

  // Start from the pitch that would fill the ring down to the run-out, then
  // shrink it until every slice fits above the label.
  const area = Math.PI * (DISC.music ** 2 - DISC.runout ** 2);
  let pitch = Math.sqrt((area * 0.9) / total);
  for (let attempt = 0; attempt < 40; attempt++) {
    const fit = fitSlices(sizes, usable, pitch);
    if (fit) return { pitch, slices: placeSlices(sizes, fit, pitch) };
    pitch *= 0.97;
  }
  return { pitch, slices: placeSlices(sizes, sizes.map(n => (usable * n) / total), pitch) };
}

/** How many tiles a slice of `span` radians holds from the rim down to `inner`. */
function capacity(span: number, inner: number, pitch: number): number {
  let n = 0;
  for (let r = DISC.music; r >= inner; r -= pitch) n += Math.floor((span * r) / pitch);
  return n;
}

/** The narrowest span that holds `count` tiles above `inner`. */
function spanFor(count: number, inner: number, pitch: number): number {
  let lo = 0;
  let hi = Math.PI * 2;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (capacity(mid, inner, pitch) >= count) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Spans for every slice so they all end at the same depth, or null when the
 * collection does not fit above the label at this pitch.
 */
function fitSlices(sizes: number[], usable: number, pitch: number): number[] | null {
  const floor = DISC.label + pitch;
  const spansAt = (inner: number) => sizes.map(n => spanFor(n, inner, pitch));
  const sum = (spans: number[]) => spans.reduce((a, b) => a + b, 0);
  if (sum(spansAt(floor)) > usable) return null;
  let lo = floor;
  let hi = DISC.music;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (sum(spansAt(mid)) > usable) hi = mid;
    else lo = mid;
  }
  const spans = spansAt(lo);
  const scale = usable / sum(spans);
  return spans.map(s => s * scale);
}

function placeSlices(sizes: number[], spans: number[], pitch: number): DiscSlice[] {
  let a = -Math.PI / 2;
  return sizes.map((size, i) => {
    const span = spans[i];
    const a0 = a;
    const a1 = a + span;
    const rows: DiscRow[] = [];
    let placed = 0;
    for (let r = DISC.music; placed < size && r > DISC.label; r -= pitch) {
      const step = pitch / r;
      const fits = Math.floor(span / step);
      const count = Math.min(fits, size - placed);
      if (count > 0) {
        rows.push({ r, start: a0 + (span - fits * step) / 2, step, first: placed, count });
        placed += count;
      }
    }
    a = a1 + DISC.sliceGap;
    return { a0, a1, mid: (a0 + a1) / 2, rows };
  });
}

/** Normalise an angle into the range the slices use: [-π/2, 3π/2). */
function normAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let x = a;
  while (x < -Math.PI / 2) x += twoPi;
  while (x >= (Math.PI * 3) / 2) x -= twoPi;
  return x;
}

export interface DiscHit {
  slice: number;
  index: number;
}

/**
 * The tile under a point given in disc units relative to the centre. `pull`
 * is how far one slice is drawn out from the centre, tested first.
 */
export function hitDisc(layout: DiscLayout, x: number, y: number, pulled: number | null, pull: number): DiscHit | null {
  const order = layout.slices.map((_, i) => i);
  if (pulled !== null) {
    order.splice(order.indexOf(pulled), 1);
    order.unshift(pulled);
  }
  for (const i of order) {
    const slice = layout.slices[i];
    let px = x;
    let py = y;
    if (i === pulled) {
      px -= Math.cos(slice.mid) * pull;
      py -= Math.sin(slice.mid) * pull;
    }
    const r = Math.hypot(px, py);
    const a = normAngle(Math.atan2(py, px));
    if (a < slice.a0 || a > slice.a1) continue;
    const half = layout.pitch / 2;
    const row = slice.rows.find(row => Math.abs(row.r - r) <= half);
    if (!row) continue;
    const j = Math.floor((a - row.start) / row.step);
    if (j < 0 || j >= row.count) continue;
    return { slice: i, index: row.first + j };
  }
  return null;
}
