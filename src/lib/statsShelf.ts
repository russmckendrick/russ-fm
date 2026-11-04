import type { StatsHolder } from '@/types/stats';

/** The /stats shelf's tags: `k` facts from the pool in stats.json at random, no two on the same record. */
export function pickHolders(pool: StatsHolder[], k: number, random = Math.random): StatsHolder[] {
  const out: StatsHolder[] = [];
  for (const h of shuffle(pool, random)) {
    if (out.length === k) break;
    if (!out.some(o => o.s === h.s)) out.push(h);
  }
  return out;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

