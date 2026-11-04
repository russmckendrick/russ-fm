import { d3, head, esc, plural } from '../../wrapped/core.js';

// The most collected artists, one lane each across every year: a dot per record on the day it arrived.
let el;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);
const TOP = 16;

export default {
  id: 'longhaul',
  init(e) {
    el = e;
    let w = 0;
    addEventListener('resize', () => { const nw = el.clientWidth; if (this.data && Math.abs(nw - w) > 40) { w = nw; this.render(this.data); } });
  },
  render(data) {
    this.data = data;
    const top = data.artists.filter(a => a.s !== 'various').sort((a, b) => b.n - a.n).slice(0, TOP)
      .map(a => ({ a, recs: data.releases.filter(r => r.a.includes(a.s)) }));
    const span = l => (Date.parse(l.recs.at(-1).d) - Date.parse(l.recs[0].d)) / 3.156e10;
    const longest = top.reduce((a, b) => (span(b) > span(a) ? b : a));
    const bestYear = top.map(l => ({ l, y: d3.greatest(d3.rollups(l.recs, v => v.length, r => r.d.slice(0, 4)), d => d[1]) }))
      .reduce((a, b) => (b.y[1] > a.y[1] ? b : a));
    const everyYear = top.filter(l => new Set(l.recs.map(r => r.d.slice(0, 4))).size === Object.keys(data.perYear).length);

    el.innerHTML = `<div class="wrap">
      ${head('04', 'The long haul', 'Who keeps coming back', `The ${TOP} most collected artists, each on its own line. Every dot is a record, in its sleeve colour, on the day it arrived.`)}
      <div class="stats lh-stats">
        <div class="stat"><b>${esc(longest.a.name)}</b><span>the longest run: ${span(longest).toFixed(1)} years from first record to latest</span></div>
        <div class="stat"><b>${esc(bestYear.l.a.name)}</b><span>${plural(bestYear.y[1], 'record')} in ${bestYear.y[0]} alone, the most in one year</span></div>
        <div class="stat"><b>${everyYear.length}</b><span>${everyYear.length === 1 ? 'artist' : 'artists'} added to every single year${everyYear.length ? `: ${everyYear.map(l => esc(l.a.name)).join(', ')}` : ''}</span></div>
      </div>
      <div class="lh-chart"></div>
    </div>`;

    const box = el.querySelector('.lh-chart');
    const W = box.clientWidth, lab = W < 640 ? 110 : 220, rowH = 40, H = top.length * rowH + 30;
    const first = Date.parse(data.releases[0].d), last = Date.parse(data.releases.at(-1).d);
    const x = d3.scaleTime([first, last], [lab + 12, W - 10]);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const years = Object.keys(data.perYear).map(Number);
    svg.append('g').selectAll('g').data(years).join('g').call(g => {
      g.append('line').attr('class', 'lh-tick').attr('x1', y => x(Date.UTC(y, 0, 1))).attr('x2', y => x(Date.UTC(y, 0, 1)))
        .attr('y1', 0).attr('y2', H - 22).attr('opacity', y => (x(Date.UTC(y, 0, 1)) < lab ? 0 : 1));
      g.append('text').attr('class', 'lh-yr').attr('x', y => Math.max(lab + 14, x(Date.UTC(y, 0, 1)) + 4)).attr('y', H - 6)
        .text(y => (W < 700 ? `’${String(y).slice(2)}` : y));
    });
    const rows = svg.append('g').selectAll('g').data(top).join('g').attr('transform', (_, i) => `translate(0,${i * rowH + rowH / 2})`);
    rows.append('line').attr('class', 'lh-lane').attr('x1', l => x(Date.parse(l.recs[0].d))).attr('x2', l => x(Date.parse(l.recs.at(-1).d)));
    rows.append('text').attr('class', 'lh-name').attr('x', lab).attr('dy', '0.35em').attr('text-anchor', 'end')
      .call(t => t.append('tspan').text(l => l.a.name)).call(t => t.append('tspan').attr('class', 'lh-count').attr('dx', 8).text(l => l.recs.length));
    rows.selectAll('circle').data(l => l.recs.map((r, k) => ({ r, k }))).join('circle')
      .attr('class', 'lh-dot').attr('cx', d => x(Date.parse(d.r.d))).attr('cy', d => (d.k % 3 - 1) * 4)
      .attr('r', W < 640 ? 4 : 6).attr('fill', d => d.r.c?.flood || '#e9a23b')
      .style('--d', d => `${(x(Date.parse(d.r.d)) / W) * 1.6}s`);

    box.addEventListener('pointermove', e => {
      const d = d3.select(e.target).datum?.();
      if (!d?.r) return tip.classList.remove('on');
      tip.innerHTML = `<b>${esc(d.r.t)}</b>${esc(d.r.by)} · added ${new Date(d.r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}<div class="thumbs"><img src="${d.r.img}" alt=""></div>`;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    });
    box.addEventListener('pointerleave', () => tip.classList.remove('on'));
  },
};
