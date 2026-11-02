import { d3, head, onVisible, esc, plural, MONTHS, utc, reduced, clamp } from '../core.js';

let el, stops = [], tip, lastW = 0;
const cleanup = () => { stops.forEach(f => f()); stops = []; };

const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const tipEl = () => tip || (tip = Object.assign(document.createElement('div'), { className: 'tip' }), document.body.append(tip), tip);
function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.add('on');
  t.style.left = Math.min(innerWidth - t.offsetWidth - 8, x + 16) + 'px';
  t.style.top = Math.min(innerHeight - t.offsetHeight - 8, y + 16) + 'px';
}
const hideTip = () => tip?.classList.remove('on');

export default {
  id: 'genres',
  init(e) {
    el = e;
    addEventListener('resize', () => {
      const w = el.querySelector('.gn-chart')?.clientWidth;
      if (w && Math.abs(w - lastW) > 40 && this.data) this.render(this.data);
    });
  },
  render(data) {
    cleanup();
    this.data = data;
    const fams = data.families;
    const name = Object.fromEntries(fams.map(f => [f.key, f.name]));
    const col = data.famColour;
    const rel = data.releases.filter(r => r.fam);
    const total = Object.fromEntries(fams.map(f => [f.key, rel.filter(r => r.fam === f.key).length]));
    const keys = fams.map(f => f.key).filter(k => total[k]).sort((a, b) => total[b] - total[a]);
    if (!keys.length) { el.innerHTML = ''; return; }

    // Weekly counts, smoothed twice so the streams flow.
    const start = Date.UTC(data.year, 0, 1);
    const week = r => clamp(Math.floor((utc(r.d) - start) / (7 * 864e5)), 0, 52);
    const lastWeek = data.ytd ? Math.max(...rel.map(week)) + 1 : 52;
    const raw = d3.range(lastWeek + 1).map(() => Object.fromEntries(keys.map(k => [k, 0])));
    for (const r of rel) raw[Math.min(week(r), lastWeek)][r.fam]++;
    const smooth = rows => rows.map((_, i) => Object.fromEntries(keys.map(k => {
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
    const eras = [];
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
    chart(data, rows, keys, name, col, rel, total, lastWeek);
  },
};

function chart(data, rows, keys, name, col, rel, total, lastWeek) {
  const box = el.querySelector('.gn-chart');
  const W = (lastW = box.clientWidth);
  const H = W < 600 ? 320 : 460;
  const pad = 26;
  const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
  const x = d3.scaleLinear([0, rows.length - 1], [0, W]);
  const y = d3.scaleLinear([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))], [H - pad, 10]);
  const area = d3.area().x((_, i) => x(i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);

  const svg = d3.select(box).select('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
  const clipId = `gn-clip-${data.year}`;
  const clip = svg.append('defs').append('clipPath').attr('id', clipId).append('rect').attr('height', H).attr('width', reduced ? W : 0);
  const g = svg.append('g').attr('clip-path', `url(#${clipId})`);

  // Month gridlines + labels
  const weekOfMonth = m => (Date.UTC(data.year, m, 1) - Date.UTC(data.year, 0, 1)) / (7 * 864e5);
  const months = d3.range(12).filter(m => weekOfMonth(m) <= lastWeek);
  svg.insert('g', 'g').attr('class', 'gn-grid').selectAll('line').data(months).join('line')
    .attr('x1', m => x(weekOfMonth(m))).attr('x2', m => x(weekOfMonth(m))).attr('y1', 0).attr('y2', H - pad);
  svg.append('g').attr('class', 'gn-axis').selectAll('text').data(months).join('text')
    .attr('x', m => x(weekOfMonth(m)) + 4).attr('y', H - 8).text(m => (W < 600 ? MONTHS[m][0] : MONTHS[m]));

  const paths = g.selectAll('path').data(series).join('path')
    .attr('class', 'gn-stream').attr('fill', s => col[s.key]).attr('d', area);

  // Labels at each stream's widest point; widest streams claim their spot first, overlaps are dropped.
  const placed = [];
  const cands = series.map(s => {
    let best = 0, bi = 0;
    s.forEach((d, i) => { const t = y(d[0]) - y(d[1]); if (t > best && i > 1 && i < s.length - 2) { best = t; bi = i; } });
    const fs = clamp(best * 0.32, 9, W < 600 ? 10.5 : 15), w = name[s.key].length * fs * 0.78;
    return { key: s.key, t: best, fs, w, x: clamp(x(bi), w / 2 + 4, W - w / 2 - 4), mid: (y(s[bi][0]) + y(s[bi][1])) / 2 };
  }).filter(l => l.t > 15).sort((a, b) => b.t - a.t);
  for (const l of cands) {
    if (placed.every(o => Math.abs(o.x - l.x) > (o.w + l.w) / 2 || Math.abs(o.mid - l.mid) > (o.fs + l.fs) * 0.8)) placed.push(l);
  }
  const labels = g.selectAll('text.gn-lab').data(placed).join('text')
    .attr('class', 'gn-lab').attr('x', l => l.x).attr('y', l => l.mid + l.fs * 0.35)
    .attr('fill', l => (lum(col[l.key]) > 0.55 ? '#0e0d0c' : '#fbf7ef'))
    .style('font-size', l => `${l.fs}px`)
    .text(l => name[l.key]);

  const focus = k => {
    paths.classed('dim', s => k && s.key !== k);
    labels.classed('dim', l => k && l.key !== k);
    el.querySelectorAll('.gn-chip').forEach(c => c.classList.toggle('dim', !!k && c.dataset.k !== k));
  };
  const tipFor = k => {
    const recs = rel.filter(r => r.fam === k);
    return `<b>${esc(name[k])}</b>${plural(total[k], 'record')} · ${Math.round((total[k] / rel.length) * 100)}% of the year
      <div class="thumbs">${recs.slice(0, 5).map(r => `<img src="${r.img}" alt="">`).join('')}</div>`;
  };
  paths.on('pointerenter', (_, s) => focus(s.key))
    .on('pointermove', (e, s) => showTip(tipFor(s.key), e.clientX, e.clientY))
    .on('pointerleave', () => { focus(null); hideTip(); });
  el.querySelectorAll('.gn-chip').forEach(c => {
    c.addEventListener('pointerenter', () => focus(c.dataset.k));
    c.addEventListener('pointerleave', () => focus(null));
  });

  // Playhead that sweeps the year once it is drawn, naming the leading family as it goes.
  const now = box.querySelector('.gn-now'), nowLab = now.querySelector('span');
  let raf = 0;
  const sweep = t0 => tnow => {
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
  stops.push(() => cancelAnimationFrame(raf));

  const io = onVisible(box, () => {
    el.querySelector('.gn-eras').classList.add('in');
    if (reduced) return;
    clip.transition().duration(2200).ease(d3.easeCubicInOut).attr('width', W)
      .on('end', () => { now.classList.add('on'); raf = requestAnimationFrame(sweep(performance.now())); });
  }, { threshold: 0.25 });
  stops.push(() => io.disconnect());
}
