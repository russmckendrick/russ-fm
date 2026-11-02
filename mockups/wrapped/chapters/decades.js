import { d3, head, onVisible, countUp, esc, plural, reduced, clamp } from '../core.js';

let el, stops = [], tip, lastW = 0;
const cleanup = () => { stops.forEach(f => f()); stops = []; };
const tipEl = () => tip || (tip = Object.assign(document.createElement('div'), { className: 'tip' }), document.body.append(tip), tip);
function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.add('on');
  t.style.left = Math.min(innerWidth - t.offsetWidth - 8, x + 16) + 'px';
  t.style.top = Math.min(innerHeight - t.offsetHeight - 8, y + 16) + 'px';
}
const hideTip = () => tip?.classList.remove('on');

export default {
  id: 'decades',
  init(e) {
    el = e;
    addEventListener('resize', () => {
      const w = el.querySelector('.dc-field')?.clientWidth;
      if (w && Math.abs(w - lastW) > 40 && this.data) this.render(this.data);
    });
  },
  render(data) {
    cleanup();
    this.data = data;
    const recs = data.releases.filter(r => r.y && r.y > 1900 && r.y <= data.year);
    if (!recs.length) { el.innerHTML = ''; return; }
    const years = recs.map(r => r.y).sort((a, b) => a - b);
    const median = d3.median(years);
    const age = Math.round(d3.mean(years, y => data.year - y));
    const cut = median < 1985 ? 1970 : 1980;
    const before = years.filter(y => y < cut).length;
    const decades = d3.rollups(recs, v => v.length, r => Math.floor(r.y / 10) * 10).sort((a, b) => a[0] - b[0]);
    const topDec = decades.reduce((a, b) => (b[1] > a[1] ? b : a));
    const oldest = recs.reduce((a, b) => (b.y < a.y ? b : a));
    const newest = recs.reduce((a, b) => (b.y > a.y ? b : a));
    const maxDec = topDec[1];

    el.innerHTML = `
      <div class="wrap">
        ${head('B4', 'Decades', 'When it was made', `Every record from ${data.year}, placed by the year it first came out. The oldest goes back to ${oldest.y}.`)}
        <div class="stats dc-stats">
          <div class="stat"><b data-n="${median}" data-plain>0</b><span>the median original year</span></div>
          <div class="stat"><b data-n="${age}">0</b><span>years old, on average, when it arrived</span></div>
          <div class="stat"><b data-n="${before}">0</b><span>first released before ${cut}</span></div>
          <div class="stat"><b>${topDec[0]}s</b><span>the decade with the most, ${plural(topDec[1], 'record')}</span></div>
        </div>
        <div class="dc-field"><svg class="dc-bands"></svg><div class="dc-nodes"></div></div>
        <div class="dc-decs">${decades.map(([d, n]) => `
          <div class="dc-dec" style="--h:${n / maxDec}"><i></i><b>${n}</b><span>${String(d).slice(2)}s</span></div>`).join('')}
        </div>
        <div class="dc-ends">
          ${[['Oldest', oldest], ['Newest', newest]].map(([k, r]) => `
          <a class="dc-end" href="/album/${r.s}/" style="--c:${r.c?.flood || '#e9a23b'}">
            <img src="${r.img}" alt="" loading="lazy">
            <div><p class="label">${k}</p><b>${r.y}</b><span>${esc(r.t)}</span><span class="by">${esc(r.by)}</span></div>
          </a>`).join('')}
        </div>
      </div>`;

    onVisible(el.querySelector('.dc-stats'), () => el.querySelectorAll('.dc-stats [data-n]').forEach(b =>
      countUp(b, +b.dataset.n, b.dataset.plain !== undefined ? { fmt: n => String(Math.round(n)) } : {})));
    swarm(data, recs, oldest, newest);
    onVisible(el.querySelector('.dc-decs'), () => el.querySelector('.dc-decs').classList.add('in'));
  },
};

function swarm(data, recs, oldest, newest) {
  const field = el.querySelector('.dc-field');
  const W = (lastW = field.clientWidth);
  const vert = W < 640;
  // A couple of spare years past the end so this year's pile has room to spread.
  const lo = Math.floor(d3.min(recs, r => r.y) / 10) * 10, hi = data.year + 5;
  const L = vert ? Math.max(760, (hi - lo) * 15) : W;
  const pad = 24;
  const axis = d3.scaleLinear([lo, hi], [pad, L - pad]);
  const nodes = recs.map(r => ({ r, t: axis(r.y + 0.5) }));

  // Settle a layout off-screen first to size the field and the thumbnails, then play it live.
  let s = clamp(Math.sqrt((L * (vert ? W : 460) * 0.42) / recs.length), vert ? 12 : 18, 46);
  let cross = 0;
  const forces = sim => sim.force('x', d3.forceX(d => d.t).strength(0.4)).force('y', d3.forceY(0).strength(0.045)).force('c', d3.forceCollide(s * 0.56).iterations(2))
    .force('bound', () => nodes.forEach(d => { d.x = clamp(d.x, s / 2 + 4, L - s / 2 - 4); }));
  for (let tries = 0; tries < 6; tries++) {
    nodes.forEach((d, i) => { d.x = d.t; d.y = ((i % 7) - 3) * 0.5; });
    const sim = forces(d3.forceSimulation(nodes)).stop();
    for (let i = 0; i < 260; i++) sim.tick();
    cross = d3.max(nodes, d => Math.abs(d.y)) * 2 + s + pad;
    if (!vert || cross <= W) break;
    s *= 0.88;
  }
  const C = vert ? W : Math.max(380, cross * 1.06);
  field.style.height = `${vert ? L : C}px`;
  const place = d => vert ? [C / 2 + d.y - s / 2, d.x - s / 2] : [d.x - s / 2, C / 2 + d.y - s / 2];

  // Decade bands behind
  const bands = d3.select(field).select('svg').attr('width', vert ? W : L).attr('height', vert ? L : C);
  const decs = d3.range(lo, hi, 10);
  const g = bands.selectAll('g').data(decs).join('g');
  g.append('rect').attr('class', (_, i) => `dc-band ${i % 2 ? 'odd' : ''}`)
    .attr(vert ? 'y' : 'x', d => axis(d)).attr(vert ? 'height' : 'width', d => axis(Math.min(d + 10, hi)) - axis(d))
    .attr(vert ? 'x' : 'y', 0).attr(vert ? 'width' : 'height', vert ? W : C);
  g.append('text').attr('class', 'dc-dlab')
    .attr('x', d => (vert ? 8 : axis(d) + 8)).attr('y', d => (vert ? axis(d) + 40 : 46))
    .text(d => (vert || axis(d + 10) - axis(d) > 110 ? `${d}s` : `${String(d).slice(2)}s`));

  const box = field.querySelector('.dc-nodes');
  box.innerHTML = nodes.map((d, i) => `<img class="dc-n${d.r === oldest || d.r === newest ? ' mark' : ''}" data-i="${i}" src="${d.r.img}" alt="" loading="lazy" style="width:${s}px;height:${s}px">`).join('');
  const imgs = [...box.children];
  const final = nodes.map(d => [d.x, d.y]);
  const draw = () => nodes.forEach((d, i) => { const [x, y] = place(d); imgs[i].style.transform = `translate(${x}px,${y}px)`; });

  box.addEventListener('pointerover', e => {
    const i = e.target.dataset?.i;
    if (i === undefined) return;
    const r = nodes[i].r;
    showTip(`<b>${esc(r.t)}</b>${esc(r.by)}<br><span style="color:var(--amber)">${r.y}</span> · ${data.year - r.y} years old when it arrived`, e.clientX, e.clientY);
  });
  box.addEventListener('pointermove', e => tip?.classList.contains('on') && showTip(tip.innerHTML, e.clientX, e.clientY));
  box.addEventListener('pointerout', hideTip);

  if (reduced) { draw(); box.classList.add('in'); return; }
  // Start every sleeve on its year's line, then let the swarm grow out from it.
  nodes.forEach((d, i) => { d.x = d.t; d.y = ((i % 7) - 3) * 0.5; });
  draw();
  const sim = forces(d3.forceSimulation(nodes)).alpha(1).alphaDecay(0.018).on('tick', draw).stop();
  const io = onVisible(field, () => { box.classList.add('in'); sim.restart(); }, { threshold: 0.12 });
  stops.push(() => { sim.stop(); io.disconnect(); });
  // Should the live run settle differently, ease back toward the measured layout so nothing clips.
  sim.on('end', () => { nodes.forEach((d, i) => { [d.x, d.y] = final[i]; }); box.classList.add('settle'); draw(); });
}
