import { head, onVisible, countUp, esc, plural, reduced } from '../core.js';

// Every coloured pressing as a disc slid half out of its sleeve, sorted by hue.
let el, ios = [];

// Colour families as in src/config/vinyl-colours.json
const FAMILIES = [
  ['Clear', '#dfe6ea'], ['White', '#f1eee6'], ['Yellow', '#f0c419'], ['Orange', '#ee7a1a'], ['Red', '#c81d25'],
  ['Pink', '#ec6fa5'], ['Purple', '#6b2fa0'], ['Blue', '#1f4fb5'], ['Green', '#1f8a4c'], ['Brown', '#6b4327'],
  ['Grey', '#8b8f94'], ['Gold & silver', '#c9a24a'], ['Multicolour', 'conic-gradient(#d4553f, #e3b23c, #4f9a6b, #3f7fb5, #d4553f)'],
];
const SWATCH = Object.fromEntries(FAMILIES);

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, s, l];
}

const tinted = v => v.glass && v.hex[0] !== '#dfe6ea';

function family(v) {
  if (v.glass && !tinted(v)) return 'Clear';
  if (/gold|silver|copper|bronze|metallic/i.test(v.n)) return 'Gold & silver';
  if (v.hex.length > 1 || /rainbow|multi/i.test(v.n)) return 'Multicolour';
  const [h, s, l] = hsl(v.hex[0]);
  if (s < 0.18) return l > 0.75 ? 'White' : 'Grey';
  if (l < 0.3 && h >= 10 && h < 50) return 'Brown';
  if (h < 12 || h >= 345) return 'Red';
  if (h < 40) return 'Orange';
  if (h < 70) return 'Yellow';
  if (h < 170) return 'Green';
  if (h < 255) return 'Blue';
  if (h < 290) return 'Purple';
  return 'Pink';
}

// Small seeded random so a pressing always gets the same splatter.
function rng(str) {
  let x = [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function discBackground(v) {
  const r = rng(v.n);
  const [a, b0, c0] = v.hex;
  const light = hsl(a)[2] > 0.6;
  const b = b0 || (v.pat === 'splatter' || v.pat === 'flake' ? (light ? '#111' : '#f4efe4') : light ? '#c9c2b5' : '#0c0c0c');
  const c = c0 || b;
  const alpha = v.glass ? (tinted(v) ? 0.55 : 0.26) : v.see ? 0.72 : 1;
  const base = v.glass && !tinted(v) ? `rgba(226,234,238,${alpha})` : rgba(a, alpha);
  const L = v.see || v.glass ? ['radial-gradient(circle at 32% 28%, rgba(255,255,255,.38), rgba(255,255,255,0) 42%)', 'radial-gradient(circle, rgba(255,255,255,0) 64%, rgba(255,255,255,.22) 97%)'] : [];
  if (v.pat === 'splatter' || v.pat === 'flake') {
    const n = v.pat === 'flake' ? 46 : 22;
    for (let i = 0; i < n; i++) {
      const rad = v.pat === 'flake' ? 0.6 + r() : 1.2 + r() * 4.5;
      L.push(`radial-gradient(circle at ${(8 + r() * 84).toFixed(1)}% ${(8 + r() * 84).toFixed(1)}%, ${i % 3 === 2 ? c : b} 0 ${rad.toFixed(1)}px, transparent ${(rad + 0.6).toFixed(1)}px)`);
    }
  } else if (v.pat === 'split') {
    L.push(`conic-gradient(from ${Math.round(r() * 180)}deg, ${base} 0 50%, ${rgba(b, alpha)} 50% 100%)`);
  } else if (v.pat === 'tricolour') {
    L.push(`conic-gradient(from ${Math.round(r() * 120)}deg, ${base} 0 33.3%, ${rgba(b, alpha)} 33.3% 66.6%, ${rgba(c === b ? '#f1eee6' : c, alpha)} 66.6% 100%)`);
  } else if (v.pat || v.hex.length > 1) {
    // Marble, swirl, smoke and friends: soft blobs over a twisted conic.
    for (let i = 0; i < 5; i++) {
      L.push(`radial-gradient(${Math.round(18 + r() * 30)}% ${Math.round(14 + r() * 26)}% at ${Math.round(r() * 100)}% ${Math.round(r() * 100)}%, ${rgba(i % 2 ? b : c, v.pat === 'smoke' ? 0.55 : 0.85)}, transparent 70%)`);
    }
    L.push(`conic-gradient(from ${Math.round(r() * 360)}deg at ${Math.round(35 + r() * 30)}% ${Math.round(35 + r() * 30)}%, ${base}, ${rgba(b, alpha)}, ${base}, ${rgba(c, alpha)}, ${base})`);
  }
  if (/gold|silver|copper|bronze|metallic|pearl/i.test(v.n)) {
    L.unshift('conic-gradient(from 30deg, rgba(255,255,255,0) 0 10%, rgba(255,255,255,.45) 16%, rgba(255,255,255,0) 24% 52%, rgba(255,255,255,.35) 62%, rgba(255,255,255,0) 72%)');
  }
  L.push(base);
  return L.join(',');
}

export default {
  id: 'vinyl',
  init(e) { el = e; },
  render(data) {
    ios.forEach(io => io.disconnect());
    ios = [];
    const total = data.releases.length;
    const items = data.releases.filter(r => r.vc.length).map(r => {
      const v = r.vc[0];
      const [h, s, l] = hsl(v.hex[0]);
      const fam = family(v);
      // Rainbow order, then whites and greys, metallics, mixes, and plain clear last.
      const key = fam === 'Clear' ? 900 : fam === 'Multicolour' ? 600 + h : fam === 'Gold & silver' ? 500 + l : s < 0.18 ? 400 - l : (h + 15) % 360;
      return { r, v, fam, key };
    }).sort((a, b) => a.key - b.key);
    if (!items.length) { el.innerHTML = ''; return; }

    const counts = new Map();
    for (const it of items) counts.set(it.fam, (counts.get(it.fam) || 0) + 1);
    const fams = [...counts].sort((a, b) => b[1] - a[1]);
    const black = total - items.length;
    const top = fams.find(([f]) => f !== 'Multicolour') || fams[0];
    const pats = items.filter(it => it.v.pat).length;
    const see = items.filter(it => it.v.see || it.v.glass).length;
    const pct = n => ((n / total) * 100).toFixed(2);

    el.innerHTML = `<div class="wrap">
      ${head('B1', 'Coloured vinyl', 'Not all black', 'Every coloured pressing added this year, slid out of its sleeve and sorted by colour. Hover one to take it all the way out.')}
      <div class="stats vx-stats">
        <div class="stat"><b><span data-count="${items.length}">0</span><small> / ${total}</small></b><span>records on coloured vinyl</span></div>
        <div class="stat"><b class="vx-word">${esc(top[0])}</b><span>the most common single colour, on ${plural(top[1], 'record')}</span></div>
        <div class="stat"><b data-count="${see}">0</b><span>clear or see-through</span></div>
        <div class="stat"><b data-count="${pats}">0</b><span>splattered, marbled, swirled or split</span></div>
      </div>
      <div class="vx-bar" aria-hidden="true">
        <i class="vx-black" style="--w:${pct(black)}%"><em>Black · ${black}</em></i>
        ${fams.map(([f, n]) => `<i style="--w:${pct(n)}%;--sw:${SWATCH[f]}" title="${esc(f)}: ${n}"></i>`).join('')}
      </div>
      <div class="vx-filters" role="group" aria-label="Filter by colour">
        <button class="pill sm" data-f="" aria-pressed="true">All ${items.length}</button>
        ${fams.map(([f, n]) => `<button class="pill sm" data-f="${esc(f)}" aria-pressed="false"><i style="--sw:${SWATCH[f]}"></i>${esc(f)} <span>${n}</span></button>`).join('')}
      </div>
      <div class="vx-grid${items.length > 15 ? ' capped' : ''}">
        ${items.map((it, i) => `<a class="vx" href="/album/${it.r.s}/" data-fam="${esc(it.fam)}" style="--i:${Math.min(i, 40)};--spin:${(5 + (i % 5) * 0.7).toFixed(1)}s">
          <div class="vx-art">
            <div class="vx-discwrap">
              <div class="vx-disc" style="background:${discBackground(it.v)}">
                <span class="vx-label" style="background-image:url('${it.r.img}')"></span>
              </div>
              <i class="vx-sheen"></i>
            </div>
            <img class="vx-sleeve" src="${it.r.img}" alt="" loading="lazy">
          </div>
          <b>${esc(it.r.t)}</b><span>${esc(it.v.n)}${it.r.vc.length > 1 ? ` + ${it.r.vc.length - 1} more` : ''}</span>
        </a>`).join('')}
      </div>
      ${items.length > 15 ? `<button class="pill vx-more">Show all ${items.length}</button>` : ''}
    </div>`;

    // The first three rows, until asked for the rest (or a colour is picked).
    const uncap = () => { el.querySelector('.vx-grid').classList.remove('capped'); el.querySelector('.vx-more')?.remove(); };
    el.querySelector('.vx-more')?.addEventListener('click', uncap);
    el.querySelector('.vx-filters').addEventListener('click', e => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      uncap();
      el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b));
      el.querySelectorAll('.vx').forEach(x => { x.hidden = !!b.dataset.f && x.dataset.fam !== b.dataset.f; });
    });

    const grid = el.querySelector('.vx-grid');
    ios.push(onVisible(el.querySelector('.vx-stats'), () => {
      el.classList.add('vx-in');
      el.querySelectorAll('[data-count]').forEach(b => countUp(b, +b.dataset.count));
    }, { threshold: 0.3 }));
    ios.push(onVisible(grid, () => grid.classList.add('in'), { threshold: 0.05 }));
    // Discs only spin while the grid is on screen.
    ios.push(onVisible(grid, v => grid.classList.toggle('spinning', v && !reduced), { once: false, threshold: 0 }));
  },
};
