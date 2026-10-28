// The Thread: an endless vertical feed of hops through the collection.
// Up = next hop, sideways = another way out of the previous card, tap = details.
import {
  loadExplore, sleeveUrl, artistUrl, fanartUrl, albumHref, artistHref,
  ytThumb, ytEmbed, describeLink, shuffle, pick, mountNav,
} from '/mockups/explore/shared.js';

mountNav('thread');
const d = await loadExplore();

const $ = id => document.getElementById(id);
const stage = $('stage'), drawer = $('drawer'), drawerBody = $('drawerBody'), scrim = $('scrim');
const trailList = $('trailList');
const A = i => d.artists[i], R = i => d.albums[i];
const key = (kind, i) => kind + ':' + i;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const rmq = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = rmq.matches;
rmq.addEventListener('change', e => { reduced = e.matches; layout(); syncVideo(); });
const wide = matchMedia('(min-width: 1180px)');

// ---------------------------------------------------------------- lookups
const VARIOUS = d.artistBySlug.get('various');
const personByName = new Map(d.people.map(p => [p.name, p]));
const COLOURS = ['clear', 'white', 'red', 'blue', 'orange', 'yellow', 'gold', 'green', 'silver', 'purple', 'pink', 'black', 'turquoise', 'cream', 'violet', 'grey', 'brown', 'bronze'];
const vcBase = vc => {
  if (!vc) return null;
  const w = vc.toLowerCase().split(/[^a-z]+/);
  if (w.some(x => x === 'crystal' || x === 'transparent' || x === 'clear') && !w.some(x => COLOURS.includes(x) && x !== 'clear')) return 'clear';
  return w.find(x => COLOURS.includes(x)) || null;
};
const byVc = new Map();
d.albums.forEach((r, i) => { const b = vcBase(r.vc); if (b) { if (!byVc.has(b)) byVc.set(b, []); byVc.get(b).push(i); } });
const famName = new Map(d.families.map(f => [f.key, f.name]));
const wellConnected = d.artists.map((a, i) => i).filter(i => i !== VARIOUS && d.neighbours[i].length >= 4 && A(i).fanart.length);

const shareArtist = (j, r) => R(j).a.some(x => r.a.includes(x));
const WHY_RANK = { bandmate: 0, member: 1, group: 2, guest: 3, alias: 4 };
const bestWhy = whys => [...whys].sort((x, y) => WHY_RANK[x.type] - WHY_RANK[y.type])[0];
const lab = l => String(l || '').replace(/\s*\(\d+\)$/, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function cleanTitle(t, names = []) {
  let s = t || '';
  for (const n of names) {
    if (!n) continue;
    const re = new RegExp('^\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-–—:.]\\s*', 'i');
    s = s.replace(re, '');
  }
  s = s.replace(/\s*[([](official|music|lyric|hd|hq|remaster|audio|video|4k|visuali)[^)\]]*[)\]]/gi, '').replace(/^["“]|["”]$/g, '').trim();
  return s || t || 'Untitled';
}
const curly = t => String(t || '').replace(/"([^"]*)"/g, '“$1”');
const linkText = (w, from, to) => curly(describeLink(d, w, from, to));
const vidTitle = (v, r) => cleanTitle(v[1], [r?.by, ...(r?.a || []).map(i => A(i).name)]);

// ---------------------------------------------------------------- edges
// An edge is a way out of a card: { kind:'a'|'r', i, type, text, base, vid?, person? }
function artistOuts(ai) {
  const a = A(ai), out = [];
  for (const { other, why } of d.neighbours[ai]) {
    if (other === VARIOUS) continue;
    const w = bestWhy(why);
    out.push({ kind: 'a', i: other, type: w.type, text: linkText(w, ai, other), base: 3.2, person: w.type === 'bandmate' || w.type === 'member' ? personByName.get(w.who) : null });
    for (const g of why) {
      if (g.type === 'guest' && g.guest === ai) out.push({ kind: 'r', i: g.album, type: 'guestspot', text: `${a.name} guests on “${g.track}” from ${R(g.album).t}`, base: 2.6 });
    }
  }
  const recs = a.records;
  for (const ri of shuffle(recs).slice(0, 4)) {
    const r = R(ri);
    out.push({ kind: 'r', i: ri, type: 'record', text: recs.length > 1 ? `One of ${recs.length} ${a.name} records in the collection` : `The only ${a.name} record in the collection`, base: 1.7 + Math.min(1, (r.lis || 0) / 400000) * 0.4 });
  }
  const withV = recs.filter(ri => R(ri).v.length);
  if (withV.length) {
    const ri = pick(withV), r = R(ri);
    const v = r.v.find(x => x[2] === 'video') || r.v.find(x => x[2] === 'live') || r.v[0];
    out.push({ kind: 'r', i: ri, type: 'video', vid: v, text: `${a.name} on film: “${vidTitle(v, r)}”, from ${r.t}`, base: 2.2 });
  }
  return out;
}

function albumOuts(ri) {
  const r = R(ri), out = [];
  for (const ai of r.a) {
    for (const { other, why } of d.neighbours[ai]) {
      for (const w of why) if (w.type === 'guest' && w.album === ri && w.host === ai) out.push({ kind: 'a', i: w.guest, type: 'guest', text: linkText(w, ai, other), base: 3.3 });
    }
  }
  for (const ai of r.a) if (ai !== VARIOUS) out.push({ kind: 'a', i: ai, type: 'artist', text: `${r.t} is by ${A(ai).name}`, base: 2.1 });

  const labels = [];
  for (const l of new Set(r.l)) {
    const list = (d.byLabel.get(l) || []).filter(j => j !== ri && !shareArtist(j, r));
    if (!list.length) continue;
    const same = list.filter(j => r.y && R(j).y === r.y);
    const j = same.length ? pick(same) : pick(list);
    labels.push({ kind: 'r', i: j, type: 'label', text: same.length ? `Same label, same year: ${lab(l)}, ${r.y}` : `Also on ${lab(l)}`, base: 2.7 - Math.log10(list.length + 1) * 0.45 + (same.length ? 0.4 : 0) });
  }
  out.push(...labels.sort((x, y) => y.base - x.base).slice(0, 2));

  const vb = vcBase(r.vc);
  if (vb) {
    const exact = d.byColour.get(r.vc).filter(j => j !== ri && !shareArtist(j, r));
    const loose = (byVc.get(vb) || []).filter(j => j !== ri && !shareArtist(j, r));
    if (exact.length && r.vc.toLowerCase() !== vb) out.push({ kind: 'r', i: pick(exact), type: 'colour', text: `Also on ${r.vc.toLowerCase()} vinyl`, base: 2.4 });
    else if (loose.length) out.push({ kind: 'r', i: pick(loose), type: 'colour', text: `Also on ${vb} vinyl`, base: 2.2 });
  }

  const styles = r.s.map(s => [s, (d.byStyle.get(s) || []).filter(j => j !== ri && !shareArtist(j, r))]).filter(x => x[1].length).sort((x, y) => x[1].length - y[1].length);
  for (const [s, list] of styles.slice(0, 2)) out.push({ kind: 'r', i: pick(list), type: 'style', text: `Also filed under ${s}`, base: 2.3 - Math.log10(list.length + 1) * 0.35 });

  if (r.y) {
    const yr = (d.byYear.get(r.y) || []).filter(j => j !== ri && !shareArtist(j, r));
    const fam = yr.filter(j => R(j).fam === r.fam);
    if (fam.length) out.push({ kind: 'r', i: pick(fam), type: 'year', text: `Also from ${r.y}, also ${famName.get(r.fam)}`, base: 1.6 });
    else if (yr.length) out.push({ kind: 'r', i: pick(yr), type: 'year', text: `Also from ${r.y}`, base: 1.2 });
  }
  return out;
}

/** Deterministic reason for a hop we didn't generate (URL trails, shelf taps). */
function connect(prev, kind, i) {
  const P = prev.kind, pi = prev.i;
  if (P === 'a' && kind === 'a') {
    const n = d.neighbours[pi].find(x => x.other === i);
    if (n) { const w = bestWhy(n.why); return { kind, i, type: w.type, text: linkText(w, pi, i), base: 3 }; }
  }
  if (P === 'a' && kind === 'r') {
    const n = d.neighbours[pi].flatMap(x => x.why).find(w => w.type === 'guest' && w.guest === pi && w.album === i);
    if (n) return { kind, i, type: 'guestspot', text: `${A(pi).name} guests on “${n.track}” from ${R(i).t}`, base: 3 };
    if (R(i).a.includes(pi)) { const c = A(pi).records.length; return { kind, i, type: 'record', text: c > 1 ? `One of ${c} ${A(pi).name} records in the collection` : `The only ${A(pi).name} record in the collection`, base: 2 }; }
  }
  if (P === 'r' && kind === 'a') {
    const r = R(pi);
    if (r.a.includes(i)) return { kind, i, type: 'artist', text: `${r.t} is by ${A(i).name}`, base: 2 };
    for (const ai of r.a) {
      const n = d.neighbours[ai].find(x => x.other === i);
      const w = n && n.why.find(w => w.type === 'guest' && w.album === pi);
      if (w) return { kind, i, type: 'guest', text: linkText(w, ai, i), base: 3 };
    }
  }
  if (P === 'r' && kind === 'r') {
    const r = R(pi), q = R(i);
    if (shareArtist(i, r)) return { kind, i, type: 'record', text: `Also by ${q.by}`, base: 1 };
    const l = r.l.find(x => q.l.includes(x));
    if (l) return { kind, i, type: 'label', text: r.y && r.y === q.y ? `Same label, same year: ${lab(l)}, ${r.y}` : `Also on ${lab(l)}`, base: 2 };
    if (r.vc && vcBase(r.vc) === vcBase(q.vc)) return { kind, i, type: 'colour', text: `Also on ${vcBase(r.vc)} vinyl`, base: 2 };
    const s = r.s.filter(x => q.s.includes(x)).sort((x, y) => d.byStyle.get(x).length - d.byStyle.get(y).length)[0];
    if (s) return { kind, i, type: 'style', text: `Also filed under ${s}`, base: 2 };
    if (r.y && r.y === q.y) return { kind, i, type: 'year', text: `Also from ${r.y}`, base: 1 };
  }
  return { kind, i, type: 'jump', text: 'A jump: no direct link from the last card', base: 0 };
}

// ---------------------------------------------------------------- trail state
// trail[k] = node { kind, i, via (edge), alts (parent's ways out), alt (index), view, vid, outs, el }
let trail = [];
let cur = 0, maxSeen = 0;
const seen = new Set(), usedText = new Set();

function computeOuts(k) {
  const node = trail[k];
  let outs = node.kind === 'a' ? artistOuts(node.i) : albumOuts(node.i);
  const inTrail = new Set(trail.slice(0, k + 1).map(n => key(n.kind, n.i)));
  const kinds = trail.slice(Math.max(0, k - 1), k + 1).map(n => n.kind);
  const recentTypes = trail.slice(Math.max(1, k - 2), k + 1).map(n => n.via?.type);
  const best = new Map();
  for (const e of outs) {
    const kk = key(e.kind, e.i);
    if (inTrail.has(kk) || e.text === node.via?.text) continue;
    let s = e.base + Math.random() * 1.1;
    if (recentTypes.includes(e.type)) s -= 1.1;
    if (seen.has(kk)) s -= 2.5;
    if (usedText.has(e.text)) s -= 1.5;
    if (kinds.length === 2 && kinds.every(x => x === e.kind)) s -= 1.3;
    e.rank = s;
    if (!best.has(kk) || best.get(kk).rank < s) best.set(kk, e);
  }
  outs = [...best.values()].sort((x, y) => y.rank - x.rank).slice(0, 7);
  if (outs.length < 2 && node.kind === 'a') {
    // a lone artist: hop on through their records' labels, styles and colours
    for (const ri of shuffle(A(node.i).records).slice(0, 2)) {
      for (const e of albumOuts(ri)) {
        if (e.kind !== 'r' || inTrail.has(key(e.kind, e.i)) || outs.some(o => o.kind === e.kind && o.i === e.i)) continue;
        outs.push({ ...e, text: `${R(ri).t}: ${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`, rank: e.base });
      }
    }
    outs = outs.sort((x, y) => y.rank - x.rank).slice(0, 6);
  }
  if (!outs.length) {
    const pool = wellConnected.filter(i => !inTrail.has(key('a', i)) && !seen.has(key('a', i)));
    const j = pick(pool.length ? pool : wellConnected);
    outs = [{ kind: 'a', i: j, type: 'jump', text: `Nothing new links from here, so a jump to ${A(j).name}`, base: 0 }];
  }
  node.outs = outs;
  return outs;
}

function chooseView(n, prev, edge) {
  n.vid = null;
  const prevVideo = prev?.view === 'video';
  if (n.kind === 'r') {
    const r = R(n.i);
    if (edge?.vid) { n.view = 'video'; n.vid = edge.vid; return; }
    const v = r.v.find(x => x[2] === 'video') || r.v.find(x => x[2] === 'live');
    if (v && !prevVideo && Math.random() < 0.3) { n.view = 'video'; n.vid = v; return; }
    n.view = 'sleeve';
  } else {
    const a = A(n.i);
    const vids = a.videos;
    if (vids.length && !prevVideo && Math.random() < (a.fanart.length ? 0.18 : 0.45)) { n.view = 'video'; n.vid = pick(vids); return; }
    n.view = a.fanart.length ? 'fanart' : 'photo';
    n.fan = a.fanart.length ? pick(a.fanart) : null;
  }
}

function nodeFromEdge(edge, alts, alt, prev) {
  if (edge._node) return edge._node;
  const n = { kind: edge.kind, i: edge.i, via: edge, alts, alt, outs: null };
  chooseView(n, prev, edge);
  edge._node = n;
  return n;
}
function nodeAt(k, j) {
  const alts = k === 0 ? trail[0].alts : trail[k - 1].outs;
  return nodeFromEdge(alts[j], alts, j, trail[k - 1]);
}

function ensureAhead(k) {
  while (trail.length <= k + 2) {
    const last = trail.length - 1;
    const outs = trail[last].outs || computeOuts(last);
    trail.push(nodeFromEdge(outs[0], outs, 0, trail[last]));
  }
}

function seedEdges(first, firstText) {
  const others = shuffle(wellConnected.filter(i => i !== first)).slice(0, 5);
  const e = (i, j) => ({ kind: 'a', i, type: 'seed', text: `Start: ${A(i).name}`, sub: `${j || !firstText ? 'Picked at random: ' : ''}${d.neighbours[i].length ? `${A(i).name} has ${plural(d.neighbours[i].length, 'link')} to other artists in the collection` : `${plural(A(i).records.length, 'record')} in the collection, no direct artist links`}`, base: 0 });
  return [e(first, 0), ...others.map((i, j) => e(i, j + 1))];
}

function startFrom(params) {
  trail = [];
  const slugs = (params.get('trail') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ents = slugs.map(s => d.albumBySlug.has(s) ? ['r', d.albumBySlug.get(s)] : d.artistBySlug.has(s) ? ['a', d.artistBySlug.get(s)] : null).filter(Boolean);
  const seedSlug = params.get('seed'), albumSlug = params.get('album');
  if (!ents.length) {
    if (albumSlug && d.albumBySlug.has(albumSlug)) ents.push(['r', d.albumBySlug.get(albumSlug)]);
    else if (seedSlug && d.artistBySlug.has(seedSlug)) ents.push(['a', d.artistBySlug.get(seedSlug)]);
    else ents.push(['a', pick(wellConnected)]);
  }
  const [k0, i0] = ents[0];
  let alts;
  if (k0 === 'a') alts = seedEdges(i0, !!(slugs.length || seedSlug));
  else alts = [{ kind: 'r', i: i0, type: 'seed', text: `Start: ${R(i0).t}`, sub: `${R(i0).t} by ${R(i0).by}, ${R(i0).y || ''}`.replace(/, $/, ''), base: 0 }, ...seedEdges(pick(wellConnected)).slice(1)];
  const n0 = nodeFromEdge(alts[0], alts, 0, null);
  if (k0 === 'a' && A(i0).fanart.length) { n0.view = 'fanart'; n0.fan = A(i0).fanart[0]; n0.vid = null; }
  if (k0 === 'r') { n0.view = 'sleeve'; n0.vid = null; }
  trail.push(n0);
  for (let k = 1; k < ents.length; k++) {
    const [kind, i] = ents[k];
    const outs = computeOuts(k - 1);
    let j = outs.findIndex(e => e.kind === kind && e.i === i);
    if (j < 0) { outs.unshift(connect(trail[k - 1], kind, i)); outs.length = Math.min(outs.length, 7); j = 0; }
    const n = nodeAt(k, j);
    trail.push(n);
  }
  for (const n of trail) { seen.add(key(n.kind, n.i)); usedText.add(n.via.text); }
  cur = maxSeen = trail.length - 1;
  ensureAhead(cur);
}

// ---------------------------------------------------------------- cards
function mediaUrl(n) {
  if (n.view === 'video') return ytThumb(n.vid[0]);
  if (n.kind === 'r') return sleeveUrl(R(n.i), 'medium');
  const a = A(n.i);
  return n.view === 'fanart' ? fanartUrl(a, n.fan) : artistUrl(a, 'hi-res');
}
function focusPos(a) { const f = a.focus || [0.5, 0.35]; return `${(f[0] * 100).toFixed(1)}% ${(f[1] * 100).toFixed(1)}%`; }

function viaHTML(n, k) {
  const e = n.via;
  const person = e.person?.thumb ? `<span class="via-who"><img src="${esc(e.person.thumb)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : '';
  const count = n.alts?.length || 1;
  const dots = Array.from({ length: count }, (_, j) => `<i class="${j === n.alt ? 'on' : ''}"></i>`).join('');
  const more = count > 1 ? `<button class="ways" data-act="branch" type="button" aria-label="Show another way out"><span class="dots">${dots}</span>${k === 0 ? plural(count - 1, 'other start') : plural(count - 1, 'more way') + ' out'} <span aria-hidden="true">⇆</span></button>` : '';
  return `<header class="via">
    <div class="via-kicker"><span class="x-label">${k === 0 ? 'Start' : 'Hop ' + k}</span><span class="x-mono" style="font-size:10.5px;opacity:.8">${esc(typeLabel(e.type))}</span></div>
    <p class="via-text">${person}${esc(k === 0 ? (e.sub || e.text) : e.text)}</p>
    ${more}
  </header>`;
}
const TYPE_LABEL = { bandmate: 'shared member', member: 'member', group: 'band', alias: 'alias', guest: 'guest spot', guestspot: 'guest spot', record: 'on the shelf', video: 'video', artist: 'artist', label: 'label', colour: 'vinyl colour', style: 'style', year: 'year', jump: 'jump', seed: '' };
const typeLabel = t => TYPE_LABEL[t] ?? '';

function infoHTML(n, k) {
  const hint = k < 2 ? `<p class="hint">Tap for details · swipe up for the next hop</p>` : '';
  const next = `<p class="next"><b>Next</b><span data-next></span></p>`;
  if (n.kind === 'a') {
    const a = A(n.i);
    const yr = a.formed ? `formed ${a.formed}` : a.born ? `born ${a.born}` : '';
    const meta = [a.from, yr, a.genre].filter(Boolean).join(' · ');
    const kicker = n.view === 'video' ? `Video · ${esc(n.vid[2] || a.name)}` : 'Artist';
    const title = n.view === 'video' ? esc(cleanTitle(n.vid[1], [a.name])) : esc(a.name);
    const by = n.view === 'video' ? `<p class="by">${esc(a.name)}</p>` : '';
    return `<footer class="info"><div class="info-kicker x-label">${kicker}</div><h2>${title}</h2>${by}
      <p class="meta">${esc(meta)}${meta ? '<br>' : ''}${plural(a.records.length, 'record')} in the collection</p>
      ${n.view === 'video' ? soundChip() : ''}${next}${hint}</footer>`;
  }
  const r = R(n.i);
  const meta = [r.y, lab(r.l[0]), r.c, r.vc ? `${r.vc} vinyl` : r.fmt].filter(Boolean).join(' · ');
  if (n.view === 'video') {
    const kind = n.vid[2] === 'live' ? 'Live' : n.vid[2] === 'video' ? 'Video' : 'Clip';
    return `<footer class="info"><div class="info-kicker x-label">${kind} · from ${esc(r.t)}</div><h2>${esc(vidTitle(n.vid, r))}</h2><p class="by">${esc(r.by)}</p>
      <p class="meta">${esc(meta)}</p>${soundChip()}${next}${hint}</footer>`;
  }
  return `<footer class="info"><div class="info-kicker x-label">Record</div><h2>${esc(r.t)}</h2><p class="by">${esc(r.by)}</p>
    <p class="meta">${esc(meta)}</p>${next}${hint}</footer>`;
}
const soundChip = () => `<button class="flat-btn sound-chip" data-act="sound" type="button">${sound ? 'Sound on' : 'Muted · tap for sound'}</button>`;

function buildCard(n, k) {
  if (n.el && n.elK === k) return n.el;
  const el = document.createElement('article');
  el.className = 'card card--' + n.view;
  const url = mediaUrl(n);
  let media;
  if (n.view === 'sleeve') {
    const r = R(n.i);
    el.style.setProperty('--bg', r.fl);
    el.style.setProperty('--fg', r.ink);
    media = `<div class="card-media"><img class="sleeve" src="${url}" alt="${esc(r.t)} sleeve" draggable="false"></div>`;
  } else if (n.view === 'video') {
    const bg = n.kind === 'r' ? R(n.i).gr : '#000';
    el.style.setProperty('--bg', bg);
    media = `<div class="card-media"><div class="vbox"><img src="${url}" alt="" draggable="false"></div></div>`;
  } else {
    const a = A(n.i);
    media = `<div class="card-media"><img class="cover" src="${url}" alt="${esc(a.name)}" style="object-position:${focusPos(a)}" draggable="false"></div>`;
  }
  el.innerHTML = media + `<div class="card-shade"></div>` + viaHTML(n, k) + infoHTML(n, k);
  n.el = el; n.elK = k;
  n.mediaEl = el.querySelector('.card-media');
  n.textEls = el.querySelectorAll('.via, .info');
  return el;
}

// ---------------------------------------------------------------- layout + motion
let vpos = 0, vvel = 0, vTarget = 0;
let hoff = 0, hvel = 0, hTarget = 0;
let drag = null, raf = 0, lastT = 0;
let W = stage.clientWidth, H = stage.clientHeight;
new ResizeObserver(() => { W = stage.clientWidth; H = stage.clientHeight; layout(); }).observe(stage);

function siblings() {
  const n = trail[cur];
  const alts = n.alts;
  if (!alts || alts.length < 2) return {};
  const L = (n.alt - 1 + alts.length) % alts.length, Rt = (n.alt + 1) % alts.length;
  return { left: nodeAt(cur, L), right: nodeAt(cur, Rt) };
}

function place(n, k, offY, offX, z) {
  const el = buildCard(n, k);
  if (el.parentNode !== stage) stage.appendChild(el);
  el.style.zIndex = z;
  if (reduced) {
    const o = Math.max(0, 1 - Math.max(Math.abs(offY), Math.abs(offX)));
    el.style.transform = 'none';
    el.style.opacity = o.toFixed(3);
    n.mediaEl.style.transform = '';
    return el;
  }
  el.style.opacity = '';
  el.style.transform = `translate3d(${(offX * W).toFixed(1)}px, ${(offY * H).toFixed(1)}px, 0)`;
  // parallax: media lags the card, text leads slightly
  n.mediaEl.style.transform = `translate3d(${(-offX * W * 0.32).toFixed(1)}px, ${(-offY * H * 0.3).toFixed(1)}px, 0) scale(${(1 + Math.min(0.06, Math.abs(offY) * 0.06)).toFixed(4)})`;
  return el;
}

function layout() {
  const keep = new Set();
  const lo = Math.max(0, Math.floor(vpos) - 1), hi = Math.min(trail.length - 1, Math.ceil(vpos) + 1);
  for (let k = lo; k <= hi; k++) {
    const off = k - vpos;
    if (Math.abs(off) > 1.2) continue;
    const isCur = k === cur;
    const el = place(trail[k], k, off, isCur ? hoff : 0, isCur ? 3 : (off > 0 ? 4 : 2));
    keep.add(el);
    if (reduced) el.style.zIndex = Math.round(10 - Math.abs(off) * 5);
  }
  if (hoff !== 0) {
    const s = siblings();
    if (s.right && hoff < 0) keep.add(place(s.right, cur, cur - vpos, 1 + hoff, 3));
    if (s.left && hoff > 0) keep.add(place(s.left, cur, cur - vpos, -1 + hoff, 3));
  }
  for (const el of [...stage.children]) if (!keep.has(el)) { el.remove(); el.querySelector('iframe')?.remove(); }
  // next-up teasers
  for (let k = lo; k <= hi; k++) {
    const t = trail[k].el?.querySelector('[data-next]');
    const nx = trail[k + 1];
    if (t && nx && t.textContent !== nx.via.text) t.textContent = nx.via.text;
  }
}

function spring(x, v, target, dt) {
  if (reduced) {
    const dd = target - x, s = dt / 0.22;
    if (Math.abs(dd) <= s) return [target, 0, false];
    return [x + Math.sign(dd) * s, 0, true];
  }
  const K = 330, C = 31;
  for (let i = 0; i < 2; i++) {
    const h = dt / 2;
    const a = -K * (x - target) - C * v;
    v += a * h; x += v * h;
  }
  if (Math.abs(x - target) < 0.0008 && Math.abs(v) < 0.02) return [target, 0, false];
  return [x, v, true];
}

function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function tick(t) {
  raf = 0;
  const dt = lastT ? Math.min(0.034, (t - lastT) / 1000) : 0.016;
  lastT = t;
  let moving = false, m;
  if (!(drag && drag.axis === 'y')) { [vpos, vvel, m] = spring(vpos, vvel, vTarget, dt); moving ||= m; }
  if (!(drag && drag.axis === 'x')) { [hoff, hvel, m] = spring(hoff, hvel, hTarget, dt); moving ||= m; }
  if (hTarget !== 0 && Math.abs(hoff - hTarget) < 0.002) { commitBranch(hTarget < 0 ? 1 : -1); moving = true; }
  layout();
  if (moving || drag) kick(); else { lastT = 0; settled(); }
}

function go(k, v0 = 0) {
  k = Math.max(0, Math.min(k, trail.length - 1));
  if (k !== cur) { stopVideo(); if (playing) { playing = null; } }
  cur = k; vTarget = k; vvel = v0;
  maxSeen = Math.max(maxSeen, cur);
  ensureAhead(cur);
  renderTrail();
  kick();
}
const next = () => go(cur + 1);
const prev = () => go(cur - 1);

function branch(dir) {
  const n = trail[cur];
  if (!n.alts || n.alts.length < 2) { hvel = dir * -3; kick(); return; }
  stopVideo();
  hTarget = dir > 0 ? -1 : 1;
  kick();
}
function commitBranch(dir) {
  const n = trail[cur];
  const j = (n.alt + dir + n.alts.length) % n.alts.length;
  const nn = nodeAt(cur, j);
  nn.outs = null;
  // sibling was positioned at the far side; it is now the main card at the centre
  trail.length = cur;
  trail.push(nn);
  maxSeen = cur;
  hoff = 0; hvel = 0; hTarget = 0;
  if (n.el) { n.el.remove(); n.el.querySelector('iframe')?.remove(); }
  ensureAhead(cur);
  renderTrail();
}

/** Make `edge` the next hop from the current card and go there. */
function hopTo(edge) {
  const outs = trail[cur].outs || computeOuts(cur);
  let j = outs.findIndex(e => e.kind === edge.kind && e.i === edge.i && (e.vid?.[0] ?? null) === (edge.vid?.[0] ?? null));
  if (j < 0) { outs.push(edge); j = outs.length - 1; }
  trail.length = cur + 1;
  const n = nodeAt(cur + 1, j);
  n.outs = null;
  trail.push(n);
  maxSeen = cur;
  closeDrawer();
  go(cur + 1);
}

let lastSettled = null;
function settled() {
  const n = trail[cur];
  if (lastSettled === n) return;
  lastSettled = n;
  seen.add(key(n.kind, n.i));
  usedText.add(n.via.text);
  syncVideo();
  if (wide.matches || drawer.classList.contains('open')) renderDrawer();
  renderTrail();
  writeURL();
  preload();
}

// ---------------------------------------------------------------- video + sound
let sound = false;
function syncVideo() {
  for (const k of [cur - 1, cur + 1]) trail[k]?.el?.querySelector('iframe')?.remove();
  const n = trail[cur];
  if (!n || n.view !== 'video' || !n.el) return;
  if (playing) { n.el.querySelector('iframe')?.remove(); return; }
  const box = n.el.querySelector('.vbox');
  let f = box.querySelector('iframe');
  if (reduced && !sound) { f?.remove(); return; }
  const src = ytEmbed(n.vid[0], { start: 30, mute: sound ? 0 : 1 });
  if (!f) {
    f = document.createElement('iframe');
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.title = 'Video';
    f.tabIndex = -1;
    f.addEventListener('load', () => f.classList.add('on'));
    box.appendChild(f);
  }
  if (f.src !== src) { f.classList.remove('on'); f.src = src; }
  const chip = n.el.querySelector('[data-act="sound"]');
  if (chip) chip.textContent = sound ? 'Sound on' : 'Muted · tap for sound';
}
function stopVideo() { trail[cur]?.el?.querySelector('iframe')?.remove(); }
function toggleSound() { sound = !sound; syncVideo(); renderDrawer(); toast(sound ? 'Sound on' : 'Muted'); }

// ---------------------------------------------------------------- preload
const preloaded = new Set();
function preload() {
  const want = [trail[cur + 1], trail[cur + 2]];
  const s = siblings();
  want.push(s.right);
  for (const n of want) {
    if (!n) continue;
    const u = mediaUrl(n);
    if (preloaded.has(u)) continue;
    preloaded.add(u);
    const im = new Image(); im.decoding = 'async'; im.src = u;
  }
}

// ---------------------------------------------------------------- trail UI
function thumbOf(n) {
  if (n.kind === 'r') return { src: sleeveUrl(R(n.i), 'medium'), sq: true, name: R(n.i).t };
  return { src: artistUrl(A(n.i), 'avatar'), sq: false, name: A(n.i).name };
}
function renderTrail() {
  const items = trail.slice(0, maxSeen + 1);
  trailList.innerHTML = items.map((n, k) => {
    const t = thumbOf(n);
    const cls = k === cur ? 'here' : k > cur ? 'ahead' : '';
    return `<li><button class="crumb ${cls}" data-k="${k}" type="button" title="${esc(t.name)}">
      <span class="th${t.sq ? ' sq' : ''}"><img src="${t.src}" alt="" loading="lazy"></span>
      <span class="tx"><span class="n">${esc(t.name)}</span><span class="w">${esc(k === 0 ? 'Start' : n.via.text)}</span></span></button></li>`;
  }).join('');
  $('trailCount').textContent = `${plural(maxSeen, 'hop')}`;
  const here = trailList.querySelector('.here');
  if (here) {
    const a = here.getBoundingClientRect(), b = trailList.getBoundingClientRect();
    if (wide.matches) trailList.scrollTop += (a.top + a.height / 2) - (b.top + b.height / 2);
    else trailList.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2);
  }
}
trailList.addEventListener('click', e => {
  const b = e.target.closest('.crumb');
  if (b) go(+b.dataset.k);
});

function writeURL() {
  const slugs = trail.slice(0, maxSeen + 1).map(n => (n.kind === 'a' ? A(n.i) : R(n.i)).slug);
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('trail', slugs.join(','));
  history.replaceState(null, '', u.pathname + '?' + u.searchParams.toString().replace(/%2C/g, ','));
}
async function copyLink() {
  writeURL();
  try { await navigator.clipboard.writeText(location.href); toast('Link to this trail copied'); }
  catch { toast('Copy failed: the address bar has the link'); }
}
$('copyBtn').addEventListener('click', copyLink);

let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800);
}

// ---------------------------------------------------------------- details drawer
let playing = null;
function outRow(e, isNext) {
  const n = { kind: e.kind, i: e.i };
  const t = e.vid ? { src: ytThumb(e.vid[0]), sq: true, name: R(e.i).t } : thumbOf(n);
  const name = e.kind === 'a' ? A(e.i).name : `${R(e.i).t}`;
  const sub = e.kind === 'r' && !e.vid ? ` · ${R(e.i).by}` : '';
  return `<li><button class="out${isNext ? ' is-next' : ''}" data-out type="button">
    <span class="th${t.sq ? ' sq' : ''}"><img src="${t.src}" alt="" loading="lazy"></span>
    <span><span class="t1">${esc(name)}${esc(sub)}</span><span class="t2">${esc(e.text)}</span></span></button></li>`;
}
function vidRow(v, sub, idx) {
  return `<button class="vid" data-vid="${idx}" type="button"><span class="th"><img src="${ytThumb(v[0])}" alt="" loading="lazy"></span>
    <span><span class="t1">${esc(v.title)}</span><span class="t2">${esc(sub)}</span></span></button>`;
}
function trimBio(s) {
  if (!s) return '';
  if (s.length < 400) return s;
  const cut = s.slice(0, 400);
  const p = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (p > 160 ? cut.slice(0, p + 1) : cut.replace(/\s+\S*$/, '') + '…');
}

let drawerVids = [], drawerOuts = [], drawerShelf = [];
function renderDrawer() {
  const n = trail[cur];
  if (!n) return;
  const outs = n.outs || computeOuts(cur);
  const nextAlt = trail[cur + 1]?.alt;
  drawerOuts = outs;
  let h = '';
  const player = playing ? `<div class="player"><iframe src="${ytEmbed(playing, { start: 0, mute: 0 }).replace('controls=0', 'controls=1')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video"></iframe></div>` : '';
  if (n.kind === 'a') {
    const a = A(n.i);
    const yr = a.formed ? `Formed ${a.formed}` : a.born ? `Born ${a.born}` : '';
    const meta = [a.from, yr, a.died ? `died ${a.died}` : '', a.genre, a.style].filter(Boolean).join(' · ');
    h += `${player}<div class="d-kicker x-label">Artist</div><h2 class="d-title">${esc(a.name)}</h2><p class="d-meta">${esc(meta)}</p>`;
    if (a.bio) h += `<p class="d-bio">${esc(trimBio(a.bio))}</p>`;
    if (a.members.length) h += `<p class="d-meta">Members on Discogs: ${esc(a.members.slice(0, 8).join(', '))}${a.members.length > 8 ? '…' : ''}</p>`;
    h += `<div class="d-actions"><a class="flat-btn" href="${artistHref(a)}" target="_blank" rel="noopener">Artist page on russ.fm ↗</a>${n.view === 'video' ? soundChip() : ''}<button class="flat-btn" data-copy type="button">Copy trail link</button></div>`;
    h += `<section class="d-sec"><h3><span class="x-label">Ways out</span><span class="x-mono">${outs.length}</span></h3><ul class="outs">${outs.map((e, j) => outRow(e, j === nextAlt)).join('')}</ul></section>`;
    drawerShelf = [...a.records].sort((x, y) => (R(x).y || 9999) - (R(y).y || 9999));
    h += `<section class="d-sec"><h3><span class="x-label">In the collection</span><span class="x-mono">${plural(a.records.length, 'record')}</span></h3><div class="shelf">${drawerShelf.map((ri, j) => `<button data-shelf="${j}" type="button" title="${esc(R(ri).t)}${R(ri).y ? ', ' + R(ri).y : ''}"><img src="${sleeveUrl(R(ri), 'medium')}" alt="${esc(R(ri).t)}" loading="lazy"></button>`).join('')}</div></section>`;
    drawerVids = a.videos.map(v => ({ id: v[0], title: v[1] || 'Video', sub: v[2] || a.name }));
  } else {
    const r = R(n.i);
    const meta = [r.y, [...new Set(r.l.map(lab))].join(', '), r.c, r.fmt, r.vc ? `${r.vc} vinyl` : '', r.lis ? `${r.lis.toLocaleString('en-GB')} Last.fm listeners` : ''].filter(Boolean).join(' · ');
    h += `${player}<div class="d-kicker x-label">Record</div><h2 class="d-title">${esc(r.t)}</h2>
      <p class="d-by">${r.a.length ? r.a.map(ai => `<button data-artist="${ai}" type="button">${esc(A(ai).name)}</button>`).join(', ') : esc(r.by)}</p>
      <p class="d-meta">${esc(meta)}</p>`;
    if (r.s.length || r.g.length) h += `<div class="chips" style="margin-top:12px">${[...new Set([...r.s, ...r.g])].slice(0, 8).map(s => `<span>${esc(s)}</span>`).join('')}</div>`;
    h += `<div class="d-actions"><a class="flat-btn" href="${albumHref(r)}" target="_blank" rel="noopener">Album page on russ.fm ↗</a>${n.view === 'video' ? soundChip() : ''}<button class="flat-btn" data-copy type="button">Copy trail link</button></div>`;
    h += `<section class="d-sec"><h3><span class="x-label">Ways out</span><span class="x-mono">${outs.length}</span></h3><ul class="outs">${outs.map((e, j) => outRow(e, j === nextAlt)).join('')}</ul></section>`;
    drawerVids = r.v.map(v => ({ id: v[0], title: vidTitle(v, r), sub: v[2] === 'other' ? 'clip' : v[2] }));
    const ai = r.a.find(x => x !== VARIOUS);
    if (ai != null && A(ai).records.length > 1) {
      drawerShelf = A(ai).records.filter(x => x !== n.i).sort((x, y) => (R(x).y || 9999) - (R(y).y || 9999));
      h += `<section class="d-sec"><h3><span class="x-label">More ${esc(A(ai).name)}</span><span class="x-mono">${plural(drawerShelf.length, 'record')}</span></h3><div class="shelf">${drawerShelf.map((ri, j) => `<button data-shelf="${j}" type="button" title="${esc(R(ri).t)}"><img src="${sleeveUrl(R(ri), 'medium')}" alt="${esc(R(ri).t)}" loading="lazy"></button>`).join('')}</div></section>`;
    } else drawerShelf = [];
  }
  if (drawerVids.length) h += `<section class="d-sec"><h3><span class="x-label">Videos</span><span class="x-mono">play with sound</span></h3><div class="vids">${drawerVids.map((v, j) => vidRow({ 0: v.id, title: v.title }, v.sub, j)).join('')}</div></section>`;
  drawerBody.innerHTML = h;
}
drawerBody.addEventListener('click', e => {
  const t = e.target;
  const o = t.closest('[data-out]');
  if (o) { const idx = [...drawerBody.querySelectorAll('[data-out]')].indexOf(o); hopTo(drawerOuts[idx]); return; }
  const s = t.closest('[data-shelf]');
  if (s) { const ri = drawerShelf[+s.dataset.shelf]; hopTo(connect(trail[cur], 'r', ri)); return; }
  const a = t.closest('[data-artist]');
  if (a) { hopTo(connect(trail[cur], 'a', +a.dataset.artist)); return; }
  const v = t.closest('[data-vid]');
  if (v) { playing = drawerVids[+v.dataset.vid].id; syncVideo(); renderDrawer(); drawer.scrollTop = 0; return; }
  if (t.closest('[data-act="sound"]')) { playing = null; toggleSound(); return; }
  if (t.closest('[data-copy]')) copyLink();
});

function openDrawer() {
  if (wide.matches) return;
  renderDrawer();
  drawer.classList.add('open'); scrim.hidden = false;
  drawer.scrollTop = 0;
}
function closeDrawer() {
  if (playing) { playing = null; renderDrawer(); syncVideo(); }
  drawer.classList.remove('open'); scrim.hidden = true;
  stage.focus({ preventScroll: true });
}
$('drawerClose').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

// ---------------------------------------------------------------- input
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, v0: vpos, h0: hoff, samples: [[e.clientX, e.clientY, performance.now()]], target: e.target };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const now = performance.now();
  drag.samples.push([e.clientX, e.clientY, now]);
  if (drag.samples.length > 6) drag.samples.shift();
  if (!drag.axis && Math.hypot(dx, dy) > 8) {
    drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    stage.classList.add('dragging');
    if (drag.axis === 'x') stopVideo();
  }
  if (reduced || !drag.axis) return;
  if (drag.axis === 'y') {
    let p = drag.v0 - dy / H;
    if (p < 0) p *= 0.3;
    const max = trail.length - 1;
    if (p > max) p = max + (p - max) * 0.3;
    vpos = p;
  } else {
    const n = trail[cur];
    const can = n.alts && n.alts.length > 1;
    hoff = Math.max(-1, Math.min(1, dx / W * (can ? 1 : 0.25)));
  }
  kick();
});
function endDrag(e) {
  if (!drag) return;
  const dg = drag; drag = null;
  stage.classList.remove('dragging');
  const dx = e.clientX - dg.x, dy = e.clientY - dg.y;
  const s = dg.samples, a = s[0], b = s[s.length - 1];
  const dt = Math.max(1, b[2] - a[2]);
  const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt; // px per ms
  if (!dg.axis) {
    if (performance.now() - dg.t < 450) tap(dg.target);
    return;
  }
  if (dg.axis === 'y') {
    const dir = (dy < -H * 0.16 || vy < -0.45) ? 1 : (dy > H * 0.16 || vy > 0.45) ? -1 : 0;
    go(cur + dir, reduced ? 0 : -vy * 1000 / H);
  } else {
    const dir = (dx < -W * 0.22 || vx < -0.45) ? 1 : (dx > W * 0.22 || vx > 0.45) ? -1 : 0;
    if (dir) branch(dir); else { hTarget = 0; kick(); }
    if (!dir) syncVideoSoon();
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
function syncVideoSoon() { setTimeout(() => { lastSettled = null; settled(); }, 300); }

stage.addEventListener('click', e => {
  if (e.detail !== 0) return; // keyboard activation only; pointer taps go through tap()
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'branch') branch(1);
  if (act === 'sound') toggleSound();
});
function tap(target) {
  const act = target.closest?.('[data-act]')?.dataset.act;
  if (act === 'branch') return branch(1);
  if (act === 'sound') return toggleSound();
  if (wide.matches) { if (trail[cur].view === 'video') toggleSound(); return; }
  if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
}

// wheel: one hop per gesture
let wheelAcc = 0, wheelAccX = 0, wheelLock = false, wheelT;
stage.addEventListener('wheel', e => {
  e.preventDefault();
  clearTimeout(wheelT);
  wheelT = setTimeout(() => { wheelLock = false; wheelAcc = wheelAccX = 0; }, 160);
  if (wheelLock) return;
  wheelAcc += e.deltaY; wheelAccX += e.deltaX;
  if (Math.abs(wheelAccX) > 60 && Math.abs(wheelAccX) > Math.abs(wheelAcc)) { branch(wheelAccX > 0 ? 1 : -1); wheelLock = true; }
  else if (Math.abs(wheelAcc) > 40) { wheelAcc > 0 ? next() : prev(); wheelLock = true; }
}, { passive: false });

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const inDrawer = drawer.contains(document.activeElement) && drawer.classList.contains('open');
  switch (e.key) {
    case 'ArrowDown': case 'PageDown': case 'j': next(); break;
    case ' ': if (inDrawer) return; e.shiftKey ? prev() : next(); break;
    case 'ArrowUp': case 'PageUp': case 'k': prev(); break;
    case 'ArrowRight': case 'l': branch(1); break;
    case 'ArrowLeft': case 'h': branch(-1); break;
    case 'Enter': if (document.activeElement === stage || document.activeElement === document.body) { drawer.classList.contains('open') ? closeDrawer() : openDrawer(); } else return; break;
    case 'Escape': closeDrawer(); break;
    case 'c': copyLink(); break;
    case 'm': toggleSound(); break;
    default: return;
  }
  e.preventDefault();
});
wide.addEventListener('change', () => { closeDrawer(); renderDrawer(); renderTrail(); });

// ---------------------------------------------------------------- go
startFrom(new URLSearchParams(location.search));
vpos = vTarget = cur;
renderTrail();
layout();
settled();
stage.focus({ preventScroll: true });
