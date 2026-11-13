// Arrivals: every month since the first record, stacked by genre family in the families' sleeve
// colours, with the pace (the average gap between arrivals) among the figures above it.
import * as d3 from 'd3';
import { countUp, esc, head, MONTHS_LONG, onVisible, plural, reduced } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { onWidthChange, tooltip, type StatsChapter, type StatsView } from '../kit';

interface Row { k: string; date: Date; list: StatsRecord[]; [fam: string]: number | string | Date | StatsRecord[] }

const label = (k: string) => `${MONTHS_LONG[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

export default function growth(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const recs = v.records;
    if (!recs.length) { el.innerHTML = ''; return; }
    const fams = v.families.map(f => f.key);
    const byMonth = d3.group(recs, r => r.d.slice(0, 7));
    const [y0, m0] = recs[0].d.split('-').map(Number), [y1, m1] = recs.at(-1)!.d.split('-').map(Number);
    const rows: Row[] = [];
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) {
      const k = `${y}-${String(m).padStart(2, '0')}`, list = byMonth.get(k) ?? [];
      const row: Row = { k, date: new Date(Date.UTC(y, m - 1, 15)), list };
      for (const f of fams) row[f] = 0;
      for (const r of list) if (r.fam in row) (row[r.fam] as number)++;
      rows.push(row);
    }
    const peak = rows.reduce((a, b) => (b.list.length > a.list.length ? b : a));
    // The pace: how long, on average, between one record arriving and the next.
    const hours = ((Date.parse(recs.at(-1)!.d) - Date.parse(recs[0].d)) / 36e5) / Math.max(1, recs.length - 1);
    const pace = hours < 48 ? [Math.round(hours), 'h'] : [Math.round(hours / 24), 'days'];
    const bigYear = Object.entries(v.perYear).reduce((a, b) => (b[1] > a[1] ? b : a));
    const famTotals = fams.map(f => [f, d3.sum(rows, r => r[f] as number)] as const).sort((a, b) => b[1] - a[1]);

    el.innerHTML = `<div class="wrap">
      ${head('', 'Arrivals', 'One more won’t hurt', `${plural(recs.length, 'record')} since ${MONTHS_LONG[m0 - 1]} ${y0}, about ${Math.round(recs.length / rows.length)} a month. Each month is stacked by genre in the colours of its own sleeves; hover one to see what came in.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${pace[0]}">0</span> ${pace[1]}</b><span>between one record arriving and the next, on average</span></div>
        <div class="stat"><b>${label(peak.k).replace(' ', '<br>')}</b><span>the busiest month: ${plural(peak.list.length, 'record')}</span></div>
        <div class="stat"><b data-n="${bigYear[0]}" data-plain>0</b><span>the biggest year: ${plural(bigYear[1], 'record')}</span></div>
      </div>
      <div class="gr-chart"><svg role="img" aria-label="Records added each month since ${y0}, stacked by genre family"></svg><i class="gr-rule"></i></div>
      <div class="gr-legend">${famTotals.filter(([, c]) => c).map(([f, c]) => `<span style="--c:${v.famColour[f]}"><i></i>${esc(v.famName[f])} <b>${c}</b></span>`).join('')}</div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.gr-chart')!;
    const W = box.clientWidth, H = Math.round(Math.min(460, Math.max(280, W * 0.36))), bottom = 28, topPad = 34;
    const svg = d3.select(box).select('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const x = d3.scaleTime(d3.extent(rows, r => r.date) as [Date, Date], [0, W]);
    const y = d3.scaleLinear([0, d3.max(rows, r => r.list.length)!], [H - bottom, topPad]);
    const stack = d3.stack<Row>().keys([...fams].reverse()).value((r, k) => r[k] as number)(rows);
    const area = d3.area<d3.SeriesPoint<Row>>().x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);

    // Alternate year bands, the year along the bottom and its total along the top.
    const g = svg.append('g');
    for (const [i, yr] of [...new Set(rows.map(r => r.k.slice(0, 4)))].entries()) {
      const lo = Math.max(0, x(new Date(Date.UTC(+yr, 0, 1)))), hi = Math.min(W, x(new Date(Date.UTC(+yr + 1, 0, 1))));
      if (i % 2) g.append('rect').attr('class', 'gr-band').attr('x', lo).attr('width', hi - lo).attr('height', H - bottom);
      if (hi - lo < 48) continue;
      g.append('text').attr('class', 'gr-yr').attr('x', lo + 6).attr('y', H - 9).text(W < 700 ? `’${yr.slice(2)}` : yr);
      g.append('text').attr('class', 'gr-tot').attr('x', lo + 6).attr('y', 16).text(v.perYear[yr] ?? '');
    }
    const clip = `gr-clip-${Math.random().toString(36).slice(2)}`;
    const reveal = svg.append('clipPath').attr('id', clip).append('rect').attr('height', H).attr('width', reduced() ? W : 0);
    svg.append('g').attr('clip-path', `url(#${clip})`).selectAll('path').data(stack).join('path')
      .attr('class', 'gr-area').attr('fill', s => v.famColour[s.key]).attr('d', area);

    const rule = box.querySelector<HTMLElement>('.gr-rule')!;
    const near = d3.bisector((r: Row) => r.date).center;
    box.addEventListener('pointermove', e => {
      const row = rows[near(rows, x.invert(e.clientX - box.getBoundingClientRect().left))];
      rule.style.transform = `translateX(${x(row.date)}px)`;
      rule.classList.add('on');
      tip.show(e, () => {
      const top = fams.map(f => [f, row[f] as number] as const).filter(([, c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 3);
      // The month's best-known records first.
      const sleeves = [...row.list].sort((a, b) => (b.lis ?? 0) - (a.lis ?? 0)).slice(0, 6);
      return `<b>${label(row.k)} · ${plural(row.list.length, 'record')}</b>${top.map(([f, c]) => `${esc(v.famName[f])} ${c}`).join(' · ')}
        <div class="thumbs">${sleeves.map(r => `<img src="${v.img(r.s)}" alt="">`).join('')}</div>`;
      }, row);
    });
    const leave = () => { tip.hide(); rule.classList.remove('on'); };
    box.addEventListener('pointerleave', leave);

    const io = onVisible(box, () => {
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!, b.dataset.plain !== undefined ? { fmt: x => String(Math.round(x)) } : {}));
      if (!reduced()) reveal.transition().duration(2200).ease(d3.easeCubicInOut).attr('width', W);
    }, { threshold: 0.25 });
    stops.push(() => { io.disconnect(); reveal.interrupt(); leave(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
