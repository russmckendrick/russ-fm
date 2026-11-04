import { d3, head, onVisible, countUp, esc, plural, MONTHS_LONG, reduced } from '../../wrapped/core.js';

// Every month since the first record, stacked by genre family in each family's sleeve colour.
let el, io;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);
const monthKey = d => d.slice(0, 7);

export default {
  id: 'growth',
  init(e) {
    el = e;
    let w = 0;
    addEventListener('resize', () => { const nw = el.clientWidth; if (this.data && Math.abs(nw - w) > 40) { w = nw; this.render(this.data); } });
  },
  render(data) {
    this.data = data;
    io?.disconnect();
    const fams = data.families.map(f => f.key);
    const byMonth = d3.group(data.releases, r => monthKey(r.d));
    const [y0, m0] = data.releases[0].d.split('-').map(Number);
    const [y1, m1] = data.releases.at(-1).d.split('-').map(Number);
    const months = [];
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
    const rows = months.map(k => {
      const list = byMonth.get(k) || [];
      const row = { k, date: new Date(`${k}-15T00:00:00Z`), list };
      for (const f of fams) row[f] = 0;
      for (const r of list) if (r.fam in row) row[r.fam]++;
      return row;
    });
    const peak = rows.reduce((a, b) => (b.list.length > a.list.length ? b : a));
    const avg = data.releases.length / rows.length;
    const famTotals = fams.map(f => [f, d3.sum(rows, r => r[f])]).sort((a, b) => b[1] - a[1]);
    const name = Object.fromEntries(data.families.map(f => [f.key, f.name]));
    const label = k => { const [y, m] = k.split('-'); return `${MONTHS_LONG[m - 1]} ${y}`; };

    el.innerHTML = `<div class="wrap">
      ${head('01', 'Arrivals', 'Every month since 2015', `${plural(data.releases.length, 'record')} over ${rows.length} months, stacked by genre in the colours of their own sleeves. Hover a month to see what came in.`)}
      <div class="stats gr-stats">
        <div class="stat"><b>${label(peak.k).replace(' ', '<br>')}</b><span>the busiest month: ${plural(peak.list.length, 'record')}</span></div>
        <div class="stat"><b data-n="${Math.round(avg)}">0</b><span>records a month on average</span></div>
        <div class="stat"><b>${esc(name[famTotals[0][0]])}</b><span>the biggest family, ${plural(famTotals[0][1], 'record')}</span></div>
      </div>
      <div class="gr-chart"><svg role="img" aria-label="Records added each month since ${y0}, stacked by genre family"></svg><i class="gr-rule"></i></div>
      <div class="gr-legend">${famTotals.filter(([, n]) => n).map(([f, n]) => `<span style="--c:${data.famColour[f]}"><i></i>${esc(name[f])} <b>${n}</b></span>`).join('')}</div>
    </div>`;

    const box = el.querySelector('.gr-chart');
    const W = box.clientWidth, H = Math.round(Math.min(460, Math.max(280, W * 0.36))), pad = { t: 34, b: 28 };
    const svg = d3.select(box).select('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const x = d3.scaleTime(d3.extent(rows, r => r.date), [0, W]);
    const stack = d3.stack().keys(fams.slice().reverse()).order(d3.stackOrderNone)(rows);
    const y = d3.scaleLinear([0, d3.max(rows, r => r.list.length)], [H - pad.b, pad.t]);
    const area = d3.area().x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);

    // Year bands and totals along the top.
    const yearsSeen = [...new Set(rows.map(r => r.k.slice(0, 4)))];
    const g = svg.append('g');
    yearsSeen.forEach((yr, i) => {
      const a = x(new Date(Date.UTC(+yr, 0, 1))), b = x(new Date(Date.UTC(+yr + 1, 0, 1)));
      const lo = Math.max(0, a), hi = Math.min(W, b);
      if (i % 2) g.append('rect').attr('class', 'gr-band').attr('x', lo).attr('width', hi - lo).attr('y', 0).attr('height', H - pad.b);
      if (hi - lo > 48) {
        g.append('text').attr('class', 'gr-yr').attr('x', lo + 6).attr('y', H - 9).text(W < 700 ? `’${yr.slice(2)}` : yr);
        g.append('text').attr('class', 'gr-tot').attr('x', lo + 6).attr('y', 16).text(data.perYear[yr] ?? '');
      }
    });
    const clip = `gr-clip-${Math.random().toString(36).slice(2)}`;
    svg.append('clipPath').attr('id', clip).append('rect').attr('height', H).attr('width', reduced ? W : 0);
    svg.append('g').attr('clip-path', `url(#${clip})`).selectAll('path').data(stack).join('path')
      .attr('class', 'gr-area').attr('fill', s => data.famColour[s.key]).attr('d', area)
      .append('title').text(s => name[s.key]);

    const rule = box.querySelector('.gr-rule');
    box.addEventListener('pointermove', e => {
      const bx = box.getBoundingClientRect();
      const t = x.invert(e.clientX - bx.left);
      const row = rows[d3.bisector(r => r.date).center(rows, t)];
      rule.style.transform = `translateX(${x(row.date)}px)`;
      rule.classList.add('on');
      const top = fams.map(f => [f, row[f]]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const sleeves = [...row.list].sort((a, b) => (b.c?.vivid ?? 0) - (a.c?.vivid ?? 0)).slice(0, 6);
      tip.innerHTML = `<b>${label(row.k)} · ${plural(row.list.length, 'record')}</b>${top.map(([f, n]) => `${esc(name[f])} ${n}`).join(' · ')}
        <div class="thumbs">${sleeves.map(r => `<img src="${r.img}" alt="">`).join('')}</div>`;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    });
    box.addEventListener('pointerleave', () => { tip.classList.remove('on'); rule.classList.remove('on'); });

    io = onVisible(box, () => {
      el.querySelectorAll('[data-n]').forEach(b => countUp(b, +b.dataset.n));
      if (!reduced) svg.select(`#${clip} rect`).transition().duration(2200).ease(d3.easeCubicInOut).attr('width', W);
    }, { threshold: 0.25 });
  },
};
