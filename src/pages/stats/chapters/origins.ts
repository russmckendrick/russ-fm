// Where it comes from: one strip across the page, split by the artists' home countries in
// proportion to their records. A country with a sixth of the shelves or more gets its own
// stretch, the rest share one, and each stretch shows the faces of its most collected artists.
// Every country is listed underneath. It replaced a world map (two circles and an ocean) and
// then a wall of every artist, which took a screen and a half to say the same thing.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsArtist } from '@/types/stats';
import { fallback, n, onWidthChange, tooltip, type StatsChapter, type StatsView } from '../kit';

interface Place { cc: string; name: string; n: number; artists: StatsArtist[] }
/** A stretch of the strip: one big country, or everywhere else together. */
interface Part { name: string; n: number; pct: number; faces: Array<{ a: StatsArtist; p: Place }> }

// The data's own spellings of the UK, folded into its ISO code.
const ALIAS: Record<string, string> = { UK: 'GB', EN: 'GB' };
const SHORT: Record<string, string> = { GB: 'the UK', US: 'the US' };
const regions = new Intl.DisplayNames('en-GB', { type: 'region' });
const nameOf = (cc: string) => { try { return regions.of(cc) ?? cc; } catch { return cc; } };

export default function origins(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const known = v.artists.filter(a => a.cc);
    if (!known.length) { el.innerHTML = ''; return; }
    const places: Place[] = d3.groups(known, a => ALIAS[a.cc!] ?? a.cc!)
      .map(([cc, list]) => ({ cc, name: nameOf(cc), n: d3.sum(list, a => a.n), artists: list.sort((a, b) => b.n - a.n) }))
      .sort((a, b) => b.n - a.n);
    const total = d3.sum(places, p => p.n), pct = (p: Place) => Math.round((p.n / total) * 100);
    const [first, second] = places;
    const short = (p: Place) => SHORT[p.cc] ?? p.name;
    const unknown = v.artists.length - known.length;

    el.innerHTML = `<div class="wrap">
      ${head('', 'Where it comes from', first.cc === 'GB' ? 'Mostly from home' : 'Where it comes from', `The ${plural(known.length, 'artist')} whose home country is known, split by country in proportion to their records, with each one's most collected artists.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${pct(first)}">0</span>%</b><span>by artists from ${esc(short(first))}, ${plural(first.n, 'record')}</span></div>
        ${second ? `<div class="stat"><b><span data-n="${pct(second)}">0</span>%</b><span>from ${esc(short(second))}</span></div>` : ''}
        <div class="stat"><b data-n="${places.length}">0</b><span>countries in all${second ? `; the other ${places.length - 2} share ${100 - pct(first) - pct(second)}%` : ''}</span></div>
      </div>
      <div class="or-strip"></div>
      <p class="or-chips">${places.map(p => `<span data-cc="${p.cc}">${esc(p.name)} <b>${n(p.n)}</b></span>`).join('')}</p>
      ${unknown ? `<p class="or-foot">${plural(unknown, 'artist')} with no known home country ${unknown === 1 ? 'is' : 'are'} left out.</p>` : ''}
    </div>`;

    const box = el.querySelector<HTMLElement>('.or-strip')!;
    const W = box.clientWidth, narrow = W < 640, face = narrow ? 58 : 84;
    const big = places.filter(p => p.n / total >= 1 / 6), rest = places.filter(p => p.n / total < 1 / 6);
    const parts: Part[] = big.map(p => ({ name: p.name, n: p.n, pct: pct(p), faces: p.artists.map(a => ({ a, p })) }));
    if (rest.length) parts.push({
      // What the named countries leave, so the strip's figures add up to 100.
      name: 'Elsewhere', n: d3.sum(rest, p => p.n), pct: 100 - d3.sum(big, pct),
      faces: rest.flatMap(p => p.artists.map(a => ({ a, p }))).sort((x, y) => y.a.n - x.a.n),
    });
    const shown: Part['faces'] = [];
    box.innerHTML = parts.map(part => {
      // As many faces as the stretch has room for, most collected first.
      const k = Math.max(1, Math.round(((part.n / total) * W) / face));
      const faces = part.faces.slice(0, k);
      return `<div class="or-part" style="flex-grow:${part.n}">
        <div class="or-lab"><b>${esc(part.name)}</b><span>${part.pct}%</span></div>
        <div class="or-faces" style="grid-template-columns:repeat(${faces.length}, minmax(0, 1fr))">${faces.map(f => {
          shown.push(f);
          return `<a href="/artist/${f.a.s}/" data-i="${shown.length - 1}" data-cc="${f.p.cc}" aria-label="${esc(f.a.name)}" style="--c:${f.a.f ?? fallback}"><img src="${v.avatar(f.a.s)}" alt="" loading="lazy"></a>`;
        }).join('')}</div>
      </div>`;
    }).join('');
    // A missing photo leaves the tile in its colour.
    box.addEventListener('error', e => (e.target as Element).remove(), true);

    box.addEventListener('pointermove', e => {
      const tile = (e.target as Element).closest<HTMLElement>('.or-faces a');
      if (!tile) return tip.hide();
      const { a, p } = shown[+tile.dataset.i!];
      tip.show(e, () => `<b>${esc(a.name)}</b>${esc(p.name)} · ${plural(a.n, 'record')}`, a);
    });
    box.addEventListener('pointerleave', () => tip.hide());

    // Hovering a country in the list lights its faces.
    const marked = [...box.querySelectorAll<HTMLElement>('.or-faces a')];
    const light = (cc: string | null) => marked.forEach(m => m.classList.toggle('dim', !!cc && m.dataset.cc !== cc));
    const chips = el.querySelector<HTMLElement>('.or-chips')!;
    let lit: string | null = null;
    chips.addEventListener('pointerover', e => {
      const cc = (e.target as Element).closest<HTMLElement>('[data-cc]')?.dataset.cc ?? null;
      if (cc !== lit) { lit = cc; light(cc); }
    });
    chips.addEventListener('pointerleave', () => { lit = null; light(null); });

    const io = onVisible(box, () => {
      box.classList.add('in');
      el.querySelectorAll('[data-n]').forEach(b => countUp(b, +(b as HTMLElement).dataset.n!));
    }, { threshold: 0.1 });
    stops.push(() => { io.disconnect(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
