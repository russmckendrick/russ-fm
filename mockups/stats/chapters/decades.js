import { d3, head, onVisible, countUp, esc, plural, reduced } from '../../wrapped/core.js';

// Every record placed by the year it first came out: a swarm of sleeve-coloured dots.
// All-time take on the Wrapped decades chapter (sleeves there; 3,000+ sleeves is too many here).
let el, sim;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);

export default {
  id: 'decades',
  init(e) {
    el = e;
    let w = 0;
    addEventListener('resize', () => { const nw = el.clientWidth; if (this.data && Math.abs(nw - w) > 40) { w = nw; this.render(this.data); } });
  },
  render(data) {
    this.data = data;
    sim?.stop();
    const recs = data.releases.filter(r => r.y && r.y > 1900);
    const arrived = r => +r.d.slice(0, 4);
    const median = d3.median(recs, r => r.y);
    const age = Math.round(d3.mean(recs, r => arrived(r) - r.y));
    const decs = d3.rollups(recs, v => v.length, r => Math.floor(r.y / 10) * 10).sort((a, b) => a[0] - b[0]);
    const top = decs.reduce((a, b) => (b[1] > a[1] ? b : a));
    const oldest = recs.reduce((a, b) => (b.y < a.y ? b : a));
    const sameYear = recs.filter(r => r.y === arrived(r)).length;

    el.innerHTML = `<div class="wrap">
      ${head('05', 'Decades', 'When it was made', `${plural(recs.length, 'record')}, each placed by the year it first came out. The oldest, ${esc(oldest.t)}, goes back to ${oldest.y}.`)}
      <div class="stats dc2-stats">
        <div class="stat"><b data-n="${median}" data-plain>0</b><span>the median original year</span></div>
        <div class="stat"><b data-n="${age}">0</b><span>years old, on average, when it arrived</span></div>
        <div class="stat"><b>${top[0]}s</b><span>the decade with the most, ${plural(top[1], 'record')}</span></div>
        <div class="stat"><b data-n="${sameYear}">0</b><span>bought the year they came out</span></div>
      </div>
      <div class="dc2-field"><svg></svg></div>
    </div>`;

    const box = el.querySelector('.dc2-field');
    const W = box.clientWidth, r = W < 640 ? 2.2 : 3.4;
    const lo = Math.floor(d3.min(recs, d => d.y) / 10) * 10, hi = data.year + 3;
    const x = d3.scaleLinear([lo, hi], [r + 4, W - r - 4]);
    const nodes = recs.map(d => ({ d, t: x(d.y + Math.random()), x: x(d.y + 0.5), y: (Math.random() - 0.5) * 20 }));
    const forces = s => s.force('x', d3.forceX(n => n.t).strength(0.5)).force('y', d3.forceY(0).strength(0.03)).force('c', d3.forceCollide(r + 0.4).iterations(2));
    // Settle off-screen to size the field, then replay it live from the year lines.
    const pre = forces(d3.forceSimulation(nodes)).stop();
    for (let i = 0; i < 220; i++) pre.tick();
    const half = d3.max(nodes, n => Math.abs(n.y)) + r + 8, H = Math.round(half * 2 + 40);
    const end = nodes.map(n => [n.x, n.y]);

    const svg = d3.select(box).select('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const bands = d3.range(lo, hi, 10);
    svg.append('g').selectAll('g').data(bands).join('g').call(g => {
      g.append('rect').attr('class', (_, i) => `dc2-band${i % 2 ? ' odd' : ''}`).attr('x', d => x(d)).attr('width', d => x(Math.min(d + 10, hi)) - x(d)).attr('height', H);
      g.append('text').attr('class', 'dc2-lab').attr('x', d => x(d) + 8).attr('y', 44).text(d => (x(d + 10) - x(d) > 110 ? `${d}s` : `’${String(d).slice(2)}`));
    });
    const dots = svg.append('g').attr('transform', `translate(0,${half + 20})`).selectAll('circle').data(nodes).join('circle')
      .attr('class', 'dc2-dot').attr('r', r).attr('fill', n => n.d.c?.flood || '#e9a23b');
    const draw = () => dots.attr('cx', n => n.x).attr('cy', n => n.y);

    box.addEventListener('pointermove', e => {
      const n = d3.select(e.target).datum?.();
      if (!n?.d) return tip.classList.remove('on');
      const d = n.d;
      tip.innerHTML = `<b>${esc(d.t)}</b>${esc(d.by)}<br><span style="color:var(--amber)">${d.y}</span> · ${arrived(d) - d.y} years old when it arrived in ${arrived(d)}<div class="thumbs"><img src="${d.img}" alt=""></div>`;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    });
    box.addEventListener('pointerleave', () => tip.classList.remove('on'));

    const count = () => el.querySelectorAll('[data-n]').forEach(b => countUp(b, +b.dataset.n, b.dataset.plain !== undefined ? { fmt: v => String(Math.round(v)) } : {}));
    if (reduced) { draw(); count(); return; }
    nodes.forEach(n => { n.x = n.t; n.y = (Math.random() - 0.5) * 6; });
    draw();
    sim = forces(d3.forceSimulation(nodes)).alpha(1).alphaDecay(0.02).on('tick', draw).stop();
    sim.on('end', () => { nodes.forEach((n, i) => { [n.x, n.y] = end[i]; }); dots.transition().duration(600).attr('cx', n => n.x).attr('cy', n => n.y); });
    onVisible(box, () => { sim.restart(); count(); }, { threshold: 0.15 });
  },
};
