// 02 · Where it comes from: the artists' home countries on a world map, a circle per country sized by its records.
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import worldUrl from 'world-atlas/countries-110m.json?url';
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsArtist } from '@/types/stats';
import { fallback, onWidthChange, tooltip, type StatsChapter, type StatsView } from '../kit';

type Country = GeoJSON.Feature<GeoJSON.Geometry, { name: string }>;
interface Place { id: string; n: number; artists: StatsArtist[]; f: Country; name: string }

// shortcut: ISO alpha-2 (the explore graph's `cc`) → world-atlas numeric id, only for the countries the
// collection has so far; an artist from anywhere else is left off the map until it is added here.
const ISO: Record<string, string> = {
  GB: '826', UK: '826', EN: '826', US: '840', AU: '036', NZ: '554', CA: '124', GR: '300', IE: '372', FR: '250', DE: '276',
  IS: '352', SE: '752', BE: '056', PL: '616', DK: '208', JM: '388', AR: '032', GY: '328', MX: '484', JP: '392', ZA: '710',
  NL: '528', BR: '076', FI: '246', NO: '578', CH: '756', CU: '192', NG: '566', IT: '380', ES: '724', AT: '040', PT: '620',
  IN: '356', KR: '410', CN: '156', RU: '643', IL: '376', HU: '348', CZ: '203', TR: '792', CO: '170', CL: '152', VE: '862',
};
const SHORT: Record<string, string> = { 'United Kingdom': 'the UK', 'United States of America': 'the US' };
// A country's centroid can land off its mainland (France's lands in French Guiana).
const CENTRE: Record<string, [number, number]> = { '250': [2.4, 46.6], '840': [-98.5, 39.5], '578': [9, 61] };

let world: Promise<Country[]> | null = null;
// world-atlas's TopoJSON: 110m Natural Earth countries, ids as ISO numeric strings.
const loadWorld = () => (world ??= fetch(worldUrl).then(r => r.json()).then(t =>
  (feature(t, t.objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>).features.map(f => ({ ...f, id: String(f.id) }))));

export default function origins(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null, alive = true;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  async function render(v: StatsView) {
    cleanup();
    current = v;
    const shapes = await loadWorld().catch(() => null);
    if (!alive || current !== v) return;
    if (!shapes) { el.innerHTML = ''; return; }
    const artists = v.artists;
    const known = artists.filter(a => a.cc && ISO[a.cc]);
    if (!known.length) { el.innerHTML = ''; return; }
    const byId = new Map(shapes.map(f => [f.id as string, f]));
    const lead = (a: StatsArtist) => a.f ?? fallback;
    const places: Place[] = d3.groups(known, a => ISO[a.cc!])
      .map(([id, list]) => ({ id, n: d3.sum(list, a => a.n), artists: list.sort((a, b) => b.n - a.n), f: byId.get(id)!, name: byId.get(id)?.properties.name ?? id }))
      .filter(p => p.f).sort((a, b) => b.n - a.n);
    const total = d3.sum(places, p => p.n), pct = (p: Place) => Math.round((p.n / total) * 100);
    const [first, second] = places;
    const nameOf = (p: Place) => SHORT[p.name] ?? p.name;

    el.innerHTML = `<div class="wrap">
      ${head('02', 'Where it comes from', first.id === '826' ? 'Mostly from home' : 'Where it comes from', `Where the artists are from, for the ${plural(known.length, 'artist')} whose home country is known. Each circle is a country, sized by its records.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${pct(first)}">0</span>%</b><span>by artists from ${esc(nameOf(first))}, ${plural(first.n, 'record')}</span></div>
        ${second ? `<div class="stat"><b><span data-n="${pct(second)}">0</span>%</b><span>from ${esc(nameOf(second))}</span></div>` : ''}
        <div class="stat"><b data-n="${places.length}">0</b><span>countries in all${second ? `; the other ${places.length - 2} share ${100 - pct(first) - pct(second)}%` : ''}</span></div>
      </div>
      <div class="or-grid">
        <div class="or-map"><svg role="img" aria-label="World map of where the artists come from"></svg></div>
        <ol class="or-list">${places.slice(0, 8).map(p => `
          <li data-id="${p.id}" style="--w:${p.n / first.n};--c:${lead(p.artists[0])}">
            <div class="or-row"><b>${esc(p.name)}</b><span>${p.n}</span></div>
            <div class="or-bar"><i></i></div>
            <div class="or-faces">${p.artists.slice(0, 8).map(a => `<a href="/artist/${a.s}/" title="${esc(a.name)} · ${a.n}"><img src="${v.avatar(a.s)}" alt="${esc(a.name)}" loading="lazy"></a>`).join('')}</div>
          </li>`).join('')}
        </ol>
      </div>
      <p class="or-foot">${plural(artists.length - known.length, 'artist')} with no known home country ${artists.length - known.length === 1 ? 'is' : 'are'} left out.</p>
    </div>`;

    const box = el.querySelector<HTMLElement>('.or-map')!;
    const W = box.clientWidth, H = Math.round(W * 0.52);
    const proj = d3.geoEqualEarth().fitExtent([[0, 0], [W, H]], { type: 'Sphere' });
    const path = d3.geoPath(proj);
    const svg = d3.select(box).select('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('path').attr('class', 'or-sphere').attr('d', path({ type: 'Sphere' }));
    const has = new Map(places.map(p => [p.id, p]));
    const op = d3.scaleLog([1, first.n], [0.25, 0.85]);
    svg.append('g').selectAll('path').data(shapes).join('path')
      .attr('class', f => `or-land${has.has(f.id as string) ? ' on' : ''}`).attr('d', path)
      .style('fill-opacity', f => (has.has(f.id as string) ? op(has.get(f.id as string)!.n) : null));
    const r = d3.scaleSqrt([0, first.n], [0, Math.max(18, W * 0.055)]);
    const dots = svg.append('g').selectAll('circle').data([...places].reverse()).join('circle')
      .attr('class', 'or-dot').attr('r', 0).attr('fill', p => lead(p.artists[0]))
      .attr('transform', p => `translate(${proj(CENTRE[p.id] ?? d3.geoCentroid(p.f))})`);

    const items = [...el.querySelectorAll<HTMLElement>('.or-list li')];
    const focus = (id: string | null) => {
      dots.classed('dim', p => !!id && p.id !== id);
      items.forEach(li => li.classList.toggle('dim', !!id && li.dataset.id !== id));
    };
    let focused: string | null = null;
    dots.on('pointermove', (e: PointerEvent, p) => {
      if (focused !== p.id) { focused = p.id; focus(p.id); }
      tip.show(e, () => `<b>${esc(p.name)} · ${plural(p.n, 'record')}</b>${plural(p.artists.length, 'artist')}: ${p.artists.slice(0, 4).map(a => esc(a.name)).join(', ')}${p.artists.length > 4 ? '…' : ''}`, p);
    }).on('pointerleave', () => { tip.hide(); focused = null; focus(null); });
    items.forEach(li => {
      li.addEventListener('pointerenter', () => focus(li.dataset.id!));
      li.addEventListener('pointerleave', () => focus(null));
    });

    const io = onVisible(box, () => {
      dots.transition().duration(900).delay((_, i) => i * 40).ease(d3.easeBackOut).attr('r', p => r(p.n));
      el.querySelector('.or-list')!.classList.add('in');
      el.querySelectorAll('[data-n]').forEach(b => countUp(b, +(b as HTMLElement).dataset.n!));
    }, { threshold: 0.2 });
    stops.push(() => { io.disconnect(); dots.interrupt(); tip.hide(); });
  }

  return { render: s => void render(s), dispose: () => { alive = false; cleanup(); unwatch(); tip.remove(); } };
}
