import { d3, head, onVisible, countUp, plural, reduced } from '../../wrapped/core.js';

// Every disc, stacked flat by the year it arrived and drawn to scale: black is black,
// coloured pressings show in their colour, 7" and 10" sit narrower than 12".
let el, io;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);
const WIDTH = { '12"': 1, '10"': 0.83, '7"': 0.58 };
const BLACK = ['#191817', '#1f1d1b', '#161514'];

export default {
  id: 'pile',
  init(e) {
    el = e;
    let w = 0;
    addEventListener('resize', () => { const nw = el.clientWidth; if (this.data && Math.abs(nw - w) > 40) { w = nw; this.render(this.data); } });
  },
  render(data) {
    this.data = data;
    io?.disconnect();
    const years = d3.groups(data.releases, r => r.d.slice(0, 4));
    const piles = years.map(([yr, recs]) => {
      const discs = [];
      for (const r of recs) for (let i = 0; i < r.discs; i++) discs.push({ size: r.size, v: r.vc[i % Math.max(1, r.vc.length)] ?? null });
      return { yr, recs, discs, kg: d3.sum(recs, r => r.g_wt) / 1000, hours: d3.sum(recs, r => r.rt || 0) / 3600, coloured: recs.filter(r => r.vc.length).length };
    });
    const t = data.totals;
    const maxDiscs = d3.max(piles, p => p.discs.length);
    const heaviest = piles.reduce((a, b) => (b.kg > a.kg ? b : a));
    const pct = Math.round((t.coloured / t.records) * 100);

    el.innerHTML = `<div class="wrap">
      ${head('03', 'Weight and length', 'The pile', `All ${t.discs.toLocaleString('en-GB')} discs out of their sleeves and stacked flat, a pile for each year. Black is black; the colour is every coloured pressing, ${pct}% of the shelves.`)}
      <div class="stats pl-stats">
        <div class="stat"><b><span data-n="${t.kg}">0</span> kg</b><span>of vinyl, ${heaviest.yr} the heaviest year at ${Math.round(heaviest.kg)} kg</span></div>
        <div class="stat"><b><span data-n="${t.hours}">0</span> h</b><span>of music: ${Math.round(t.hours / 24)} days played back to back</span></div>
        <div class="stat"><b><span data-n="${t.tracks}">0</span></b><span>tracks across ${plural(t.discs, 'disc')}</span></div>
      </div>
      <div class="pl-piles">${piles.map((p, i) => `
        <div class="pl-pile" data-i="${i}">
          <div class="pl-stack"><canvas style="height:${(p.discs.length / maxDiscs) * 100}%"></canvas></div>
          <b>${p.yr}</b><span>${Math.round(p.kg)} kg · ${Math.round(p.hours)} h</span>
        </div>`).join('')}
      </div>
    </div>`;

    const draw = () => el.querySelectorAll('.pl-pile').forEach((node, i) => {
      const c = node.querySelector('canvas'), p = piles[i];
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      // The top disc lies face up, seen at an angle, so a pile reads as records and not a bar.
      const e = Math.min(w * 0.22, h * 0.5), body = h - e / 2;
      const step = (body - e / 2) / p.discs.length;
      const colourOf = (d, k) => (d.v ? d.v.hex[k % d.v.hex.length] : BLACK[k % 3]);
      // Oldest at the bottom, so the pile grows up through the year.
      p.discs.forEach((d, k) => {
        const dw = w * (WIDTH[d.size] ?? 1);
        ctx.fillStyle = colourOf(d, k);
        ctx.fillRect((w - dw) / 2, body - (k + 1) * step, dw, Math.max(step, 0.6));
      });
      // Rounded underside, then the face: the disc colour, grooves, and the top record's label in its sleeve colour.
      const k = p.discs.length - 1, top = p.discs[k];
      ctx.fillStyle = colourOf(p.discs[0], 0);
      ctx.beginPath(); ctx.ellipse(w / 2, body, w / 2, e / 2, 0, 0, Math.PI); ctx.fill();
      const cy = e / 2;
      ctx.fillStyle = top.v ? top.v.hex[0] : '#222';
      ctx.beginPath(); ctx.ellipse(w / 2, cy, w / 2, e / 2, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      for (let g = 0.42; g < 0.97; g += 0.09) { ctx.beginPath(); ctx.ellipse(w / 2, cy, (w / 2) * g, (e / 2) * g, 0, 0, 2 * Math.PI); ctx.stroke(); }
      ctx.fillStyle = p.recs.at(-1).c?.flood || '#e9a23b';
      ctx.beginPath(); ctx.ellipse(w / 2, cy, w * 0.17, e * 0.17, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#0e0d0c';
      ctx.beginPath(); ctx.ellipse(w / 2, cy, 1.6, 0.8, 0, 0, 2 * Math.PI); ctx.fill();
      // Light from the left across the side of the pile.
      const shade = ctx.createLinearGradient(0, 0, w, 0);
      shade.addColorStop(0, 'rgba(255,255,255,.10)'); shade.addColorStop(0.45, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, cy, w, body - cy);
    });

    const box = el.querySelector('.pl-piles');
    box.addEventListener('pointermove', e => {
      const node = e.target.closest('.pl-pile');
      if (!node) return tip.classList.remove('on');
      const p = piles[node.dataset.i];
      const heavy = p.recs.reduce((a, b) => (b.g_wt > a.g_wt ? b : a));
      tip.innerHTML = `<b>${p.yr}</b>${plural(p.recs.length, 'record')}, ${plural(p.discs.length, 'disc')}<br>${p.kg.toFixed(1)} kg · ${Math.round(p.hours)} hours · ${p.coloured} coloured<br>Heaviest: ${heavy.t}
        <div class="thumbs"><img src="${heavy.img}" alt=""></div>`;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    });
    box.addEventListener('pointerleave', () => tip.classList.remove('on'));

    io = onVisible(box, () => {
      draw();
      el.querySelectorAll('[data-n]').forEach(b => countUp(b, +b.dataset.n));
      if (!reduced) box.classList.add('in');
    }, { threshold: 0.2 });
    if (reduced) box.classList.add('in');
  },
};
