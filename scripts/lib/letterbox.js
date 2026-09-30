/**
 * Letterbox and pillarbox bars on artist photos: a photo pasted onto a
 * square with flat black (or white) bands above and below, or either side.
 * Printed into the flood, the bars vanish (screened black, multiplied white)
 * and the photo looks short and floating, so they're cut off.
 *
 * A bar is a run of lines from the edge that are all one near-black or
 * near-white colour, ending in a straight edge where most of the next line
 * changes at once. That edge test keeps a real black studio backdrop, whose
 * first non-black line is only the top of someone's head.
 */

/** Per-channel difference still counted as the bar's colour (JPEG noise). */
const TOLERANCE = 18;
/** Share of a line that must match for it to count as bar. */
const LINE_MATCH = 0.985;
/** Share of the line just past the bar that must differ: the straight edge. */
const EDGE_CHANGE = 0.5;
/** Bars thinner than this share of the photo are left alone. */
const MIN_BAR = 0.015;
/** Extra lines cut past the bar, for the soft JPEG fringe along its edge. */
const FRINGE = 2;

/**
 * Bars on each side of a raw RGB buffer, in px: { top, bottom, left, right }.
 * All zero when there are none.
 */
export function findBars(data, width, height, channels = 3) {
  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // The average colour of the outermost line on a side: 'dark', 'light' or null.
  const shade = (length, line) => {
    const first = [0, 0, 0];
    for (let j = 0; j < length; j++) line(0, j).forEach((v, c) => (first[c] += v / length));
    const kind = first.every(v => v <= 30) ? 'dark' : first.every(v => v >= 225) ? 'light' : null;
    return { first, kind };
  };

  // `line(k, j)`: pixel j along the k-th line in from this side.
  const measure = (lines, length, line) => {
    const { first, kind } = shade(length, line);
    if (!kind) return 0;

    const off = k => {
      let n = 0;
      for (let j = 0; j < length; j++) {
        const p = line(k, j);
        if (Math.max(...p.map((v, c) => Math.abs(v - first[c]))) > TOLERANCE) n++;
      }
      return n / length;
    };

    let k = 0;
    // Never more than 45% from one side: something has to be left.
    while (k < lines * 0.45 && off(k) <= 1 - LINE_MATCH) k++;
    if (k < lines * MIN_BAR) return 0;
    // The edge: a line or two past the bar (JPEG blurs the step) mostly changes.
    const past = Math.min(lines - 1, k + FRINGE);
    if (off(past) < EDGE_CHANGE) return 0;
    return Math.min(lines - 1, k + FRINGE);
  };

  const sides = {
    top: [height, width, (k, j) => px(j, k)],
    bottom: [height, width, (k, j) => px(j, height - 1 - k)],
    left: [width, height, (k, j) => px(k, j)],
    right: [width, height, (k, j) => px(width - 1 - k, j)],
  };
  const bars = Object.fromEntries(Object.entries(sides).map(([side, args]) => [side, measure(...args)]));

  // One side cut while the opposite starts the same shade but failed the test:
  // a ragged frame (a scanned print's border), not bars. Cutting one side
  // would leave it lopsided, so neither is cut.
  for (const [a, b] of [['top', 'bottom'], ['left', 'right']]) {
    if (!bars[a] === !bars[b]) continue;
    const cut = bars[a] ? a : b;
    const other = bars[a] ? b : a;
    const kind = shade(sides[cut][1], sides[cut][2]).kind;
    if (shade(sides[other][1], sides[other][2]).kind === kind) {
      bars[a] = 0;
      bars[b] = 0;
    }
  }
  return bars;
}
