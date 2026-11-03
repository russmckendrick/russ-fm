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

const STRONG = new Set(['member', 'group', 'bandmate', 'alias']);
const WHY = { member: 'member', group: 'band', bandmate: 'bandmates', alias: 'alias', 'shared-credit': 'shared credits', credit: 'credit' };

export default {
  id: 'connections',
  init(e) {
    el = e;
    addEventListener('resize', () => {
      const w = el.querySelector('.cn-sky')?.clientWidth;
      if (w && Math.abs(w - lastW) > 40 && this.data) this.render(this.data);
    });
  },
  render(data) {
    cleanup();
    this.data = data;
    const lead = s => data.releases.find(r => r.a.includes(s) && r.c?.flood)?.c.flood || '#e9a23b';
    const mine = new Map(data.artists.filter(a => a.s !== 'various').map(a => [a.s, a]));
    const old = new Map(data.outside.map(o => [o.s, o]));
    const known = s => mine.has(s) || old.has(s);
    const links = data.links.filter(l => l.a !== l.b && known(l.a) && known(l.b)).map(l => ({ ...l, source: l.a, target: l.b, strong: STRONG.has(l.type) }));
    const deg = d3.rollup(links.flatMap(l => [l.a, l.b]), v => v.length, s => s);
    const nodes = [...deg.keys()].map(s => {
      const a = mine.get(s);
      return a
        ? { id: s, name: a.name, avatar: a.avatar, mine: true, fresh: a.new, n: a.n, deg: deg.get(s), c: lead(s), r: clamp(7 + Math.sqrt(a.n) * 4, 8, 22) }
        : { id: s, name: old.get(s).name, avatar: old.get(s).avatar, mine: false, deg: deg.get(s), r: 3.2 };
    });
    if (!nodes.length) { el.innerHTML = ''; return; }
    const nbrs = new Map(nodes.map(n => [n.id, []]));
    for (const l of links) { nbrs.get(l.a).push([l.b, l]); nbrs.get(l.b).push([l.a, l]); }

    const fresh = [...mine.values()].filter(a => a.new);
    const bridged = fresh.filter(a => (nbrs.get(a.s) || []).some(([o]) => old.has(o) || (mine.has(o) && !mine.get(o).new))).length;
    const strong = links.filter(l => l.strong).length;
    const hubs = nodes.filter(n => n.mine).sort((a, b) => b.deg - a.deg).slice(0, 5);

    el.innerHTML = `
      <div class="wrap">
        ${head('B6', 'Connections', 'Connections', `How the year's artists tie into each other and into the rest of the shelves: band members, side projects, aliases and the people credited on both.`)}
        <div class="stats cn-stats">
          <div class="stat"><b data-n="${links.length}">0</b><span>links between artists</span></div>
          <div class="stat"><b data-n="${bridged}">0</b><span>of the ${plural(fresh.length, 'new artist')} connect to someone already on the shelves</span></div>
          <div class="stat"><b data-n="${strong}">0</b><span>band, member and alias ties</span></div>
          <div class="stat"><b data-n="${hubs[0]?.deg || 0}">0</b><span>links for ${esc(hubs[0]?.name || '')}, the most connected</span></div>
        </div>
        <div class="cn-grid">
          <div class="cn-sky"><canvas></canvas></div>
          <aside class="cn-side">
            <p class="label cn-k">Most connected</p>
            ${hubs.map((h, i) => `
              <a class="cn-hub" href="/artist/${h.id}/" data-id="${h.id}" style="--c:${h.c};--i:${i}">
                <img src="${h.avatar}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
                <span><b>${esc(h.name)}</b><em>${plural(h.deg, 'link')}</em></span>
              </a>`).join('')}
            <div class="cn-key">
              <span><i class="strong"></i>Band, member or alias</span>
              <span><i class="weak"></i>Shared credits</span>
              <span><i class="ring"></i>New to the collection</span>
              <span><i class="dot"></i>Already on the shelves</span>
            </div>
          </aside>
        </div>
      </div>`;

    const stats = el.querySelector('.cn-stats');
    const io = onVisible(stats, () => stats.querySelectorAll('[data-n]').forEach(b => countUp(b, +b.dataset.n)));
    stops.push(() => io.disconnect());
    sky(nodes, links, new Map(nodes.map(n => [n.id, n.name])), nbrs);
  },
};

function sky(allNodes, allLinks, names, nbrs) {
  const box = el.querySelector('.cn-sky'), canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d');
  const W = (lastW = box.clientWidth), H = W < 600 ? 480 : 700, dpr = devicePixelRatio || 1;
  // Big years (2016 has 300 artists) would crowd the sky, so draw the best-connected and the older artists they reach.
  const cap = W < 600 ? 90 : 170;
  const keepMine = new Set(allNodes.filter(n => n.mine).sort((a, b) => b.deg - a.deg).slice(0, cap).map(n => n.id));
  const reach = new Set(allLinks.filter(l => keepMine.has(l.a) || keepMine.has(l.b)).flatMap(l => [l.a, l.b]));
  const nodes = allNodes.filter(n => keepMine.has(n.id) || (!n.mine && reach.has(n.id)));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = allLinks.filter(l => byId.has(l.a) && byId.has(l.b)).map(l => ({ ...l, source: l.a, target: l.b }));
  const k = clamp(Math.sqrt(140 / nodes.length), 0.55, 1.2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = W < 600 ? 0.7 : 1;
  nodes.forEach(n => { n.r *= n.mine ? scale : 1; });

  for (const n of nodes) {
    if (!n.mine) continue;
    n.img = new Image();
    n.img.onload = () => { n.ready = true; };
    n.img.src = n.avatar;
  }
  // Start on a wide ring so the constellation pulls itself together.
  nodes.forEach((n, i) => { const a = (i / nodes.length) * Math.PI * 2; n.x = W / 2 + Math.cos(a) * W * 0.6; n.y = H / 2 + Math.sin(a) * H * 0.6; });

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(l => (l.strong ? 26 : 70) * scale).strength(l => (l.strong ? 0.5 : 0.025)))
    .force('charge', d3.forceManyBody().strength(d => (d.mine ? -70 : -18) * scale * k))
    .force('collide', d3.forceCollide(d => d.r + 2))
    .force('x', d3.forceX(W / 2).strength(W < 600 ? 0.08 : 0.045))
    .force('y', d3.forceY(H / 2).strength(W < 600 ? 0.025 : 0.07))
    .force('bound', () => nodes.forEach(n => { n.x = clamp(n.x, n.r + 4, W - n.r - 4); n.y = clamp(n.y, n.r + 4, H - n.r - 4); }))
    .stop();

  const labelled = new Set(nodes.filter(n => n.mine).sort((a, b) => b.deg - a.deg).slice(0, W < 600 ? 6 : 14).map(n => n.id));
  let hover = null, raf = 0;

  const draw = t => {
    ctx.clearRect(0, 0, W, H);
    const lit = hover ? new Set([hover.id, ...nbrs.get(hover.id).map(([o]) => o).filter(o => byId.has(o))]) : null;
    ctx.lineWidth = 1;
    ctx.strokeStyle = hover ? 'rgba(251,247,239,.02)' : 'rgba(251,247,239,.05)';
    ctx.beginPath();
    for (const l of links) if (!l.strong) { ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); }
    ctx.stroke();
    ctx.strokeStyle = hover ? 'rgba(233,162,59,.2)' : 'rgba(233,162,59,.6)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const l of links) if (l.strong) { ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); }
    ctx.stroke();
    if (hover) {
      ctx.strokeStyle = 'rgba(251,247,239,.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [o] of nbrs.get(hover.id)) { const n = byId.get(o); if (n) { ctx.moveTo(hover.x, hover.y); ctx.lineTo(n.x, n.y); } }
      ctx.stroke();
    }

    nodes.forEach((n, i) => {
      ctx.globalAlpha = lit && !lit.has(n.id) ? 0.18 : 1;
      if (!n.mine) {
        const tw = reduced ? 0.6 : 0.45 + 0.35 * Math.sin(t / 700 + i * 1.7);
        ctx.fillStyle = `rgba(251,247,239,${tw})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        return;
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.c; ctx.fill();
      if (n.ready) { ctx.clip(); ctx.drawImage(n.img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2); }
      else { ctx.fillStyle = '#0e0d0c'; ctx.font = `700 ${n.r * 0.8}px "Hanken Grotesk", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.name[0], n.x, n.y + 1); }
      ctx.restore();
      ctx.lineWidth = n.fresh ? 2.5 : 1.5;
      ctx.strokeStyle = n.fresh ? '#e9a23b' : n.c;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (n.fresh ? 2 : 1), 0, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // Hovered first, then by links; a label that would overlap one already drawn is skipped.
    const boxes = [];
    const want = nodes.filter(n => (lit ? lit.has(n.id) : labelled.has(n.id))).sort((a, b) => (b === hover) - (a === hover) || b.deg - a.deg);
    for (const n of want) {
      const txt = n.name.toUpperCase(), y = n.y + n.r + 5, w = ctx.measureText(txt).width;
      const bx = [n.x - w / 2 - 3, y - 2, n.x + w / 2 + 3, y + 14];
      if (boxes.some(o => bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])) continue;
      boxes.push(bx);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(14,13,12,.85)'; ctx.strokeText(txt, n.x, y);
      ctx.fillStyle = n === hover ? '#e9a23b' : 'rgba(251,247,239,.9)'; ctx.fillText(txt, n.x, y);
    }
  };

  const loop = t => { if (!reduced) sim.tick(); draw(t); raf = requestAnimationFrame(loop); };
  const describe = n => {
    const list = nbrs.get(n.id).sort((a, b) => b[1].strong - a[1].strong).slice(0, 7);
    return `<b>${esc(n.name)}</b>${n.mine ? `${plural(n.n, 'record')} this year${n.fresh ? ' · new' : ''}` : 'Already on the shelves'}
      <div class="cn-tip">${list.map(([o, l]) => `<span>${esc(names.get(o))} <em>${WHY[l.type] || l.type}${l.who && l.who !== names.get(o) && l.who !== n.name ? ` · ${esc(l.who)}` : ''}</em></span>`).join('')}
      ${nbrs.get(n.id).length > list.length ? `<span class="more">and ${nbrs.get(n.id).length - list.length} more</span>` : ''}</div>`;
  };
  const point = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  canvas.addEventListener('pointermove', e => {
    const [x, y] = point(e);
    const n = sim.find(x, y, 26);
    hover = n || null;
    canvas.style.cursor = n?.mine ? 'pointer' : 'default';
    if (n) showTip(describe(n), e.clientX, e.clientY); else hideTip();
    if (reduced) draw(0);
  });
  canvas.addEventListener('pointerleave', () => { hover = null; hideTip(); if (reduced) draw(0); });
  canvas.addEventListener('click', e => { const [x, y] = point(e); const n = sim.find(x, y, 26); if (n?.mine) location.href = `/artist/${n.id}/`; });
  el.querySelectorAll('.cn-hub').forEach(a => {
    a.addEventListener('pointerenter', () => { hover = byId.get(a.dataset.id); if (reduced) draw(0); });
    a.addEventListener('pointerleave', () => { hover = null; if (reduced) draw(0); });
  });

  if (reduced) {
    for (let i = 0; i < 400; i++) sim.tick();
    const redraw = () => draw(0);
    nodes.forEach(n => n.img && (n.img.onload = () => { n.ready = true; redraw(); }));
    redraw();
    return;
  }
  // Keep a gentle drift going, but only while the chapter is on screen.
  sim.alpha(1).alphaDecay(0.012).alphaTarget(0.012);
  const io = onVisible(box, on => {
    cancelAnimationFrame(raf);
    if (on) { box.classList.add('in'); raf = requestAnimationFrame(loop); }
  }, { once: false, threshold: 0.05 });
  stops.push(() => { io.disconnect(); cancelAnimationFrame(raf); sim.stop(); });
}
