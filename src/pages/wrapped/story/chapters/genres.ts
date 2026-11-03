// B3 · Genres through the year: a streamgraph of the genre families by week, then the eras each family led.
import * as d3 from 'd3';
import { $, $$, clamp, esc, head, MONTHS, onVisible, plural, reduced, utc, type Chapter, type Release, type Story } from '../core';

type Row = Record<string, number>;
interface Era { fam: string; from: number; to: number; n: number; of: number; sleeve?: Release }
interface Lab { key: string; t: number; fs: number; w: number; x: number; mid: number }

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

export default function genres(el: HTMLElement): Chapter {
  let stops: Array<() => void> = [];
  let tip: HTMLDivElement | null = null, lastW = 0, current: Story | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const showTip = (html: string, x: number, y: number) => {
    if (!tip) { tip = Object.assign(document.createElement('div'), { className: 'ws-tip' }); document.body.append(tip); }
    tip.innerHTML = html; tip.classList.add('on');
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, x + 16) + 'px';
    tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, y + 16) + 'px';
  };
  const hideTip = () => tip?.classList.remove('on');
  const onResize = () => {
    const w = el.querySelector('.gn-chart')?.clientWidth;
    if (w && Math.abs(w - lastW) > 40 && current) render(current);
  };
  addEventListener('resize', onResize);

  function render(story: Story) {
    cleanup();
    current = story;
    const fams = story.families;
    const name: Record<string, string> = Object.fromEntries(fams.map(f => [f.key, f.name]));
    const col = story.famColour;
    const rel = story.releases.filter(r => r.fam);
    const total: Record<string, number> = Object.fromEntries(fams.map(f => [f.key, rel.filter(r => r.fam === f.key).length]));
    const keys = fams.map(f => f.key as string).filter(k => total[k]).sort((a, b) => total[b] - total[a]);
    if (!keys.length) { el.innerHTML = ''; return; }

    // Weekly counts, smoothed twice so the streams flow.
    const start = Date.UTC(story.year, 0, 1);
    const week = (r: Release) => clamp(Math.floor((utc(r.d) - start) / (7 * 864e5)), 0, 52);
    const lastWeek = story.ytd ? Math.max(...rel.map(week)) + 1 : 52;
    const raw: Row[] = d3.range(lastWeek + 1).map(() => Object.fromEntries(keys.map(k => [k, 0])));
    for (const r of rel) raw[Math.min(week(r), lastWeek)][r.fam]++;
    const smooth = (rows: Row[]): Row[] => rows.map((_, i) => Object.fromEntries(keys.map(k => {
      const w = [1, 4, 6, 4, 1];
      let s = 0, n = 0;
      w.forEach((wt, j) => { const row = rows[i + j - 2]; if (row) { s += row[k] * wt; n += wt; } });
      return [k, s / n];
    })));
    const rows = smooth(smooth(raw));

    // Eras: each month's leading family, runs merged.
    const monthly = d3.range(12).map(m => {
      const recs = rel.filter(r => +r.d.slice(5, 7) - 1 === m);
      const c = d3.rollup(recs, v => v.length, r => r.fam);
      const lead = [...c].sort((a, b) => b[1] - a[1])[0];
      return { m, recs, lead: lead?.[0], n: lead?.[1] || 0 };
    });
    const eras: Era[] = [];
    for (const mo of monthly) {
      if (!mo.lead) continue;
      const prev = eras.at(-1);
      if (prev && prev.fam === mo.lead && prev.to === mo.m - 1) { prev.to = mo.m; prev.n += mo.n; prev.of += mo.recs.length; }
      else eras.push({ fam: mo.lead, from: mo.m, to: mo.m, n: mo.n, of: mo.recs.length });
    }
    for (const e of eras) e.sleeve = rel.find(r => r.fam === e.fam && +r.d.slice(5, 7) - 1 >= e.from && +r.d.slice(5, 7) - 1 <= e.to);

    const topKey = keys[0];
    el.innerHTML = `
      <div class="wrap">
        ${head('B3', 'Genres', 'Genres through the year', `${esc(name[topKey])} led with ${plural(total[topKey], 'record')}. Each stream is a family of genres, as thick as the records added that week.`)}
        <div class="gn-chart"><svg></svg><div class="gn-now"><span></span></div></div>
        <div class="gn-legend">${keys.map(k => `<button class="gn-chip" data-k="${k}" style="--c:${col[k]}"><i></i>${esc(name[k])}<b>${total[k]}</b></button>`).join('')}</div>
        <p class="label gn-eras-k">Eras · who led each stretch</p>
        <div class="gn-eras">${eras.map((e, i) => `
          <div class="gn-era" style="--c:${col[e.fam]};--i:${i}">
            ${e.sleeve ? `<img src="${e.sleeve.img}" alt="" loading="lazy">` : ''}
            <span class="gn-when">${MONTHS[e.from]}${e.to > e.from ? ` – ${MONTHS[e.to]}` : ''}</span>
            <b>${esc(name[e.fam])}</b>
            <span class="gn-of">${e.n} of ${plural(e.of, 'record')}</span>
          </div>`).join('')}
        </div>
      </div>`;
    chart(story, rows, keys, name, col, rel, total, lastWeek);
  }

  function chart(story: Story, rows: Row[], keys: string[], name: Record<string, string>, col: Record<string, string>,
    rel: Release[], total: Record<string, number>, lastWeek: number) {
    const box = $('.gn-chart', el);
    const W = (lastW = box.clientWidth);
    const H = W < 600 ? 320 : 460;
    const pad = 26;
    const series = d3.stack<Row>().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
    const x = d3.scaleLinear([0, rows.length - 1], [0, W]);
    const y = d3.scaleLinear([d3.min(series, s => d3.min(s, d => d[0]))!, d3.max(series, s => d3.max(s, d => d[1]))!], [H - pad, 10]);
    const area = d3.area<d3.SeriesPoint<Row>>().x((_, i) => x(i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);

    const svg = d3.select(box).select<SVGSVGElement>('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const clipId = `gn-clip-${story.year}`;
    const clip = svg.append('defs').append('clipPath').attr('id', clipId).append('rect').attr('height', H).attr('width', reduced() ? W : 0);
    const g = svg.append('g').attr('clip-path', `url(#${clipId})`);

    // Month gridlines + labels
    const weekOfMonth = (m: number) => (Date.UTC(story.year, m, 1) - Date.UTC(story.year, 0, 1)) / (7 * 864e5);
    const months = d3.range(12).filter(m => weekOfMonth(m) <= lastWeek);
    svg.insert('g', 'g').attr('class', 'gn-grid').selectAll('line').data(months).join('line')
      .attr('x1', m => x(weekOfMonth(m))).attr('x2', m => x(weekOfMonth(m))).attr('y1', 0).attr('y2', H - pad);
    svg.append('g').attr('class', 'gn-axis').selectAll('text').data(months).join('text')
      .attr('x', m => x(weekOfMonth(m)) + 4).attr('y', H - 8).text(m => (W < 600 ? MONTHS[m][0] : MONTHS[m]));

    const paths = g.selectAll<SVGPathElement, d3.Series<Row, string>>('path').data(series).join('path')
      .attr('class', 'gn-stream').attr('fill', s => col[s.key]).attr('d', area);

    // Labels at each stream's widest point; widest streams claim their spot first, overlaps are dropped.
    const placed: Lab[] = [];
    const cands: Lab[] = series.map(s => {
      let best = 0, bi = 0;
      s.forEach((d, i) => { const t = y(d[0]) - y(d[1]); if (t > best && i > 1 && i < s.length - 2) { best = t; bi = i; } });
      const fs = clamp(best * 0.32, 9, W < 600 ? 10.5 : 15), w = name[s.key].length * fs * 0.78;
      return { key: s.key, t: best, fs, w, x: clamp(x(bi), w / 2 + 4, W - w / 2 - 4), mid: (y(s[bi][0]) + y(s[bi][1])) / 2 };
    }).filter(l => l.t > 15).sort((a, b) => b.t - a.t);
    for (const l of cands) {
      if (placed.every(o => Math.abs(o.x - l.x) > (o.w + l.w) / 2 || Math.abs(o.mid - l.mid) > (o.fs + l.fs) * 0.8)) placed.push(l);
    }
    const labels = g.selectAll<SVGTextElement, Lab>('text.gn-lab').data(placed).join('text')
      .attr('class', 'gn-lab').attr('x', l => l.x).attr('y', l => l.mid + l.fs * 0.35)
      .attr('fill', l => (lum(col[l.key]) > 0.55 ? '#0e0d0c' : '#fbf7ef'))
      .style('font-size', l => `${l.fs}px`)
      .text(l => name[l.key]);

    const chips = $$('.gn-chip', el);
    const focus = (k: string | null) => {
      paths.classed('dim', s => !!k && s.key !== k);
      labels.classed('dim', l => !!k && l.key !== k);
      chips.forEach(c => c.classList.toggle('dim', !!k && c.dataset.k !== k));
    };
    const tipFor = (k: string) => {
      const recs = rel.filter(r => r.fam === k);
      return `<b>${esc(name[k])}</b>${plural(total[k], 'record')} · ${Math.round((total[k] / rel.length) * 100)}% of the year
        <div class="thumbs">${recs.slice(0, 5).map(r => `<img src="${r.img}" alt="">`).join('')}</div>`;
    };
    paths.on('pointerenter', (_, s) => focus(s.key))
      .on('pointermove', (e: PointerEvent, s) => showTip(tipFor(s.key), e.clientX, e.clientY))
      .on('pointerleave', () => { focus(null); hideTip(); });
    chips.forEach(c => {
      c.addEventListener('pointerenter', () => focus(c.dataset.k!));
      c.addEventListener('pointerleave', () => focus(null));
    });

    // Playhead that sweeps the year once it is drawn, naming the leading family as it goes.
    const now = $('.gn-now', box), nowLab = $('span', now);
    let raf = 0;
    const sweep = (t0: number) => (tnow: number) => {
      const k = ((tnow - t0) / 14000) % 1;
      const i = Math.round(k * (rows.length - 1));
      const lead = keys.reduce((a, b) => (rows[i][b] > rows[i][a] ? b : a));
      now.style.transform = `translateX(${x(i)}px)`;
      now.style.setProperty('--c', col[lead]);
      const m = Math.min(11, Math.floor((i * 7) / 30.44));
      nowLab.textContent = `${MONTHS[m]} · ${name[lead]}`;
      nowLab.style.transform = x(i) > W - 180 ? 'translateX(calc(-100% - 12px))' : '';
      raf = requestAnimationFrame(sweep(t0));
    };

    const io = onVisible(box, () => {
      $('.gn-eras', el).classList.add('in');
      if (reduced()) return;
      clip.transition().duration(2200).ease(d3.easeCubicInOut).attr('width', W)
        .on('end', () => { now.classList.add('on'); raf = requestAnimationFrame(sweep(performance.now())); });
    }, { threshold: 0.25 });
    stops.push(() => { io.disconnect(); clip.interrupt(); cancelAnimationFrame(raf); hideTip(); });
  }

  return {
    render,
    dispose() {
      cleanup();
      removeEventListener('resize', onResize);
      tip?.remove();
      tip = null;
      current = null;
    },
  };
}
