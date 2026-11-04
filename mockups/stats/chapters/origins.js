import { d3, head, onVisible, countUp, esc, plural } from '../../wrapped/core.js';
import { feature } from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';

// Where the artists come from: a world map with a bubble per country, sized by records.
let el, world;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);
// shortcut: ISO alpha-2 → world-atlas numeric id, only for the codes the collection has; add as new ones turn up.
const ISO = { US: '840', AU: '036', GB: '826', UK: '826', EN: '826', NZ: '554', CA: '124', GR: '300', IE: '372', FR: '250', DE: '276', IS: '352',
  SE: '752', BE: '056', PL: '616', DK: '208', JM: '388', AR: '032', GY: '328', MX: '484', JP: '392', ZA: '710', NL: '528', BR: '076',
  FI: '246', NO: '578', CH: '756', CU: '192', NG: '566' };

export default {
  id: 'origins',
  init(e) {
    el = e;
    let w = 0;
    addEventListener('resize', () => { const nw = el.clientWidth; if (this.data && Math.abs(nw - w) > 40) { w = nw; this.render(this.data); } });
  },
  async render(data) {
    this.data = data;
    world ??= feature(...await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()).then(t => [t, t.objects.countries]));
    const artists = data.artists.filter(a => a.s !== 'various');
    const known = artists.filter(a => ISO[a.cc]);
    const lead = a => data.releases.find(r => r.a.includes(a.s) && r.c?.flood)?.c.flood || '#e9a23b';
    const byId = d3.rollups(known, v => ({ n: d3.sum(v, a => a.n), artists: v.sort((a, b) => b.n - a.n) }), a => ISO[a.cc]);
    const shapes = new Map(world.features.map(f => [f.id, f]));
    const countries = byId.map(([id, v]) => ({ id, ...v, f: shapes.get(id), name: shapes.get(id)?.properties.name ?? id }))
      .filter(c => c.f).sort((a, b) => b.n - a.n);
    const total = d3.sum(countries, c => c.n);
    const pct = c => Math.round((c.n / total) * 100);
    const [first, second] = countries;
    const rest = countries.length - 2;

    el.innerHTML = `<div class="wrap">
      ${head('02', 'Where it comes from', 'Mostly from home', `Where the artists are from, for the ${plural(known.length, 'artist')} whose origin is known. Each circle is a country, sized by its records.`)}
      <div class="stats or-stats">
        <div class="stat"><b><span data-n="${pct(first)}">0</span>%</b><span>by artists from the ${esc(first.name === 'United Kingdom' ? 'UK' : first.name)}, ${plural(first.n, 'record')}</span></div>
        <div class="stat"><b><span data-n="${pct(second)}">0</span>%</b><span>from the ${esc(second.name === 'United States of America' ? 'US' : second.name)}</span></div>
        <div class="stat"><b data-n="${countries.length}">0</b><span>countries in all; the other ${rest} share ${100 - pct(first) - pct(second)}%</span></div>
      </div>
      <div class="or-grid">
        <div class="or-map"><svg role="img" aria-label="World map of artist origins"></svg></div>
        <ol class="or-list">${countries.slice(0, 8).map(c => `
          <li data-id="${c.id}" style="--w:${c.n / first.n};--c:${lead(c.artists[0])}">
            <div class="or-row"><b>${esc(c.name)}</b><span>${c.n}</span></div>
            <div class="or-bar"><i></i></div>
            <div class="or-faces">${c.artists.slice(0, 8).map(a => `<img src="${a.avatar}" alt="${esc(a.name)}" title="${esc(a.name)} · ${a.n}" loading="lazy">`).join('')}</div>
          </li>`).join('')}
        </ol>
      </div>
      <p class="or-foot">${plural(artists.length - known.length, 'artist')} with no known origin are left out.</p>
    </div>`;

    const box = el.querySelector('.or-map');
    const W = box.clientWidth, H = Math.round(W * 0.52);
    const proj = d3.geoEqualEarth().fitExtent([[0, 0], [W, H]], { type: 'Sphere' });
    const path = d3.geoPath(proj);
    const svg = d3.select(box).select('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('path').attr('class', 'or-sphere').attr('d', path({ type: 'Sphere' }));
    const has = new Map(countries.map(c => [c.id, c]));
    const op = d3.scaleLog([1, first.n], [0.25, 0.85]);
    svg.append('g').selectAll('path').data(world.features).join('path')
      .attr('class', f => `or-land${has.has(f.id) ? ' on' : ''}`).attr('d', path)
      .style('fill-opacity', f => (has.has(f.id) ? op(has.get(f.id).n) : null));
    const r = d3.scaleSqrt([0, first.n], [0, Math.max(18, W * 0.055)]);
    const bubbles = svg.append('g').selectAll('circle').data([...countries].reverse()).join('circle')
      .attr('class', 'or-dot').attr('r', 0).attr('fill', c => lead(c.artists[0]))
      // The UK's centroid lands in the sea between its islands, which is fine; France's lands in French Guiana, so use its mainland.
      .attr('transform', c => `translate(${proj(c.id === '250' ? [2.4, 46.6] : d3.geoCentroid(c.f))})`);

    const show = (e, c) => {
      tip.innerHTML = `<b>${esc(c.name)} · ${plural(c.n, 'record')}</b>${plural(c.artists.length, 'artist')}: ${c.artists.slice(0, 4).map(a => esc(a.name)).join(', ')}${c.artists.length > 4 ? '…' : ''}`;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    };
    const focus = id => { bubbles.classed('dim', c => id && c.id !== id); el.querySelectorAll('.or-list li').forEach(li => li.classList.toggle('dim', !!id && li.dataset.id !== id)); };
    bubbles.on('pointermove', (e, c) => { show(e, c); focus(c.id); }).on('pointerleave', () => { tip.classList.remove('on'); focus(null); });
    el.querySelectorAll('.or-list li').forEach(li => {
      li.addEventListener('pointerenter', () => focus(li.dataset.id));
      li.addEventListener('pointerleave', () => focus(null));
    });

    onVisible(box, () => {
      bubbles.transition().duration(900).delay((_, i) => i * 40).ease(d3.easeBackOut).attr('r', c => r(c.n));
      el.querySelector('.or-list').classList.add('in');
      el.querySelectorAll('[data-n]').forEach(b => countUp(b, +b.dataset.n));
    }, { threshold: 0.2 });
  },
};
