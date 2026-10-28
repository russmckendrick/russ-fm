// Family Trees: Pete Frame-style rock family trees built from the collection.
// Bands are boxes laid out along time; musicians are coloured threads that run
// through one band's box and on into the next. A playhead draws the tree year by
// year; any band can become the root.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import {
  loadExplore, artistUrl, fanartUrl, sleeveUrl, albumHref, artistHref,
  sleeveCell, sleeveSheetUrl, describeLink, mountNav,
} from '/mockups/explore/shared.js';

mountNav('trees');
const d = await loadExplore();
await document.fonts.ready;
document.getElementById('loading').remove();

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NOW = 2026;
const CAP = 22;          // bands per tree
const PEOPLE_CAP = 44;   // threads per tree
const HEAD = 42;         // plate + sleeve strip
const ROW = 11;          // one musician row
const GAP = 24;          // between boxes
const SLV = 20;          // sleeve size in the strip
const SPEED = 7;         // years per second while playing
const INK = '#211F1B', PAPER = '#F7F5EE';
// thread inks: muted, distinct, none of them the amber accent
const PAL = ['#B0362B', '#2A5B8C', '#3B7A4C', '#6A4B98', '#1E7676', '#9B4A6C', '#B8602A', '#3C4C9C', '#7A5230', '#5E6C2C', '#C2414F', '#4A4844', '#2F7FA3', '#8A6A1A'];

const $ = id => document.getElementById(id);
const svg = d3.select('#svg');
const zoomG = d3.select('#zoomG'), orientG = d3.select('#orientG');
const gridG = d3.select('#gridG'), lanesG = d3.select('#lanesG'), threadsG = d3.select('#threadsG');
const labelsG = d3.select('#labelsG'), platesG = d3.select('#platesG'), sleevesG = d3.select('#sleevesG'), extrasG = d3.select('#extrasG');
const phLine = d3.select('#phLine'), phText = d3.select('#phText'), playheadG = d3.select('#playheadG');
const revealRect = d3.select('#revealRect');
const tip = $('tip'), panel = $('panel');

// ---- graph prep -------------------------------------------------------
const struct = d.artists.map(() => new Map()); // line-up links only (no guest spots)
for (const l of d.links) {
  if (l.why.some(w => w.type !== 'guest')) { struct[l.a].set(l.b, l.why); struct[l.b].set(l.a, l.why); }
}
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const linkWhy = new Map(d.links.map(l => [pairKey(l.a, l.b), l.why]));
const peopleOf = d.artists.map(() => []);
d.people.forEach((p, pi) => p.bands.forEach(b => peopleOf[b].push(pi)));

const spanCache = new Map();
function spanOf(i) {
  if (spanCache.has(i)) return spanCache.get(i);
  const a = d.artists[i];
  const ys = a.records.map(r => d.albums[r].y).filter(Boolean);
  const minY = ys.length ? Math.min(...ys) : null;
  const maxY = ys.length ? Math.max(...ys) : null;
  const group = (a.members || []).length > 0;
  let start = a.formed;
  // for a solo act "formed" is often the birth year; records are a better guide
  if (!group && start && a.born && start === a.born) start = minY ?? start + 18;
  if (start == null) start = group ? a.born : null;
  if (start == null) start = minY;
  if (start != null && minY != null) start = Math.min(start, minY);
  let end = Math.max(a.died ?? -Infinity, maxY ?? -Infinity);
  if (!isFinite(end)) end = null;
  if (start != null && end == null) end = start + 2;
  if (start != null) { start = Math.max(1930, start); end = Math.min(NOW, Math.max(end, start)); }
  const s = { start, end, guess: start == null };
  spanCache.set(i, s);
  return s;
}

function sharedPeople(a, b) { return peopleOf[b].filter(p => d.people[p].bands.includes(a)).length; }

function familyOf(seed) {
  const set = new Set([seed]);
  const hop1 = [...struct[seed].keys()]
    .sort((a, b) => sharedPeople(seed, b) - sharedPeople(seed, a) || d.artists[b].records.length - d.artists[a].records.length)
    .slice(0, 15);
  hop1.forEach(x => set.add(x));
  const score = new Map();
  for (const h of hop1) for (const o of struct[h].keys()) if (!set.has(o)) score.set(o, (score.get(o) || 0) + 1);
  const cands = [...score].sort((a, b) => b[1] - a[1] || d.artists[b[0]].records.length - d.artists[a[0]].records.length);
  for (const [o] of cands) { if (set.size >= CAP) break; set.add(o); }
  if (set.size === 1) for (const n of d.neighbours[seed]) { if (set.size >= 12) break; set.add(n.other); }
  return set;
}

function familyPeople(set, seed) {
  const seen = new Set(), out = [];
  d.people.forEach((p, pi) => {
    const fb = p.bands.filter(b => set.has(b));
    if (fb.length < 2) return;
    // Discogs sometimes has one person twice (Boz / Raymond Burrell)
    const k = [...fb].sort((a, b) => a - b).join(',') + '|' + p.name.split(' ').pop().toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ pi, name: p.name, thumb: p.thumb, bands: fb, all: p.bands });
  });
  out.sort((a, b) => b.bands.length - a.bands.length || b.bands.includes(seed) - a.bands.includes(seed));
  return out.slice(0, PEOPLE_CAP);
}

// flood colour for a band: its most-listened record's sleeve colour
function bandColour(a) {
  let best = null;
  for (const r of a.records) { const al = d.albums[r]; if (al.fl && (!best || (al.lis || 0) > (best.lis || 0))) best = al; }
  let fill = best ? best.fl : '#56524A';
  const c = d3.hcl(fill);
  if (c.l > 78) fill = d3.hcl(c.h, c.c, 62).formatHex();
  const lum = d3.hcl(fill).l;
  return { fill, text: lum > 60 ? INK : '#FBF8F1' };
}

// text width for plates, measured once with the real font
const mctx = document.createElement('canvas').getContext('2d');
function monoWidth(txt) { mctx.font = '9px "Fragment Mono"'; return mctx.measureText(txt).width; }
function plateWidth(txt) { mctx.font = '10px Michroma'; return mctx.measureText(txt).width + txt.length * 1.2 + 14; }

// ---- layout -----------------------------------------------------------
function layout(seed, vertical) {
  const set = familyOf(seed);
  const ppl = familyPeople(set, seed);
  const bands = [...set].map(i => ({ i, a: d.artists[i], ...spanOf(i), mem: [] }));
  const known = bands.filter(b => !b.guess);
  const med = known.length ? Math.round(d3.median(known, b => b.start)) : 1980;
  bands.forEach(b => { if (b.guess) { b.start = med; b.end = med + 2; } });
  const bi = new Map(bands.map(b => [b.i, b]));
  ppl.forEach((m, k) => { m.k = k; m.col = PAL[k % PAL.length]; m.bands.forEach(x => bi.get(x).mem.push(m)); });

  // lane order: start year, then pulled towards bands they share players with
  let order = bands.slice().sort((a, b) => a.start - b.start || a.i - b.i);
  let pos = new Map(order.map((b, k) => [b.i, k]));
  for (let it = 0; it < 10; it++) {
    const val = new Map();
    for (const b of order) {
      const others = b.mem.flatMap(m => m.bands.filter(x => x !== b.i));
      const bary = others.length ? d3.mean(others, x => pos.get(x)) : pos.get(b.i);
      val.set(b.i, 0.55 * bary + 0.45 * pos.get(b.i) + (b.i === seed ? -0.01 : 0));
    }
    order.sort((a, b) => val.get(a.i) - val.get(b.i));
    pos = new Map(order.map((b, k) => [b.i, k]));
  }

  // one very old start (an orchestra formed in 1904) shouldn't squash the axis:
  // such boxes are cut at the left edge and keep their real year in the label
  const starts = bands.map(b => b.start).sort((p, q) => p - q);
  const y0 = Math.floor(Math.max(starts[0], (d3.quantile(starts, 0.15) ?? starts[0]) - 8)) - 1;
  bands.forEach(b => { b.vs = Math.max(b.start, y0 + 0.4); b.cut = b.start < y0 + 0.4; b.end = Math.max(b.end, Math.ceil(b.vs)); });
  const y1 = Math.min(NOW + 1, d3.max(bands, b => b.end) + 2);
  const vw = innerWidth;
  const px = vertical ? 22 : Math.max(16, Math.min(44, (vw - 60) / (y1 - y0)));
  const X = y => (y - y0) * px;

  // drop each box as high as it fits (skyline packing), in tree order
  const placed = [];
  for (const b of order) {
    b.h = HEAD + Math.max(1, b.mem.length) * ROW + 6;
    b.x = X(b.vs);
    b.w = Math.max(px, X(b.end + 1) - X(b.vs));
    b.col = bandColour(b.a);
    b.label = b.a.name.toUpperCase();
    b.pw = plateWidth(b.label);
    const x0 = b.x - 8, x1 = b.x + Math.max(b.w, b.pw, 64) + 14;
    let y = 0;
    for (const q of placed) if (q.x0 < x1 && x0 < q.x1) y = Math.max(y, q.y + q.h + GAP);
    b.y = y;
    placed.push({ x0, x1, y, h: b.h });
  }
  const H = d3.max(order, b => b.y + b.h), W = X(y1);
  if (vertical) for (const b of order) b.y = H - b.y - b.h; // first boxes on the left once turned
  for (const b of order) {
    // musicians coming from boxes above sit at the top of the box
    const cy = x => { const o = bi.get(x); return o.y + o.h / 2; };
    b.mem.sort((m1, m2) => {
      const f = m => d3.mean(m.bands.filter(x => x !== b.i), cy) - (b.y + b.h / 2);
      return f(m1) - f(m2);
    });
    b.rowY = new Map(b.mem.map((m, r) => [m.k, b.y + HEAD + r * ROW + ROW / 2]));
  }

  // threads
  for (const m of ppl) {
    const bs = m.bands.map(x => bi.get(x)).sort((a, b) => a.start - b.start || pos.get(a.i) - pos.get(b.i));
    m.seq = bs.map(b => b.i);
    let entry = bs[0].vs;
    const yS = bs[0].rowY.get(m.k);
    let p = `M${X(entry) + 2},${yS}`;
    m.labels = [{ x: X(entry) + 5, y: yS, b: bs[0].i }];
    for (let j = 1; j < bs.length; j++) {
      const A = bs[j - 1], B = bs[j];
      const t = Math.min(Math.max(B.vs, entry), B.end);
      const yA = A.rowY.get(m.k), yB = B.rowY.get(m.k);
      const xt = X(t) + (t === B.vs ? 0 : px / 2);
      let x0 = Math.min(xt - 9, A.x + A.w - 3);
      x0 = Math.max(x0, X(entry) + 3);
      const x1 = Math.max(xt + 9, B.x + 3);
      const mx = (x0 + x1) / 2;
      p += `H${x0.toFixed(1)}C${mx.toFixed(1)},${yA} ${mx.toFixed(1)},${yB} ${x1.toFixed(1)},${yB}`;
      m.labels.push({ x: x1 + 3, y: yB, b: B.i });
      entry = t;
    }
    const last = bs[bs.length - 1];
    p += `H${(last.x + last.w - 3).toFixed(1)}`;
    m.d = p;
  }

  // sleeves along each box at their original year
  const sleeves = [];
  for (const b of bands) {
    const byY = new Map();
    const recs = b.a.records.filter(r => d.albums[r].y).sort((r1, r2) => d.albums[r1].y - d.albums[r2].y);
    for (const r of recs.slice(0, 48)) {
      const yr = d.albums[r].y;
      const k = byY.get(yr) || 0; byY.set(yr, k + 1);
      sleeves.push({ r, b: b.i, y: yr, cx: Math.max(b.x + SLV / 2 + 2, X(yr) + px / 2) + k * 5, cy: b.y + 29 });
    }
  }

  // guest spots and aliases inside the tree: dotted ink lines
  const extras = [];
  const list = [...set];
  for (let u = 0; u < list.length; u++) for (let v = u + 1; v < list.length; v++) {
    const why = linkWhy.get(pairKey(list[u], list[v]));
    if (!why) continue;
    for (const w of why) {
      if (w.type !== 'guest' && w.type !== 'alias') continue;
      const A = bi.get(list[u]), B = bi.get(list[v]);
      const t = w.type === 'guest' ? (d.albums[w.album].y || Math.max(A.start, B.start)) : Math.max(A.start, B.start);
      const xa = Math.min(Math.max(X(t) + px / 2, A.x + 4), A.x + A.w - 4);
      const xb = Math.min(Math.max(X(t) + px / 2, B.x + 4), B.x + B.w - 4);
      const ya = A.y + (A.y < B.y ? A.h : 0), yb = B.y + (B.y < A.y ? B.h : 0);
      extras.push({ key: `${pairKey(A.i, B.i)}-${extras.length}`, type: w.type, w, a: A.i, b: B.i, t,
        d: `M${xa},${ya}C${xa},${(ya + yb) / 2} ${xb},${(ya + yb) / 2} ${xb},${yb}` });
      if (extras.length > 40) break;
    }
  }

  // ticker events: when each box begins
  const events = order.map(b => ({ y: b.start, b })).sort((a, b) => a.y - b.y);

  return { seed, vertical, bands, order, bi, ppl, sleeves, extras, events, y0, y1, px, X, W, H };
}

// ---- state ------------------------------------------------------------
const params = new URLSearchParams(location.search);
let L = null;
let year = 0, iyear = null, playing = false, lastT = 0;
let trail = [];
let selected = null;

const allLanes = () => d3.selectAll('#lanesG .lane, #platesG .lane');
function headerH() { return document.querySelector('.t-head').offsetHeight; }
const isVertical = () => innerWidth < 700;

// ---- render -----------------------------------------------------------
function render(animate) {
  const dur = animate && !reduce ? 800 : 0;
  const t = svg.transition('lay').duration(dur).ease(d3.easeCubicInOut);
  const { X, H, W } = L;

  orientG.transition(t).attr('transform', L.vertical ? `translate(${H},0) rotate(90)` : 'translate(0,0) rotate(0)');

  // decade grid
  const decades = d3.range(Math.ceil(L.y0 / 10) * 10, L.y1 + 1, 10);
  const gl = gridG.selectAll('g.dec').data(decades, v => v).join(enter => {
    const g = enter.append('g').attr('class', 'dec').style('opacity', 0);
    g.append('line'); g.append('text');
    return g;
  }, u => u, exit => exit.transition(t).style('opacity', 0).remove());
  gl.transition(t).style('opacity', 1).attr('transform', v => `translate(${X(v)},0)`);
  gl.select('line').transition(t).attr('y1', -18).attr('y2', H + 10);
  gl.select('text').text(v => v)
    .attr('text-anchor', L.vertical ? 'end' : 'middle')
    .attr('dy', L.vertical ? '0.32em' : '0em')
    .transition(t)
    .attr('transform', L.vertical ? `translate(0,${H + 14}) rotate(-90)` : 'translate(0,-24) rotate(0)');

  // boxes
  const lanes = lanesG.selectAll('g.lane').data(L.order, b => b.i).join(enter => {
    const g = enter.append('g').attr('class', 'lane').attr('tabindex', 0).attr('role', 'button')
      .attr('transform', b => `translate(${b.x},${b.y})`).style('opacity', 0);
    g.append('rect').attr('class', 'box').attr('width', b => b.w).attr('height', b => b.h);
    return g;
  }, u => u, exit => exit.transition(t).style('opacity', 0).remove());
  // name plates sit above the threads so the lines pass behind them
  const plates = platesG.selectAll('g.lane').data(L.order, b => b.i).join(enter => {
    const g = enter.append('g').attr('class', 'lane plate')
      .attr('transform', b => `translate(${b.x},${b.y})`).style('opacity', 0);
    g.append('rect').attr('class', 'plate-bg').attr('height', 17);
    g.append('text').attr('class', 'bname').attr('x', 7).attr('y', 12.5);
    g.append('text').attr('class', 'byears').attr('y', -5);
    return g;
  }, u => u, exit => exit.transition(t).style('opacity', 0).remove());
  plates.attr('data-b', b => b.i).transition(t).style('opacity', 1).attr('transform', b => `translate(${b.x},${b.y})`);
  lanes.attr('data-b', b => b.i).attr('aria-label', b => `${b.a.name}, ${b.guess ? 'years unknown' : `${b.start} to ${b.end}`}`)
    .classed('seed', b => b.i === L.seed).classed('guess', b => b.guess).classed('cut', b => b.cut);
  lanes.transition(t).style('opacity', 1).attr('transform', b => `translate(${b.x},${b.y})`);
  lanes.select('.box').transition(t).attr('width', b => b.w).attr('height', b => b.h).attr('stroke', b => b.col.fill);
  plates.select('.plate-bg').attr('width', b => b.pw).attr('fill', b => b.col.fill);
  plates.select('.bname').text(b => b.label).attr('fill', b => b.col.text);
  plates.select('.byears').text(b => b.guess ? 'years unknown' : `${b.cut ? '← ' : ''}${b.start}–${b.end === NOW ? '' : b.end}`);

  // sleeves (from the atlas)
  const sl = sleevesG.selectAll('a.slv-a').data(L.sleeves, s => `${s.b}-${s.r}`).join(enter => {
    const a = enter.append('a').attr('class', 'slv-a').attr('target', '_blank').attr('rel', 'noopener')
      .attr('transform', s => sleeveTransform(s));
    const g = a.append('g').attr('class', 'slv');
    g.each(function (s) {
      const c = sleeveCell(d, s.r);
      const inner = d3.select(this).append('svg').attr('x', -SLV / 2).attr('y', -SLV / 2).attr('width', SLV).attr('height', SLV)
        .attr('viewBox', `${c.x} ${c.y} ${c.size} ${c.size}`);
      inner.append('image').attr('href', sleeveSheetUrl(c.sheet)).attr('width', 4096).attr('height', 4096);
    });
    g.append('rect').attr('x', -SLV / 2).attr('y', -SLV / 2).attr('width', SLV).attr('height', SLV);
    a.append('title').text(s => `${d.albums[s.r].t} (${s.y})`);
    return a;
  }, u => u, exit => exit.remove());
  sl.attr('href', s => albumHref(d.albums[s.r])).attr('data-b', s => s.b);
  sl.transition(t).attr('transform', s => sleeveTransform(s));

  // threads: old ones fade, new ones draw on once the boxes have moved
  threadsG.selectAll('g.tset').interrupt().transition().duration(dur ? 200 : 0).style('opacity', 0).remove();
  labelsG.selectAll('g.lset').interrupt().transition().duration(dur ? 200 : 0).style('opacity', 0).remove();
  extrasG.selectAll('g.eset').interrupt().transition().duration(dur ? 200 : 0).style('opacity', 0).remove();

  const ts = threadsG.append('g').attr('class', 'tset');
  const th = ts.selectAll('g.th').data(L.ppl).join('g').attr('class', 'th').attr('data-p', m => m.k);
  th.append('path').attr('class', 'thread').attr('d', m => m.d).attr('stroke', m => m.col).attr('data-p', m => m.k);
  th.append('path').attr('class', 'thread-hit').attr('d', m => m.d).attr('data-p', m => m.k);
  if (dur) {
    th.select('.thread').attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', 1)
      .transition().delay((m, k) => dur * 0.75 + k * 18).duration(900).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0)
      .on('end', function () { d3.select(this).attr('pathLength', null).attr('stroke-dasharray', null); });
  }

  const ls = labelsG.append('g').attr('class', 'lset').style('opacity', dur ? 0 : 1);
  const lg = ls.selectAll('g').data(L.ppl.flatMap(m => m.labels.map(l => ({ ...l, m })))).join('g')
    .attr('class', 'mlabel').attr('data-p', l => l.m.k).attr('transform', l => `translate(${l.x},${l.y})`);
  lg.append('rect').attr('x', -3).attr('y', -6).attr('height', 12).attr('width', l => monoWidth(l.m.name) + 6);
  lg.append('text').attr('dy', '0.33em').attr('fill', l => l.m.col).text(l => l.m.name);
  if (dur) ls.transition().delay(dur * 0.9).duration(500).style('opacity', 1);

  const es = extrasG.append('g').attr('class', 'eset').style('opacity', dur ? 0 : 1);
  const eg = es.selectAll('g').data(L.extras).join('g');
  eg.append('path').attr('class', e => `extra ${e.type}`).attr('d', e => e.d);
  eg.append('path').attr('class', 'extra-hit').attr('d', e => e.d).attr('data-e', (e, k) => k);
  if (dur) es.transition().delay(dur).duration(500).style('opacity', 1);

  playheadG.attr('data-v', L.vertical ? 1 : 0);
  phLine.attr('y1', -14).attr('y2', H + 8);

  // header text
  $('seedName').textContent = d.artists[L.seed].name;
  $('summary').textContent = `${L.bands.length} bands · ${L.ppl.length} musicians · ${L.y0 + 1}–${Math.min(NOW, L.y1 - 2)}`;
  $('scrub').min = L.y0; $('scrub').max = L.y1;
  document.querySelectorAll('.t-chip[data-seed]').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.seed === L.seed)));
  renderBack();
}

function sleeveTransform(s) {
  return L.vertical ? `translate(${s.cx},${s.cy}) rotate(-90)` : `translate(${s.cx},${s.cy}) rotate(0)`;
}

// ---- playhead ---------------------------------------------------------
function setYear(v, force) {
  year = Math.max(L.y0, Math.min(L.y1, v));
  const x = L.X(year);
  revealRect.attr('width', x + 4000);
  playheadG.attr('transform', `translate(${x},0)`).classed('done', year >= L.y1 && !playing);
  phText.text(Math.floor(year))
    .attr('text-anchor', L.vertical ? 'end' : 'middle')
    .attr('transform', L.vertical ? `translate(0,${L.H + 12}) rotate(-90)` : 'translate(0,-38)')
    .attr('dy', L.vertical ? '0.32em' : 0);
  $('scrub').value = year;
  const iy = Math.floor(year * 2) / 2;
  $('yearOut').textContent = year >= L.y1 ? '' : Math.floor(year);
  if (iy !== iyear || force) {
    iyear = iy;
    sleevesG.selectAll('.slv').classed('on', s => s.y + 0.5 <= year || year >= L.y1);
    ticker();
  }
}

function ticker() {
  const el = $('ticker');
  if (year >= L.y1 && !playing) {
    el.innerHTML = 'Hover or tap a thread to follow a musician. Click a band for its line-up and records; double-click to make it the root.';
    return;
  }
  const ev = L.events.filter(e => e.y <= year).pop();
  if (!ev) { el.textContent = ''; return; }
  const names = ev.b.mem.map(m => m.name);
  const withTxt = names.length ? ` — with ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}` : '';
  el.innerHTML = `${ev.y} · <em>${esc(ev.b.a.name)}</em>${esc(withTxt)}`;
}

const PLAY_ICON = '<svg viewBox="0 0 10 10"><path d="M1 0l9 5-9 5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 10 10"><path d="M1 0h3v10H1zM6 0h3v10H6z"/></svg>';
function setPlaying(on) {
  playing = on;
  $('play').innerHTML = on ? PAUSE_ICON : PLAY_ICON;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) {
    if (year >= L.y1 - 0.01) setYear(L.y0);
    lastT = performance.now();
    requestAnimationFrame(tick);
  } else setYear(year, true);
}
function tick(now) {
  if (!playing) return;
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const v = year + dt * SPEED;
  if (v >= L.y1) { setYear(L.y1); setPlaying(false); return; }
  setYear(v);
  requestAnimationFrame(tick);
}

// ---- zoom & pan -------------------------------------------------------
const zoom = d3.zoom().scaleExtent([0.25, 3])
  .filter(e => (e.type === 'wheel' ? e.ctrlKey : !e.button) && !e.target.closest?.('.t-panel'))
  .on('zoom', e => zoomG.attr('transform', e.transform));
svg.call(zoom).on('dblclick.zoom', null);
svg.on('wheel.pan', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const k = d3.zoomTransform(svg.node()).k;
  zoom.translateBy(svg, -e.deltaX / k, -e.deltaY / k);
}, { passive: false });

function homeTransform() {
  const top = headerH() + 44;
  const seed = L.bi.get(L.seed);
  if (L.vertical) {
    const k = 0.82;
    const sx = (L.H - seed.y - seed.h / 2) * k; // seed column centre on screen, before translate
    let tx = innerWidth / 2 - sx;
    tx = Math.min(46, Math.max(innerWidth - 16 - L.H * k, tx));
    return d3.zoomIdentity.translate(tx, top - 10).scale(k);
  }
  const avail = innerHeight - top - 70;
  const ty = top - Math.max(0, Math.min(seed.y - 40, L.H - avail));
  return d3.zoomIdentity.translate(24, ty).scale(1);
}
function fitTransform() {
  const top = headerH() + 44;
  const sw = L.vertical ? L.H : L.W, sh = L.vertical ? L.W : L.H;
  const k = Math.max(0.25, Math.min(1, (innerWidth - 60) / (sw + 20), (innerHeight - top - 70) / (sh + 20)));
  return d3.zoomIdentity.translate(Math.max(24, (innerWidth - sw * k) / 2), top).scale(k);
}
function goHome(animate) {
  const tr = homeTransform();
  (animate && !reduce ? svg.transition().duration(800).ease(d3.easeCubicInOut) : svg).call(zoom.transform, tr);
}

// ---- re-rooting --------------------------------------------------------
function setSeed(i, { animate = true, replay = false, push = true } = {}) {
  if (L && i === L.seed && !replay) return;
  if (push && L) trail.push(L.seed);
  L = layout(i, isVertical());
  clearFocus();
  render(animate && !!document.querySelector('.lane'));
  history.replaceState(null, '', `?seed=${d.artists[i].slug}`);
  if (replay && !reduce) { setYear(L.y0, true); setPlaying(true); } else { setPlaying(false); setYear(L.y1, true); }
  goHome(animate);
  if (!panel.hidden) openPanel(i);
}

function renderBack() {
  let btn = document.querySelector('.t-back');
  if (!trail.length) { btn?.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 't-chip t-back';
    btn.type = 'button';
    btn.addEventListener('click', () => { const p = trail.pop(); setSeed(p, { push: false }); });
    $('picker').prepend(btn);
  }
  btn.textContent = `← ${d.artists[trail[trail.length - 1]].name}`;
}

// ---- focus: one musician or one band -----------------------------------
function focusPerson(k) {
  const m = L.ppl[k];
  svg.classed('focus', true);
  threadsG.selectAll('.thread').classed('hi', x => x.k === k);
  labelsG.selectAll('.mlabel').classed('hi', l => l.m.k === k);
  allLanes().classed('hi', b => m.bands.includes(b.i));
  sleevesG.selectAll('.slv-a').classed('hi', s => m.bands.includes(s.b));
}
function focusBand(i) {
  const b = L.bi.get(i);
  const ks = new Set(b.mem.map(m => m.k));
  const bandsHi = new Set([i, ...b.mem.flatMap(m => m.bands)]);
  svg.classed('focus', true);
  threadsG.selectAll('.thread').classed('hi', m => ks.has(m.k));
  labelsG.selectAll('.mlabel').classed('hi', l => ks.has(l.m.k));
  allLanes().classed('hi', x => bandsHi.has(x.i));
  sleevesG.selectAll('.slv-a').classed('hi', s => bandsHi.has(s.b));
}
function clearFocus() {
  svg.classed('focus', false);
  if (selected != null && L.bi.has(selected)) focusBand(selected);
}

const asBand = (i, m) => d.artists[i].name.toLowerCase() === m.name.toLowerCase() ? `${d.artists[i].name} (solo)` : d.artists[i].name;
function personTip(m) {
  const names = m.seq.map(i => esc(asBand(i, m)));
  const yrs = m.seq.map(i => { const b = L.bi.get(i); return `${esc(b.a.name)} ${b.guess ? '?' : `${b.start}–${b.end === NOW ? '' : b.end}`}`; });
  const outside = m.all.filter(i => !L.bi.has(i));
  const thumb = m.thumb ? `<img src="${esc(m.thumb)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="who">${thumb}<i style="background:${m.col}"></i>${esc(m.name)}</div>
    <div class="path">with ${names.join(' → with ')}</div>
    <div class="yrs">band years: ${yrs.join(' · ')}${outside.length ? `<br>also in ${outside.map(i => esc(d.artists[i].name)).join(', ')}` : ''}</div>`;
}
function showTip(html, e) {
  tip.innerHTML = html;
  tip.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 16;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 70) y = e.clientY - r.height - 14;
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() { tip.hidden = true; }

svg.on('pointerover', e => {
  const p = e.target.closest('[data-p]');
  const ex = e.target.closest('[data-e]');
  const lane = e.target.closest('.lane');
  if (p) { const m = L.ppl[+p.dataset.p]; focusPerson(m.k); showTip(personTip(m), e); }
  else if (ex) {
    const x = L.extras[+ex.dataset.e];
    showTip(`<div class="path">${esc(describeLink(d, x.w, x.a, x.b))}</div>`, e);
  } else if (lane && e.pointerType === 'mouse') { focusBand(+lane.dataset.b); }
});
svg.on('pointermove', e => { if (!tip.hidden) moveTip(e); });
svg.on('pointerout', e => {
  const to = e.relatedTarget;
  if (to && (to.closest?.('[data-p]') || to.closest?.('[data-e]'))) return;
  if (e.pointerType === 'mouse' || !e.pointerType) { hideTip(); svg.classed('focus', false); clearFocus(); }
});

let lastPointer = 'mouse';
svg.on('pointerdown.type', e => { lastPointer = e.pointerType; });
svg.on('click', e => {
  let lane = e.target.closest('.lane');
  // with a mouse, a click on a thread inside a box opens that box
  if (!lane && e.target.closest('[data-p]') && lastPointer === 'mouse') {
    lane = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest?.('.lane')).find(Boolean);
  }
  if (e.target.closest('a.slv-a')) return;
  if (lane) { openPanel(+lane.dataset.b); return; }
  if (!e.target.closest('[data-p]')) { hideTip(); svg.classed('focus', false); clearFocus(); }
});
svg.on('dblclick', e => {
  const lane = e.target.closest('.lane') || document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest?.('.lane')).find(Boolean);
  if (lane) setSeed(+lane.dataset.b);
});
svg.on('keydown', e => {
  const lane = e.target.closest?.('.lane');
  if (!lane) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.shiftKey ? setSeed(+lane.dataset.b) : openPanel(+lane.dataset.b);
  }
});

// ---- panel ------------------------------------------------------------
function trimBio(s) {
  if (!s) return '';
  if (/[.!?]$/.test(s)) return s;
  const cut = s.lastIndexOf('. ');
  return cut > 160 ? s.slice(0, cut + 1) : s.replace(/\s+\S*$/, '') + '…';
}
function openPanel(i) {
  const a = d.artists[i];
  const b = L.bi.get(i);
  selected = i;
  allLanes().classed('sel', x => x.i === i);
  focusBand(i);
  const img = a.fanart?.length ? fanartUrl(a) : artistUrl(a, 'medium');
  const pos = a.focus ? `${(a.focus[0] * 100).toFixed(0)}% ${(a.focus[1] * 100).toFixed(0)}%` : '50% 30%';
  const meta = [a.from, b && !b.guess ? `${b.start}–${b.end === NOW ? '' : b.end}` : null, a.genre].filter(Boolean).join(' · ');
  const mem = b ? b.mem : [];
  const threadNames = new Set(mem.map(m => m.name.toLowerCase()));
  const others = (a.members || []).filter(n => !threadNames.has(n.toLowerCase()));
  const links = [];
  if (b) for (const n of d.neighbours[i]) {
    if (!L.bi.has(n.other)) continue;
    const w = n.why.find(x => x.type !== 'bandmate') || n.why[0];
    const who = n.why.filter(x => x.type === 'bandmate').map(x => x.who);
    let s = w.type === 'bandmate' ? `${who.join(', ')} ${who.length > 1 ? 'played' : 'played'} in both` : describeLink(d, w, i, n.other);
    links.push({ other: n.other, s });
  }
  const recs = a.records.slice().sort((r1, r2) => (d.albums[r1].y || 9999) - (d.albums[r2].y || 9999));
  panel.innerHTML = `
    <div class="p-img"><img src="${img}" alt="" style="object-position:${pos}"><div class="bar" style="background:${b ? b.col.fill : INK}"></div>
      <button class="p-close" type="button" aria-label="Close">×</button></div>
    <div class="p-body">
      <h2 class="p-name">${esc(a.name)}</h2>
      <div class="p-meta">${esc(meta)}</div>
      <p class="p-bio">${esc(trimBio(a.bio))}</p>
      <div class="p-acts">
        ${i === L.seed
          ? `<button class="t-btn" type="button" data-act="replay">${PLAY_ICON} Replay tree</button>`
          : `<button class="t-btn" type="button" data-act="root">Re-root here</button>`}
        <a class="t-btn ghost" href="${artistHref(a)}" target="_blank" rel="noopener">russ.fm ↗</a>
      </div>
      ${mem.length ? `<div class="p-h">In this tree</div><ul class="p-mem">${mem.map(m => `
        <li data-pk="${m.k}"><i style="background:${m.col}"></i><span class="nm">${esc(m.name)}</span>
          <span class="also">also with ${m.bands.filter(x => x !== i).map(x => `<button type="button" data-go="${x}">${esc(asBand(x, m))}</button>`).join(', ')}</span></li>`).join('')}</ul>` : ''}
      ${others.length ? `<div class="p-h">Other members on Discogs</div><div class="p-other">${others.map(esc).join(' · ')}</div>` : ''}
      ${links.length ? `<div class="p-h">Connections here</div><ul class="p-links">${links.map(l => `
        <li><button type="button" data-go="${l.other}">${esc(d.artists[l.other].name)}</button>: ${esc(l.s)}</li>`).join('')}</ul>` : ''}
      <div class="p-h">In the collection (${recs.length})</div>
      <div class="p-recs">${recs.slice(0, 40).map(r => { const al = d.albums[r]; return `
        <a href="${albumHref(al)}" target="_blank" rel="noopener" title="${esc(al.t)}"><img loading="lazy" src="${sleeveUrl(al, 'medium')}" alt="${esc(al.t)}"><span>${al.y || ''} ${esc(al.t)}</span></a>`; }).join('')}</div>
      <p class="p-note">Discogs lists who played in each band, not when, so the threads follow the order the bands began.</p>
    </div>`;
  panel.style.top = innerWidth < 700 ? '' : `${headerH()}px`;
  panel.hidden = false;
  panel.scrollTop = 0;
}
function closePanel() {
  panel.hidden = true;
  selected = null;
  allLanes().classed('sel', false);
  svg.classed('focus', false);
}
panel.addEventListener('click', e => {
  if (e.target.closest('.p-close')) return closePanel();
  const act = e.target.closest('[data-act]');
  if (act?.dataset.act === 'root') return setSeed(selected);
  if (act?.dataset.act === 'replay') { setYear(L.y0, true); setPlaying(true); return; }
  const go = e.target.closest('[data-go]');
  if (go) openPanel(+go.dataset.go);
});
panel.addEventListener('pointerover', e => {
  const li = e.target.closest('[data-pk]');
  if (li) focusPerson(+li.dataset.pk);
});
panel.addEventListener('pointerleave', () => { if (selected != null) focusBand(selected); });

// ---- picker: the biggest families -----------------------------------------
function buildPicker() {
  const cands = [];
  for (let i = 0; i < d.artists.length; i++) {
    if (struct[i].size < 4 || /orchestra|symphon|philharmon|ensemble|friends/i.test(d.artists[i].name)) continue;
    const set = familyOf(i);
    const ppl = familyPeople(set, i);
    const own = ppl.filter(m => m.bands.includes(i)).length;
    cands.push({ i, set, n: ppl.length, score: ppl.length + own * 3 + Math.min(8, d.artists[i].records.length) * 0.5 });
  }
  cands.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 12) break;
    const dup = picked.some(p => {
      let inter = 0; for (const x of c.set) if (p.set.has(x)) inter++;
      return inter / (c.set.size + p.set.size - inter) > 0.45;
    });
    if (!dup) picked.push(c);
  }
  $('picker').innerHTML = picked.map(p => {
    const col = bandColour(d.artists[p.i]).fill;
    return `<button class="t-chip" type="button" data-seed="${p.i}"><i style="background:${col}"></i>${esc(d.artists[p.i].name)}<b>${p.n}</b></button>`;
  }).join('');
  $('picker').addEventListener('click', e => {
    const c = e.target.closest('[data-seed]');
    if (c) setSeed(+c.dataset.seed, { animate: true });
  });
  return picked;
}

// search: any artist with line-up links
const findable = d.artists.map((a, i) => ({ a, i })).filter(x => struct[x.i].size > 0).sort((p, q) => p.a.name.localeCompare(q.a.name));
$('artistList').innerHTML = findable.map(x => `<option value="${esc(x.a.name)}"></option>`).join('');
$('find').addEventListener('change', e => {
  const v = e.target.value.trim().toLowerCase();
  const hit = findable.find(x => x.a.name.toLowerCase() === v) || findable.find(x => x.a.name.toLowerCase().startsWith(v));
  if (hit) { setSeed(hit.i); e.target.value = ''; e.target.blur(); }
});

// ---- controls ---------------------------------------------------------
$('play').addEventListener('click', () => setPlaying(!playing));
$('scrub').addEventListener('input', e => { if (playing) setPlaying(false); setYear(+e.target.value); });
$('fit').addEventListener('click', () => svg.transition().duration(reduce ? 0 : 600).call(zoom.transform, fitTransform()));
$('zoomIn').addEventListener('click', () => svg.transition().duration(reduce ? 0 : 250).call(zoom.scaleBy, 1.3));
$('zoomOut').addEventListener('click', () => svg.transition().duration(reduce ? 0 : 250).call(zoom.scaleBy, 1 / 1.3));
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') { closePanel(); hideTip(); }
  else if (e.key === ' ' && !e.target.closest('.lane, button, a')) { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'ArrowRight' && !e.target.closest('input')) { setPlaying(false); setYear(Math.floor(year) + 1); }
  else if (e.key === 'ArrowLeft' && !e.target.closest('input')) { setPlaying(false); setYear(Math.ceil(year) - 1); }
});
let rz;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    const v = isVertical();
    const pxNow = L.px;
    const fresh = layout(L.seed, v);
    if (v !== L.vertical || Math.abs(fresh.px - pxNow) > 1) {
      L = fresh;
      render(false);
      setYear(Math.min(year, L.y1), true);
      goHome(false);
    }
  }, 150);
});

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- start ------------------------------------------------------------
const picked = buildPicker();
const want = d.artistBySlug.get(params.get('seed'));
const fallback = d.artistBySlug.get('king-crimson') ?? picked[0]?.i ?? 0;
const start = want ?? fallback;
L = layout(start, isVertical());
render(false);
goHome(false);
if (params.has('fit')) svg.call(zoom.transform, fitTransform());
if (params.has('year')) { setPlaying(false); setYear(+params.get('year'), true); }
else if (reduce || params.has('still')) { setPlaying(false); setYear(L.y1, true); }
else { setYear(L.y0, true); setPlaying(true); }
if (params.has('panel')) openPanel(start);
