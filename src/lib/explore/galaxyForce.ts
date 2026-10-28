/**
 * The Galaxy's force layout: every artist placed in 3D inside its genre
 * family's nebula, with linked artists pulled together. Pure and import-free
 * so the Web Worker (galaxy.worker.ts) can run it without pulling in React or
 * the image helpers.
 */

export interface ForceJob {
  /** Artist count. */
  n: number;
  /** Family index per artist. */
  fam: Uint8Array;
  /** Star radius per artist (0 for hidden ones). */
  size: Float32Array;
  /** 1 for artists left off the map. */
  hidden: Uint8Array;
  /** Link ends as pairs: a0, b0, a1, b1… */
  links: Int32Array;
  /** Spring strength per link, 0–1.3. */
  strength: Float32Array;
  /** Nebula centre per family. */
  centres: [number, number, number][];
  /** Nebula radius per family. */
  radii: number[];
  iters: number;
  seed?: number;
}

/** Positions as x, y, z per artist. The same job always gives the same layout. */
export function layoutGalaxy(job: ForceJob, progress?: (done: number) => void): Float32Array {
  const { n, fam, size, hidden, links, strength, centres, radii, iters } = job;
  let seed = job.seed ?? 20261028;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const P = new Float32Array(n * 3);
  const V = new Float32Array(n * 3);
  const F = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = centres[fam[i]] ?? [0, 0, 0];
    const R = radii[fam[i]] ?? 100;
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const rr = R * Math.cbrt(rnd()) * 0.85;
    const q = Math.sqrt(1 - u * u);
    P[i * 3] = c[0] + Math.cos(t) * q * rr;
    P[i * 3 + 1] = c[1] + u * rr * 0.55;
    P[i * 3 + 2] = c[2] + Math.sin(t) * q * rr;
  }
  const CELL = 90;
  const cellKey = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const grid = new Map<number, number[]>();

  for (let it = 0; it < iters; it++) {
    const alpha = 1 - (it / iters) * 0.85;
    F.fill(0);
    grid.clear();
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const k = cellKey(Math.floor(P[i * 3] / CELL), Math.floor(P[i * 3 + 1] / CELL), Math.floor(P[i * 3 + 2] / CELL));
      const cell = grid.get(k);
      if (cell) cell.push(i);
      else grid.set(k, [i]);
    }
    // soft repulsion between nearby stars
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const cx = Math.floor(P[i * 3] / CELL);
      const cy = Math.floor(P[i * 3 + 1] / CELL);
      const cz = Math.floor(P[i * 3 + 2] / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const cell = grid.get(cellKey(cx + ox, cy + oy, cz + oz));
            if (!cell) continue;
            for (const j of cell) {
              if (j <= i) continue;
              const dx = P[j * 3] - P[i * 3];
              const dy = P[j * 3 + 1] - P[i * 3 + 1];
              const dz = P[j * 3 + 2] - P[i * 3 + 2];
              const range = (size[i] + size[j]) * 2.2 + 24;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 > range * range) continue;
              const dd = Math.sqrt(d2) + 0.01;
              const push = ((range - dd) / dd) * 0.12;
              F[i * 3] -= dx * push;
              F[i * 3 + 1] -= dy * push;
              F[i * 3 + 2] -= dz * push;
              F[j * 3] += dx * push;
              F[j * 3 + 1] += dy * push;
              F[j * 3 + 2] += dz * push;
            }
          }
        }
      }
    }
    // springs along links; links between families are much weaker so nebulae hold together
    for (let k = 0; k < links.length; k += 2) {
      const a = links[k];
      const b = links[k + 1];
      if (hidden[a] || hidden[b]) continue;
      const dx = P[b * 3] - P[a * 3];
      const dy = P[b * 3 + 1] - P[a * 3 + 1];
      const dz = P[b * 3 + 2] - P[a * 3 + 2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const same = fam[a] === fam[b];
      const rest = (size[a] + size[b]) * 1.6 + (same ? 34 : 60);
      const f = ((dd - rest) / dd) * (same ? 0.03 : 0.004) * (strength[k / 2] ?? 1);
      F[a * 3] += dx * f;
      F[a * 3 + 1] += dy * f;
      F[a * 3 + 2] += dz * f;
      F[b * 3] -= dx * f;
      F[b * 3 + 1] -= dy * f;
      F[b * 3 + 2] -= dz * f;
    }
    // gravity to the family centre, firmer outside the nebula, flattened a little
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const c = centres[fam[i]] ?? [0, 0, 0];
      const R = radii[fam[i]] ?? 100;
      const dx = c[0] - P[i * 3];
      const dy = c[1] - P[i * 3 + 1];
      const dz = c[2] - P[i * 3 + 2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const g = 0.004 + (dd > R ? (0.04 * (dd - R)) / dd : 0);
      F[i * 3] += dx * g;
      F[i * 3 + 1] += dy * g + dy * 0.006;
      F[i * 3 + 2] += dz * g;
      for (let a = 0; a < 3; a++) {
        let v = (V[i * 3 + a] + F[i * 3 + a]) * 0.6;
        if (v > 20) v = 20;
        else if (v < -20) v = -20;
        V[i * 3 + a] = v;
        P[i * 3 + a] += v * alpha;
      }
    }
    if (progress && it % 10 === 0) progress(it / iters);
  }
  return P;
}
