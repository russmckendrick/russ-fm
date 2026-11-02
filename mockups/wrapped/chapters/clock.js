import { d3, head, onVisible, countUp, esc, plural, reduced } from '../core.js';

// When records were added: a 24-hour dial of stacked sleeve-coloured segments, plus a weekday × hour grid.
let el, ios = [];
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hourName = h => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);
const clockTime = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

export default {
  id: 'clock',
  init(e) { el = e; },
  render(data) {
    ios.forEach(io => io.disconnect());
    ios = [];
    const recs = data.releases.filter(r => r.h != null);
    if (!recs.length) { el.innerHTML = ''; return; }

    const bins = d3.range(24).map(() => []);
    for (const r of recs) bins[Math.floor(r.h) % 24].push(r);
    bins.forEach(b => b.sort((a, z) => a.h - z.h));
    const peak = d3.maxIndex(bins, b => b.length);
    const byDay = d3.range(7).map(d => recs.filter(r => r.wd === d).length);
    const topDay = d3.maxIndex(byDay);
    const dark = recs.filter(r => r.h >= 18 || r.h < 6).length;
    const darkPct = Math.round((dark / recs.length) * 100);
    const missing = data.releases.length - recs.length;

    el.innerHTML = `<div class="wrap">
      ${head('A3', 'Around the clock', 'Around the clock', 'When records were added, UK time. Each segment is one record in its sleeve colour, stacked out from the centre.')}
      <div class="clk-grid">
        <div class="clk-dial"><svg viewBox="-310 -310 620 620" role="img" aria-label="Records added by hour of the day; most at ${hourName(peak)}"></svg></div>
        <div class="clk-side">
          <div class="stats clk-stats">
            <div class="stat"><b>${hourName(peak).replace(' ', '&nbsp;')}</b><span>the busiest hour: ${plural(bins[peak].length, 'record')} added between ${hourName(peak)} and ${hourName((peak + 1) % 24)}</span></div>
            <div class="stat"><b>${DAYS[topDay].slice(0, 3)}</b><span>${plural(byDay[topDay], 'record')} on ${DAYS[topDay]}s, the busiest day of the week</span></div>
            <div class="stat"><b><span data-count="${darkPct}">0</span>%</b><span>added between 6 pm and 6 am</span></div>
          </div>
          <p class="label clk-mlabel">Day of the week × hour</p>
          <svg class="clk-matrix" viewBox="0 0 560 196" role="img" aria-label="Records by weekday and hour"></svg>
          ${missing ? `<p class="clk-foot">${plural(missing, 'record')} with no time recorded are left out.</p>` : ''}
        </div>
      </div>
    </div>`;

    const play = dial(el.querySelector('.clk-dial svg'), bins, peak);
    const pop = matrix(el.querySelector('.clk-matrix'), recs);
    ios.push(onVisible(el.querySelector('.clk-grid'), () => {
      play();
      pop();
      el.querySelectorAll('[data-count]').forEach(b => countUp(b, +b.dataset.count));
    }, { threshold: 0.25 }));
  },
};

function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.left = (e.clientX + 300 > innerWidth ? e.clientX - 300 : e.clientX + 16) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.classList.add('on');
}

function dial(svgEl, bins, peak) {
  const svg = d3.select(svgEl);
  const R = 248, r0 = 84;
  const max = d3.max(bins, b => b.length);
  const dr = Math.min(11, (R - r0) / max);
  const ang = h => (h / 24) * Math.PI * 2;

  // Day and night halves
  const band = d3.arc().innerRadius(r0 - 6).outerRadius(R + 8);
  svg.append('path').attr('class', 'clk-night').attr('d', band({ startAngle: ang(18) - Math.PI * 2, endAngle: ang(6) }));
  svg.append('path').attr('class', 'clk-day').attr('d', band({ startAngle: ang(6), endAngle: ang(18) }));
  for (let k = 1; k <= 4; k++) svg.append('circle').attr('class', 'clk-ring').attr('r', r0 + ((R - r0) * k) / 4);

  const ticks = svg.append('g');
  d3.range(24).forEach(h => {
    const a = ang(h) - Math.PI / 2, major = h % 6 === 0;
    ticks.append('line').attr('class', major ? 'clk-tick major' : 'clk-tick')
      .attr('x1', Math.cos(a) * (R + 12)).attr('y1', Math.sin(a) * (R + 12))
      .attr('x2', Math.cos(a) * (R + (major ? 24 : 18))).attr('y2', Math.sin(a) * (R + (major ? 24 : 18)));
    if (h % 3 === 0) {
      ticks.append('text').attr('class', major ? 'clk-hour major' : 'clk-hour')
        .attr('x', Math.cos(a) * (R + 44)).attr('y', Math.sin(a) * (R + 44) + 4)
        .text(hourName(h).toUpperCase());
    }
  });

  // Peak glow behind the busiest hour
  svg.append('path').attr('class', 'clk-glow')
    .attr('d', d3.arc()({ innerRadius: r0, outerRadius: r0 + bins[peak].length * dr + 10, startAngle: ang(peak) - 0.02, endAngle: ang(peak + 1) + 0.02 }));

  const seg = d3.arc().padAngle(0.012).padRadius(R).cornerRadius(1.5);
  const items = bins.flatMap((b, h) => b.map((r, j) => ({ r, h, j })));
  const paths = svg.append('g').selectAll('path').data(items).join('path')
    .attr('class', 'clk-seg')
    .attr('fill', d => d.r.c?.flood || '#888')
    .datum(d => Object.assign(d, { a0: ang(d.h), a1: ang(d.h + 1), i0: r0 + d.j * dr, i1: r0 + (d.j + 1) * dr - 1.2 }))
    .on('pointermove', (e, d) => showTip(e, `<div class="clk-tip"><img src="${d.r.img}" alt=""><div><b>${esc(d.r.t)}</b>${esc(d.r.by)}<br><span>${clockTime(d.r.h)} · ${DAYS[d.r.wd] ?? ''}</span></div></div>`))
    .on('pointerleave', () => tip.classList.remove('on'));
  const full = d => seg({ innerRadius: d.i0, outerRadius: d.i1, startAngle: d.a0, endAngle: d.a1 });

  const hand = svg.append('g').attr('class', 'clk-hand');
  hand.append('line').attr('x1', 0).attr('y1', 14).attr('x2', 0).attr('y2', -(R + 4));
  hand.append('circle').attr('cy', -(R + 4)).attr('r', 4);
  svg.append('circle').attr('class', 'clk-hub').attr('r', r0 - 14);
  const centre = svg.append('g').attr('class', 'clk-centre');
  centre.append('text').attr('class', 'clk-big').attr('y', 8).text(hourName(peak).toUpperCase());
  centre.append('text').attr('class', 'clk-small').attr('y', 32).text('MOST ADDED');

  const restAngle = (peak + 0.5) * 15;
  if (reduced) {
    paths.attr('d', full);
    hand.attr('transform', `rotate(${restAngle})`);
    return () => {};
  }
  paths.attr('d', d => seg({ innerRadius: d.i0, outerRadius: d.i0 + 0.1, startAngle: d.a0, endAngle: d.a1 })).attr('opacity', 0);
  hand.attr('transform', 'rotate(0)').attr('opacity', 0);
  centre.attr('opacity', 0);
  return () => {
    const sweep = 2600;
    hand.attr('opacity', 1).transition().duration(sweep).ease(d3.easeCubicInOut)
      .attrTween('transform', () => t => `rotate(${t * 360})`)
      .transition().duration(1100).ease(d3.easeBackOut)
      .attrTween('transform', () => t => `rotate(${360 + t * restAngle})`);
    paths.transition()
      .delay(d => d3.easeCubicInOut.invert ? 0 : 0)
      .delay(d => sweepDelay(d.h, sweep) + d.j * 28)
      .duration(420).ease(d3.easeBackOut)
      .attr('opacity', 1)
      .attrTween('d', d => t => seg({ innerRadius: d.i0, outerRadius: d.i0 + (d.i1 - d.i0) * t, startAngle: d.a0, endAngle: d.a1 }));
    centre.transition().delay(sweep + 300).duration(600).attr('opacity', 1);
  };
}

// When the cubic-in-out hand passes an hour, so segments grow as it sweeps over them.
function sweepDelay(h, sweep) {
  const target = (h + 0.5) / 24;
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; d3.easeCubicInOut(m) < target ? (lo = m) : (hi = m); }
  return lo * sweep;
}

function matrix(svgEl, recs) {
  const svg = d3.select(svgEl);
  const cell = 21, x0 = 56, y0 = 8;
  const counts = d3.range(7).map(d => d3.range(24).map(h => recs.filter(r => r.wd === d && Math.floor(r.h) === h)));
  const max = d3.max(counts.flat(), c => c.length) || 1;
  ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((d, i) =>
    svg.append('text').attr('class', 'clk-mtext').attr('x', 0).attr('y', y0 + i * cell + cell / 2 + 4).text(d));
  [0, 6, 12, 18].forEach(h =>
    svg.append('text').attr('class', 'clk-mtext').attr('x', x0 + h * cell + cell / 2).attr('y', y0 + 7 * cell + 16).attr('text-anchor', 'middle').text(hourName(h).toUpperCase()));
  const cells = counts.flatMap((row, d) => row.map((list, h) => ({ d, h, list })));
  svg.selectAll('circle.bg').data(cells).join('circle').attr('class', 'clk-mbg')
    .attr('cx', c => x0 + c.h * cell + cell / 2).attr('cy', c => y0 + c.d * cell + cell / 2).attr('r', 1.4);
  const dots = svg.selectAll('circle.dot').data(cells.filter(c => c.list.length)).join('circle').attr('class', 'clk-mdot')
    .attr('cx', c => x0 + c.h * cell + cell / 2).attr('cy', c => y0 + c.d * cell + cell / 2)
    .attr('fill', c => c.list[c.list.length - 1].c?.flood || '#e9a23b')
    .on('pointermove', (e, c) => showTip(e, `<b>${DAYS[c.d]}s, ${hourName(c.h)}–${hourName((c.h + 1) % 24)}</b>${plural(c.list.length, 'record')}<div class="thumbs">${c.list.slice(0, 4).map(r => `<img src="${r.img}" alt="">`).join('')}</div>`))
    .on('pointerleave', () => tip.classList.remove('on'));
  const rOf = c => 2.5 + Math.sqrt(c.list.length / max) * 8;
  if (reduced) { dots.attr('r', rOf); return () => {}; }
  dots.attr('r', 0);
  return () => dots.transition().delay(c => 400 + c.h * 60 + c.d * 30).duration(500).ease(d3.easeBackOut.overshoot(2.4)).attr('r', rOf);
}
