// Merge every year's Wrapped mockup data (mockups/wrapped/data/YYYY.json, from
// mockups/wrapped/build-data.py) into one all-time file for the stats mockup.
//   node mockups/stats/build-data.mjs   →  mockups/stats/data/all.json
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(here, '..', 'wrapped', 'data');
const years = fs.readdirSync(src).filter(f => /^\d{4}\.json$/.test(f)).sort();
const releases = new Map(), artists = new Map();
let last;
for (const f of years) {
  last = JSON.parse(fs.readFileSync(path.join(src, f), 'utf-8'));
  for (const r of last.releases) releases.set(r.s, r);
  for (const a of last.artists) {
    const had = artists.get(a.s);
    artists.set(a.s, { ...a, n: (had?.n ?? 0) + a.n, new: undefined });
  }
}
const rel = [...releases.values()].sort((a, b) => a.d.localeCompare(b.d));
// Each cube holds a different record: the top one for its stat not already on the shelf.
const used = new Set();
const by = key => { const r = [...rel].sort((a, b) => (b[key] || 0) - (a[key] || 0)).find(x => !used.has(x.s)); used.add(r.s); return r; };
const sum = k => rel.reduce((a, r) => a + (r[k] || 0), 0);
const coloured = rel.filter(r => r.vc.length);
const holder = (r, what) => ({ s: r.s, t: r.t, by: r.by, img: r.img, c: r.c, what });
const hrs = s => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;

const heavy = by('g_wt'), long = by('rt'), discs = by('discs'), tracks = by('tracks');
const first = rel.find(r => !used.has(r.s)), newest = coloured.at(-1);
const totals = {
  records: rel.length,
  artists: [...artists.values()].filter(a => a.s !== 'various').length,
  kg: Math.round(sum('g_wt') / 1000),
  hours: Math.round(sum('rt') / 3600),
  discs: sum('discs'),
  tracks: sum('tracks'),
  coloured: coloured.length,
  // shortcut: 3.5 mm a sleeve, ignoring gatefolds and box sets; fine for a headline.
  metres: +(rel.length * 0.0035).toFixed(1),
  since: first.d,
};
const holders = [
  { stat: `${totals.kg.toLocaleString('en-GB')} kg`, label: 'of vinyl', r: holder(heavy, `Heaviest: ${(heavy.g_wt / 1000).toFixed(1)} kg`) },
  { stat: `${totals.discs.toLocaleString('en-GB')}`, label: 'discs', r: holder(discs, `Most discs: ${discs.discs}`) },
  { stat: `${totals.hours.toLocaleString('en-GB')} h`, label: 'of music', r: holder(long, `Longest: ${hrs(long.rt)}`) },
  { stat: `${totals.tracks.toLocaleString('en-GB')}`, label: 'tracks', r: holder(tracks, `Most tracks: ${tracks.tracks}`) },
  { stat: `${totals.coloured.toLocaleString('en-GB')}`, label: 'coloured pressings', r: holder(newest, `Latest: ${newest.vc[0].n}`) },
  { stat: `${totals.metres} m`, label: 'of shelf', r: holder(first, `First in: ${first.d.slice(0, 7)}`) },
];

const out = {
  year: Number(rel.at(-1).d.slice(0, 4)), ytd: false, families: last.families, perYear: last.perYear,
  releases: rel, artists: [...artists.values()], links: [], outside: [], totals, holders,
};
fs.writeFileSync(path.join(here, 'data', 'all.json'), JSON.stringify(out));
console.log(totals, holders.map(h => `${h.stat} ← ${h.r.t} (${h.r.what})`));
