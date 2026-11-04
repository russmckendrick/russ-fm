// 05 · The pile: every disc out of its sleeve and stacked flat, a pile a year, drawn to scale.
// Black is black, coloured pressings show in their colour, 7" and 10" sit narrower than 12",
// and the top disc lies face up with the year's last record's label colour.
import { countUp, esc, head, onVisible, plural, reduced } from '../../wrapped/story/core';
import type { StatsPile } from '@/types/stats';
import { fallback, n, onWidthChange, tooltip, type StatsChapter, type StatsView } from '../kit';

const WIDTH: Record<string, number> = { '12"': 1, '10"': 0.83, '7"': 0.58 };
const BLACK = ['#191817', '#1f1d1b', '#161514'];
const colourOf = (d: [string, string | null], k: number) => d[1] ?? BLACK[k % 3];

function draw(c: HTMLCanvasElement, p: StatsPile, label: string) {
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  if (!ctx || !h || !p.discs.length) return;
  ctx.scale(dpr, dpr);
  const e = Math.min(w * 0.22, h * 0.5), body = h - e / 2, cy = e / 2;
  const step = (body - cy) / p.discs.length;
  // Oldest at the bottom, so the pile grows up through the year.
  p.discs.forEach((d, k) => {
    const dw = w * (WIDTH[d[0]] ?? 1);
    ctx.fillStyle = colourOf(d, k);
    ctx.fillRect((w - dw) / 2, body - (k + 1) * step, dw, Math.max(step, 0.6));
  });
  // The rounded underside, then the face: disc colour, grooves, label, spindle hole.
  const ellipse = (rx: number, ry: number, y: number, fill: string, half = false) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(w / 2, y, rx, ry, 0, 0, half ? Math.PI : 2 * Math.PI); ctx.fill();
  };
  ellipse(w / 2, e / 2, body, colourOf(p.discs[0], 0), true);
  ellipse(w / 2, e / 2, cy, p.discs.at(-1)![1] ?? '#222');
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  for (let g = 0.42; g < 0.97; g += 0.09) { ctx.beginPath(); ctx.ellipse(w / 2, cy, (w / 2) * g, (e / 2) * g, 0, 0, 2 * Math.PI); ctx.stroke(); }
  ellipse(w * 0.17, e * 0.17, cy, label);
  ellipse(1.6, 0.8, cy, '#0e0d0c');
  // Light from the left across the side of the pile.
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, 'rgba(255,255,255,.10)'); shade.addColorStop(0.45, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, cy, w, body - cy);
}

export default function pile(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const piles = v.piles;
    if (!piles.length) { el.innerHTML = ''; return; }
    const t = v.totals;
    const most = Math.max(...piles.map(p => p.discs.length));
    const heaviest = piles.reduce((a, b) => (b.kg > a.kg ? b : a));

    el.innerHTML = `<div class="wrap">
      ${head('05', 'Weight and length', 'The pile', `All ${n(t.discs)} discs out of their sleeves and stacked flat, a pile for each year. Black is black; the colour is every coloured pressing, ${Math.round((t.coloured / t.records) * 100)}% of the shelves.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${t.kg}">0</span> kg</b><span>of vinyl, ${heaviest.yr} the heaviest year at ${Math.round(heaviest.kg)} kg</span></div>
        <div class="stat"><b><span data-n="${t.hours}">0</span> h</b><span>of music: ${Math.round(t.hours / 24)} days played back to back</span></div>
        <div class="stat"><b data-n="${t.tracks}">0</b><span>tracks across ${plural(t.discs, 'disc')}, on ${t.metres} m of shelf</span></div>
      </div>
      <div class="pl-piles">${piles.map((p, i) => `
        <div class="pl-pile" data-i="${i}" style="--i:${i}">
          <div class="pl-stack"><canvas style="height:${(p.discs.length / most) * 100}%" role="img" aria-label="${p.yr}: ${plural(p.discs.length, 'disc')}"></canvas></div>
          <b>${p.yr}</b><span>${Math.round(p.kg)} kg · ${p.hours} h</span>
        </div>`).join('')}
      </div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.pl-piles')!;
    box.addEventListener('pointermove', e => {
      const node = (e.target as Element).closest<HTMLElement>('.pl-pile');
      if (!node) return tip.hide();
      const p = piles[+node.dataset.i!];
      const heavy = v.bySlug.get(p.heaviest);
      tip.show(e, `<b>${p.yr}</b>${plural(p.records, 'record')}, ${plural(p.discs.length, 'disc')}<br>${p.kg.toFixed(1)} kg · ${p.hours} hours · ${p.coloured} coloured${heavy ? `<br>Heaviest: ${esc(heavy.t)}<div class="thumbs"><img src="${v.img(heavy.s)}" alt=""></div>` : ''}`);
    });
    box.addEventListener('pointerleave', () => tip.hide());

    const io = onVisible(box, () => {
      el.querySelectorAll('canvas').forEach((c, i) => draw(c, piles[i], v.bySlug.get(piles[i].last)?.f ?? fallback));
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
      if (!reduced()) box.classList.add('in');
    }, { threshold: 0.2 });
    stops.push(() => { io.disconnect(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
