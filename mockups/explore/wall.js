// The Wall: every sleeve as one endless, wrapping wall of instanced tiles.
// Tap a sleeve and the whole wall re-sorts into rings of relatedness around it.
// Full URL: Vite transforms this file and can't resolve the bare 'three' specifier.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {
  loadExplore, sleeveUrl, mountNav, sleeveCell, sleeveSheetUrl, sleeveSheetCount,
  ytEmbed, ytThumb, albumHref, artistHref, describeLink,
} from '/mockups/explore/shared.js';

mountNav('wall');
const d = await loadExplore();
const A = d.albums;
const N = A.length;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtN = n => n.toLocaleString('en-GB');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- grid
// One wrapping grid with room for every sleeve plus the 3x3 block the
// centred record takes up.
const G = Math.ceil(Math.sqrt(N + 9));
const R = Math.ceil((N + 9) / G);
const COPIES = 9; // 3x3 copies of the wall, so it tiles past its own edges
const wrapD = (v, n) => v - n * Math.floor(v / n + 0.5); // to [-n/2, n/2)
const wrapP = (v, n) => v - n * Math.floor(v / n);       // to [0, n)

// ---------------------------------------------------------------- colour
const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
function hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
  let h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [h / 6, s, l];
}
function lab([r, g, b]) {
  const f = c => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const [R1, G1, B1] = [f(r), f(g), f(b)];
  const x = (R1 * 0.4124 + G1 * 0.3576 + B1 * 0.1805) / 0.95047, y = R1 * 0.2126 + G1 * 0.7152 + B1 * 0.0722, z = (R1 * 0.0193 + G1 * 0.1192 + B1 * 0.9505) / 1.08883;
  const k = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * k(y) - 16, 500 * (k(x) - k(y)), 200 * (k(y) - k(z))];
}
const HUE = new Float32Array(N), SAT = new Float32Array(N), LIG = new Float32Array(N), LAB = [];
A.forEach((a, i) => { const c = rgbOf(a.fl); const [h, s, l] = hsl(c); HUE[i] = h; SAT[i] = s; LIG[i] = l; LAB[i] = lab(c); });
const labDist = (i, j) => { const p = LAB[i], q = LAB[j]; return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; };
const hueKey = i => (HUE[i] + 0.04) % 1;

// ---------------------------------------------------------------- lenses
const idx = A.map((_, i) => i);
const famIndex = new Map(d.families.map((f, i) => [f.key, i]));
const famName = new Map(d.families.map(f => [f.key, f.name]));

function fromOrder(order, arrange) {
  const cx = new Float32Array(N), cy = new Float32Array(N);
  for (let c = 0; c * R < order.length; c++) {
    const chunk = order.slice(c * R, c * R + R);
    (arrange ? arrange(chunk) : chunk).forEach((ai, r) => { cx[ai] = c; cy[ai] = r; });
  }
  return { cx, cy };
}
// lightest at the top of each column, darkest at the bottom, so the
// vivid mid-tones run across the middle of the wall
const lightDown = chunk => [...chunk].sort((a, b) => LIG[b] - LIG[a]);
function markersFor(order, keyOf, textOf, minor) {
  const out = []; let prev;
  order.forEach((ai, k) => {
    const key = keyOf(ai);
    if (key !== prev) { out.push({ col: Math.floor(k / R), text: textOf(ai, key), minor: minor ? minor(ai, key) : false }); prev = key; }
  });
  // one marker per column (the first that starts there)
  const seen = new Set();
  return out.filter(m => { const k = m.col + (m.minor ? 'm' : 'M'); if (seen.has(k)) return false; seen.add(k); return true; });
}
const hueName = i => {
  if (SAT[i] < 0.15) return 'Greys';
  const h = hueKey(i);
  return h < 0.08 ? 'Reds' : h < 0.15 ? 'Oranges' : h < 0.23 ? 'Yellows' : h < 0.49 ? 'Greens' : h < 0.76 ? 'Blues' : h < 0.94 ? 'Purples' : 'Pinks';
};

const LENSES = {
  colour: {
    name: 'by colour',
    build() {
      const chroma = idx.filter(i => SAT[i] >= 0.15).sort((a, b) => hueKey(a) - hueKey(b));
      const greys = idx.filter(i => SAT[i] < 0.15).sort((a, b) => LIG[b] - LIG[a]);
      const order = chroma.concat(greys);
      return { ...fromOrder(order, lightDown), markers: markersFor(order, hueName, (ai, k) => k), tipOf: () => '' };
    },
  },
  added: {
    name: 'by year added',
    build() {
      const order = [...idx].sort((a, b) => (A[a].added || '').localeCompare(A[b].added || '') || a - b);
      const markers = markersFor(order, ai => (A[ai].added || '????').slice(0, 4), (ai, k) => k);
      return { ...fromOrder(order), markers, tipOf: ai => `Added ${fmtDate(A[ai].added)}` };
    },
  },
  year: {
    name: 'by original year',
    build() {
      const order = [...idx].sort((a, b) => (A[a].y || 9999) - (A[b].y || 9999) || (A[a].added || '').localeCompare(A[b].added || ''));
      const dec = markersFor(order, ai => (A[ai].y ? Math.floor(A[ai].y / 10) : 'x'), (ai, k) => (k === 'x' ? 'Year unknown' : `${k}0s`));
      const yrs = markersFor(order, ai => A[ai].y || 'x', (ai, k) => String(k), () => true)
        .filter(m => !dec.some(x => x.col === m.col));
      return { ...fromOrder(order), markers: dec.concat(yrs), tipOf: ai => (A[ai].y ? `First released ${A[ai].y}` : '') };
    },
  },
  genre: {
    name: 'by genre',
    build() {
      const order = [...idx].sort((a, b) => famIndex.get(A[a].fam) - famIndex.get(A[b].fam) || hueKey(a) - hueKey(b));
      return { ...fromOrder(order), markers: markersFor(order, ai => A[ai].fam, (ai, k) => famName.get(k)), tipOf: ai => famName.get(A[ai].fam) };
    },
  },
};
const lensCache = {};
const lensLayout = key => (lensCache[key] ||= LENSES[key].build());

function fmtDate(s) {
  if (!s) return '';
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------- rings
// cells around a centre, nearest first, clockwise from the top; the 3x3
// block round the centre is kept free for the centred sleeve
const SPIRAL = [];
for (let dy = -Math.floor(R / 2); dy < R - Math.floor(R / 2); dy++) {
  for (let dx = -Math.floor(G / 2); dx < G - Math.floor(G / 2); dx++) {
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy)) continue;
    let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
    SPIRAL.push([dx, dy, dx * dx + dy * dy, a]);
  }
}
SPIRAL.sort((p, q) => p[2] - q[2] || p[3] - q[3]);

const vinylBase = vc => (vc || '').toLowerCase()
  .replace(/\b(crystal|translucent|transparent|opaque|marbled|marble|splatter|swirl|vinyl|coloured|colored|solid|smoke|smokey|smoky)\b/g, '')
  .replace(/\s+/g, ' ').trim();
const nameOf = i => d.artists[i].name;
const listNames = arr => (arr.length <= 2 ? arr.join(' & ') : `${arr.slice(0, -1).join(', ')} & ${arr.at(-1)}`);

function focusLayout(fi, cxC, cyC) {
  const f = A[fi];
  const used = new Set([fi]);
  const tier = new Int8Array(N).fill(6);
  const why = new Array(N).fill('');
  const tiers = [];
  const byColour = (a, b) => labDist(a, fi) - labDist(b, fi);
  // ring numbers are fixed per kind so the frame style always means the same thing
  const T = { artist: 1, label: 2, year: 3, style: 4, vinyl: 5 };
  const add = (key, items, label, whyOf) => {
    const list = items.filter(i => !used.has(i));
    if (!list.length) return;
    list.forEach(i => { used.add(i); tier[i] = T[key]; why[i] = whyOf(i); });
    tiers.push({ key, label, items: list, t: T[key] });
  };

  // 1. same artist, then artists linked to them
  const fArt = new Set(f.a);
  const same = idx.filter(i => i !== fi && A[i].a.some(x => fArt.has(x))).sort((a, b) => (A[a].y || 0) - (A[b].y || 0));
  const linkWhy = new Map();
  for (const ai of f.a) {
    for (const nb of d.neighbours[ai]) {
      if (fArt.has(nb.other)) continue;
      for (const r of d.artists[nb.other].records) if (!linkWhy.has(r)) linkWhy.set(r, describeLink(d, nb.why[0], ai, nb.other));
    }
  }
  const linked = [...linkWhy.keys()].filter(i => i !== fi && !same.includes(i)).sort((a, b) => (A[a].y || 0) - (A[b].y || 0)).slice(0, 120);
  const artistNames = f.a.map(nameOf);
  add('artist', [...same, ...linked],
    linked.length ? `${listNames(artistNames) || f.by} & linked artists` : `Also by ${listNames(artistNames) || f.by}`,
    i => (linkWhy.has(i) && !A[i].a.some(x => fArt.has(x)) ? linkWhy.get(i) : `Also by ${A[i].by}`));

  // 2. same label
  const fl = new Set(f.l);
  const labelHits = idx.filter(i => i !== fi && A[i].l.some(l => fl.has(l)))
    .sort((a, b) => Math.abs((A[a].y || 0) - (f.y || 0)) - Math.abs((A[b].y || 0) - (f.y || 0)) || byColour(a, b)).slice(0, 90);
  const topLabel = mostCommon(labelHits.filter(i => !used.has(i)).flatMap(i => A[i].l.filter(l => fl.has(l))));
  add('label', labelHits, `Same label: ${topLabel}`, i => `Same label: ${A[i].l.filter(l => fl.has(l)).join(', ')}`);

  // 3. same original year
  if (f.y) add('year', (d.byYear.get(f.y) || []).filter(i => i !== fi).sort(byColour).slice(0, 90), `Also from ${f.y}`, () => `Also from ${f.y}`);

  // 4. same style
  const fs = new Set(f.s);
  const styleHits = idx.filter(i => i !== fi && A[i].s.some(s => fs.has(s)))
    .map(i => [i, A[i].s.filter(s => fs.has(s)).length])
    .sort((p, q) => q[1] - p[1] || byColour(p[0], q[0])).slice(0, 140).map(p => p[0]);
  const topStyle = mostCommon(styleHits.filter(i => !used.has(i)).flatMap(i => A[i].s.filter(s => fs.has(s))));
  add('style', styleHits, `Same style: ${topStyle}`, i => `Same style: ${A[i].s.filter(s => fs.has(s)).join(', ')}`);

  // 5. same vinyl colour
  const vb = vinylBase(f.vc);
  if (vb) add('vinyl', idx.filter(i => i !== fi && vinylBase(A[i].vc) === vb).sort(byColour).slice(0, 90),
    `Also on ${vb} vinyl`, i => `Also on ${A[i].vc.toLowerCase()} vinyl`);

  // 6. everything else, nearest colour first
  const rest = idx.filter(i => !used.has(i)).sort(byColour);
  rest.forEach(i => { why[i] = ''; });
  tiers.push({ key: 'rest', label: 'Everything else, nearest colour first', items: rest, t: 6 });
  tier[fi] = 0;

  const order = [fi, ...tiers.flatMap(t => t.items)];
  const cx = new Float32Array(N), cy = new Float32Array(N), rank = new Float32Array(N);
  order.forEach((ai, k) => {
    const [dx, dy] = SPIRAL[k];
    cx[ai] = wrapP(cxC + dx, G); cy[ai] = wrapP(cyC + dy, R); rank[ai] = k;
  });

  // a label anchor per ring: its furthest tile in a fixed direction
  // directions kept clear of the card (right on desktop, bottom on phones)
  const DIRS = phone() ? [[0, -1], [-1, 0], [1, 0], [-0.7, -0.7], [0.7, -0.7]] : [[0, -1], [-1, 0], [0, 1], [-0.7, -0.7], [-0.7, 0.7]];
  let k0 = 1;
  for (const t of tiers) {
    t.start = k0; k0 += t.items.length;
    if (t.key === 'rest') continue;
    const dir = DIRS[(t.t - 1) % DIRS.length];
    let best = -1e9, bk = t.start;
    for (let k = t.start; k < t.start + t.items.length; k++) {
      const [dx, dy] = SPIRAL[k]; const len = Math.hypot(dx, dy) || 1;
      const s = (dx * dir[0] + dy * dir[1]) - 0.6 * Math.abs(dx * dir[1] - dy * dir[0]) + 0.001 * len;
      if (s > best) { best = s; bk = k; }
    }
    t.anchor = [cxC + SPIRAL[bk][0], cyC + SPIRAL[bk][1]];
    t.dir = dir;
  }
  return { cx, cy, rank, tier, why, tiers, focus: fi, centre: [cxC, cyC] };
}
function mostCommon(arr) {
  const m = new Map(); arr.forEach(x => m.set(x, (m.get(x) || 0) + 1));
  let best = '', n = -1; for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

// ---------------------------------------------------------------- renderer
const canvas = $('#wall');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x1b1a18, 1);
const scene = new THREE.Scene();
const FOV = 30;
const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 10000);
let W = 1, H = 1, DIST = 1;
const CURVE = 0.11;
const phone = () => W < 760;

const U = {
  uCam: { value: new THREE.Vector2(G / 2, R / 2) },
  uGrid: { value: new THREE.Vector2(G, R) },
  uScale: { value: 40 },
  uView: { value: new THREE.Vector2(1, 1) },
  uCurve: { value: CURVE },
  uPointer: { value: new THREE.Vector2(1e5, 1e5) },
  uPointerOn: { value: 0 },
  uLiftAmt: { value: 12 },
  uClipOff: { value: new THREE.Vector2(0, 0) },
  uT: { value: 100 },
  uDur: { value: 1.1 },
  uFlight: { value: 80 },
  uHover: { value: -1 },
  uHiTier: { value: -1 },
  uReady: { value: new THREE.Vector4(0, 0, 0, 0) },
  uCellW: { value: 1 / d.atlas.cols },
  atlas0: { value: null }, atlas1: { value: null }, atlas2: { value: null }, atlas3: { value: null },
};

const PLACE = /* glsl */`
uniform vec2 uCam; uniform vec2 uGrid; uniform float uScale; uniform vec2 uView; uniform float uCurve;
uniform vec2 uPointer; uniform float uPointerOn; uniform float uLiftAmt; uniform vec2 uClipOff;
vec3 placeTile(vec2 cell, vec2 corner, float mul, vec2 copy, float extraZ, out float vig, out float hov) {
  vec2 rel = mod(cell - uCam + uGrid * 0.5, uGrid) - uGrid * 0.5 + copy * uGrid;
  vec2 c = vec2(rel.x, -rel.y) * uScale;
  vec2 dp = c - uPointer;
  float s = uScale * 1.25 + 26.0;
  hov = uPointerOn * exp(-dot(dp, dp) / (2.0 * s * s));
  float size = uScale * 0.94 * mul * (1.0 + 0.09 * hov);
  vec2 xy = c + corner * size;
  float vl = length(uView);
  float r2 = dot(xy, xy) / (vl * vl);
  float z = -uCurve * r2 * vl + hov * uLiftAmt + extraZ;
  vig = r2;
  return vec3(xy, z);
}
vec4 toClip(vec3 p) {
  vec4 g = projectionMatrix * viewMatrix * vec4(p, 1.0);
  g.xy += uClipOff * g.w;
  return g;
}
`;
const CORNER = /* glsl */`
float roundMask(vec2 q, float r) {
  vec2 dd = abs(q - 0.5) * 2.0;
  vec2 k = max(dd - (1.0 - r), 0.0);
  return length(k) > r ? 0.0 : 1.0;
}
`;

const wallMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: PLACE + /* glsl */`
attribute vec4 aCell; attribute vec4 aAnim; attribute vec4 aLook; attribute vec4 aSrc; attribute vec3 aFlood; attribute vec2 aCopy;
uniform float uT; uniform float uDur; uniform float uFlight; uniform float uHover; uniform float uHiTier;
varying vec2 vUv; flat varying vec4 vSrc; flat varying vec3 vFlood; varying float vDim; varying float vFrame; varying float vVig; flat varying float vHov;
void main() {
  float e = clamp((uT - aAnim.x) / uDur, 0.0, 1.0);
  e = e < 0.5 ? 4.0 * e * e * e : 1.0 - pow(-2.0 * e + 2.0, 3.0) * 0.5;
  vec2 dl = aCell.zw - aCell.xy;
  dl -= uGrid * floor(dl / uGrid + 0.5);
  vec2 cell = aCell.xy + dl * e;
  float mul = mix(aAnim.y, aAnim.z, e);
  float fl = sin(3.14159 * e) * uFlight * min(1.0, length(dl) / 4.0);
  float vig, hov;
  vec3 p = placeTile(cell, position.xy, mul, aCopy, fl + (mul - 1.0) * 6.0, vig, hov);
  gl_Position = toClip(p);
  vUv = vec2(position.x + 0.5, 0.5 - position.y);
  vSrc = aSrc; vFlood = aFlood; vVig = vig;
  float dim = mix(aLook.x, aLook.y, e);
  if (uHiTier > -0.5 && abs(aAnim.w - uHiTier) > 0.5 && aAnim.w > 0.5) dim *= 0.32;
  vDim = dim;
  vFrame = mix(aLook.z, aLook.w, e);
  vHov = abs(aSrc.w - uHover) < 0.5 ? 1.0 : 0.0;
}`,
  fragmentShader: CORNER + /* glsl */`
uniform sampler2D atlas0; uniform sampler2D atlas1; uniform sampler2D atlas2; uniform sampler2D atlas3;
uniform vec4 uReady; uniform float uCellW;
varying vec2 vUv; flat varying vec4 vSrc; flat varying vec3 vFlood; varying float vDim; varying float vFrame; varying float vVig; flat varying float vHov;
void main() {
  if (roundMask(vUv, 0.07) < 0.5) discard;
  float inset = 1.5 / 128.0;
  vec2 uv = vSrc.xy + (vUv * (1.0 - 2.0 * inset) + inset) * uCellW;
  int s = int(vSrc.z + 0.5);
  vec3 col; float ready;
  if (s == 0) { col = texture2D(atlas0, uv).rgb; ready = uReady.x; }
  else if (s == 1) { col = texture2D(atlas1, uv).rgb; ready = uReady.y; }
  else if (s == 2) { col = texture2D(atlas2, uv).rgb; ready = uReady.z; }
  else { col = texture2D(atlas3, uv).rgb; ready = uReady.w; }
  col = mix(vFlood, col, ready);
  vec2 dd = abs(vUv - 0.5) * 2.0;
  float edge = max(dd.x, dd.y);
  float fa = smoothstep(0.89, 0.92, edge) * abs(vFrame);
  vec3 fc = vFrame < 0.0 ? vec3(0.949, 0.663, 0.231) : vec3(0.918, 0.902, 0.863);
  col = mix(col, fc, fa);
  col *= vDim;
  col *= 1.0 - 0.32 * smoothstep(0.15, 1.1, vVig);
  col *= 1.0 + 0.14 * vHov;
  gl_FragColor = vec4(col, 1.0);
}`,
});

// instanced geometry: N sleeves x 9 copies
const geo = new THREE.InstancedBufferGeometry();
const plane = new THREE.PlaneGeometry(1, 1);
geo.index = plane.index;
geo.setAttribute('position', plane.getAttribute('position'));
geo.instanceCount = N * COPIES;
const M = N * COPIES;
const attr = (name, size, dynamic) => {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(M * size), size);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, a); return a;
};
const aCell = attr('aCell', 4, true), aAnim = attr('aAnim', 4, true), aLook = attr('aLook', 4, true);
const aSrc = attr('aSrc', 4), aFlood = attr('aFlood', 3), aCopy = attr('aCopy', 2);
for (let c = 0; c < COPIES; c++) {
  const ox = (c % 3) - 1, oy = Math.floor(c / 3) - 1;
  for (let i = 0; i < N; i++) {
    const j = c * N + i;
    const cell = sleeveCell(d, i);
    aSrc.array.set([cell.u, cell.v, cell.sheet, i], j * 4);
    aFlood.array.set(rgbOf(A[i].fl), j * 3);
    aCopy.array.set([ox, oy], j * 2);
  }
}
const wall = new THREE.Mesh(geo, wallMat);
wall.frustumCulled = false;
scene.add(wall);

// atlases, flood colours first then the sleeves fade in
const loader = new THREE.TextureLoader();
const sheetReady = [0, 0, 0, 0], sheetLoaded = [0, 0, 0, 0]; // load time per sheet
const maxAniso = renderer.capabilities.getMaxAnisotropy();
for (let s = 0; s < 4; s++) {
  if (s >= sleeveSheetCount(d)) { U[`atlas${s}`].value = new THREE.DataTexture(new Uint8Array(4), 1, 1); U[`atlas${s}`].value.needsUpdate = true; continue; }
  U[`atlas${s}`].value = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  U[`atlas${s}`].value.needsUpdate = true;
  loader.load(sleeveSheetUrl(s), tex => {
    tex.flipY = false;
    tex.anisotropy = Math.min(4, maxAniso);
    tex.needsUpdate = true;
    U[`atlas${s}`].value = tex;
    sheetLoaded[s] = clock();
  });
}

// hi-res overlays for the few sleeves you're close enough to see properly
const overMat = () => new THREE.ShaderMaterial({
  uniforms: { ...U, uTex: { value: null }, uCellPos: { value: new THREE.Vector2() }, uMul: { value: 1 }, uAlpha: { value: 0 }, uDimO: { value: 1 } },
  transparent: true,
  depthTest: false,
  depthWrite: false,
  vertexShader: PLACE + /* glsl */`
uniform vec2 uCellPos; uniform float uMul;
varying vec2 vUv; varying float vVig;
void main() {
  float vig, hov;
  vec3 p = placeTile(uCellPos, position.xy, uMul, vec2(0.0), 1.0 + (uMul - 1.0) * 6.0, vig, hov);
  gl_Position = toClip(p);
  vUv = vec2(position.x + 0.5, 0.5 - position.y); vVig = vig;
}`,
  fragmentShader: CORNER + /* glsl */`
uniform sampler2D uTex; uniform float uAlpha; uniform float uDimO;
varying vec2 vUv; varying float vVig;
void main() {
  if (roundMask(vUv, 0.07) < 0.5) discard;
  vec3 col = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  col *= uDimO;
  col *= 1.0 - 0.32 * smoothstep(0.15, 1.1, vVig);
  gl_FragColor = vec4(col, uAlpha);
}`,
});
const OVERLAYS = Array.from({ length: 8 }, () => {
  const m = new THREE.Mesh(plane, overMat());
  m.frustumCulled = false; m.renderOrder = 2; m.visible = false;
  m.userData = { album: -1, alpha: 0 };
  scene.add(m); return m;
});
const hiCache = new Map();
function hiTex(ai) {
  let e = hiCache.get(ai);
  if (e) { hiCache.delete(ai); hiCache.set(ai, e); return e; }
  e = { tex: null };
  loader.load(sleeveUrl(A[ai], 'hi-res'), t => { t.anisotropy = Math.min(4, maxAniso); e.tex = t; e.at = clock(); });
  hiCache.set(ai, e);
  if (hiCache.size > 48) {
    for (const [k, v] of hiCache) {
      if (OVERLAYS.some(o => o.userData.album === k)) continue;
      v.tex?.dispose(); hiCache.delete(k); break;
    }
  }
  return e;
}

// ---------------------------------------------------------------- state
const S = {
  fx: new Float32Array(N), fy: new Float32Array(N), tx: new Float32Array(N), ty: new Float32Array(N),
  del: new Float32Array(N), mf: new Float32Array(N).fill(1), mt: new Float32Array(N).fill(1),
  df: new Float32Array(N).fill(1), dt: new Float32Array(N).fill(1), ff: new Float32Array(N), ft: new Float32Array(N),
  tier: new Float32Array(N),
};
const albumAt = new Int32Array(G * R).fill(-1);
let tStart = 0, maxDel = 0;
const DUR = reduce ? 0.001 : 1.1;
U.uDur.value = DUR;
const clock = () => performance.now() / 1000;
const ease = e => (e < 0.5 ? 4 * e * e * e : 1 - (-2 * e + 2) ** 3 / 2);
const animating = () => clock() - tStart < maxDel + DUR;

let mode = 'lens';       // 'lens' | 'focus'
let lens = ['colour', 'added', 'year', 'genre'].includes(params.get('lens')) ? params.get('lens') : 'colour';
let layout = null;        // current lens or focus layout
let path = [];            // chain of centred records
const reachMap = new Map(); // album -> { from, why } for the step that reached it
let inited = false;

function retarget(next, delays, look) {
  const now = clock();
  for (let i = 0; i < N; i++) {
    const e = ease(Math.min(1, Math.max(0, (now - tStart - S.del[i]) / DUR)));
    S.fx[i] = wrapP(S.fx[i] + wrapD(S.tx[i] - S.fx[i], G) * e, G);
    S.fy[i] = wrapP(S.fy[i] + wrapD(S.ty[i] - S.fy[i], R) * e, R);
    S.mf[i] += (S.mt[i] - S.mf[i]) * e;
    S.df[i] += (S.dt[i] - S.df[i]) * e;
    S.ff[i] += (S.ft[i] - S.ff[i]) * e;
    S.tx[i] = next.cx[i]; S.ty[i] = next.cy[i];
    const lk = look(i);
    S.mt[i] = lk.mul; S.dt[i] = lk.dim; S.ft[i] = lk.frame; S.tier[i] = lk.tier;
    S.del[i] = reduce ? 0 : delays(i);
  }
  maxDel = reduce ? 0 : Math.max(...S.del);
  tStart = now;
  albumAt.fill(-1);
  for (let i = 0; i < N; i++) albumAt[S.ty[i] * G + S.tx[i]] = i;
  if (next.focus != null) {
    const [cx, cy] = next.centre;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) albumAt[wrapP(cy + dy, R) * G + wrapP(cx + dx, G)] = next.focus;
  }
  for (let c = 0; c < COPIES; c++) {
    for (let i = 0; i < N; i++) {
      const j = (c * N + i) * 4;
      aCell.array[j] = S.fx[i]; aCell.array[j + 1] = S.fy[i]; aCell.array[j + 2] = S.tx[i]; aCell.array[j + 3] = S.ty[i];
      aAnim.array[j] = S.del[i]; aAnim.array[j + 1] = S.mf[i]; aAnim.array[j + 2] = S.mt[i]; aAnim.array[j + 3] = S.tier[i];
      aLook.array[j] = S.df[i]; aLook.array[j + 1] = S.dt[i]; aLook.array[j + 2] = S.ff[i]; aLook.array[j + 3] = S.ft[i];
    }
  }
  aCell.needsUpdate = aAnim.needsUpdate = aLook.needsUpdate = true;
  if (reduce) { canvas.classList.add('fade'); setTimeout(() => canvas.classList.remove('fade'), 190); }
}

const LENS_LOOK = () => ({ mul: 1, dim: 1, frame: 0, tier: 0 });
const FRAME = [0, -0.85, 0.8, 0.4, 0.8, 0.4, 0];
function focusLook(L) {
  return i => {
    const t = L.tier[i];
    return { mul: i === L.focus ? 3 : 1, dim: t === 6 ? 0.42 : 1, frame: FRAME[t], tier: t };
  };
}

// ---------------------------------------------------------------- camera
const cam = { x: G / 2, y: R / 2, s: 40 };
let vel = { x: 0, y: 0 };
let tween = null;
const off = { x: 0, y: 0, tx: 0, ty: 0 };
let minS = 8, maxS = 400;

function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  DIST = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180);
  camera.position.set(0, 0, DIST);
  camera.near = DIST * 0.2; camera.far = DIST * 3;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  U.uView.value.set(W / 2, H / 2);
  minS = Math.max(4, Math.min(W / G, H / R) * 0.9);
  maxS = Math.min(W, H) * 0.42;
  cam.s = Math.min(maxS, Math.max(minS, cam.s));
  layoutOffset();
}
const vl = () => Math.hypot(W / 2, H / 2);
function zAt(x, y) { const v = vl(); return -CURVE * (x * x + y * y) / (v * v) * v; }
// cell centre (absolute) -> screen px; k shifts by whole copies of the wall
function proj(cx, cy, k = 0, mul = 1) {
  const rx = wrapD(cx - cam.x, G) + k * G, ry = wrapD(cy - cam.y, R);
  const x = rx * cam.s, y = -ry * cam.s;
  const f = DIST / (DIST - zAt(x, y) - (mul - 1) * 6);
  return { x: W / 2 + off.x + x * f, y: H / 2 + off.y - y * f, size: cam.s * 0.94 * mul * f };
}
// screen px -> continuous cell coordinate (not wrapped)
function unproj(sx, sy) {
  const ox = sx - (W / 2 + off.x), oy = sy - (H / 2 + off.y);
  let x = ox, y = -oy;
  for (let n = 0; n < 5; n++) { const f = DIST / (DIST - zAt(x, y)); x = ox / f; y = -oy / f; }
  return { x: cam.x + x / cam.s, y: cam.y - y / cam.s, px: x, py: y };
}
function albumUnder(sx, sy) {
  const c = unproj(sx, sy);
  const gx = wrapP(Math.round(c.x), G), gy = wrapP(Math.round(c.y), R);
  return albumAt[gy * G + gx];
}
function zoomAt(sx, sy, k) {
  const before = unproj(sx, sy);
  cam.s = Math.min(maxS, Math.max(minS, cam.s * k));
  const after = unproj(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y;
}
function tweenCam(x, y, s, dur = 0.9) {
  if (reduce) dur = 0.001;
  tween = { x0: cam.x, y0: cam.y, s0: cam.s, dx: wrapD(x - cam.x, G), dy: wrapD(y - cam.y, R), s1: Math.min(maxS, Math.max(minS, s)), t0: clock(), dur };
  vel = { x: 0, y: 0 };
}
function layoutOffset() {
  const card = $('#card');
  if (card.hidden) { off.tx = 0; off.ty = 0; return; }
  if (phone()) {
    const top = 96, bottom = card.getBoundingClientRect().top || H * 0.55;
    off.tx = 0; off.ty = (top + bottom) / 2 - H / 2;
  } else {
    off.tx = -(card.offsetWidth + 32) / 2; off.ty = 10;
  }
}

// ---------------------------------------------------------------- modes
function lensDelays() {
  const rnd = i => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  return i => 0.12 * rnd(i) + 0.45 * (wrapD(S.tx[i] - cam.x, G) / G + 0.5);
}
function setLens(key, { intro = false } = {}) {
  lens = key; mode = 'lens'; path = [];
  tip.hidden = true;
  layout = lensLayout(key);
  if (!inited) {
    // first draw: either assemble from collection order, or start in place
    const start = intro ? fromOrder(idx) : layout;
    S.fx.set(start.cx); S.fy.set(start.cy); S.tx.set(start.cx); S.ty.set(start.cy);
    inited = true;
  }
  const rnd = i => ((Math.sin(i * 78.233) * 12543.123) % 1 + 1) % 1;
  retarget(layout, intro ? (i => 0.7 * rnd(i)) : lensDelays(), LENS_LOOK);
  document.querySelectorAll('.w-lenses button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lens === key)));
  $('#status').textContent = `${fmtN(N)} sleeves · ${LENSES[key].name}`;
  closeCard();
  renderPath();
  buildMarkers();
  buildRings();
  setURL();
}

function focusAlbum(fi, { from = null, keepPath = false } = {}) {
  const prev = mode === 'focus' ? layout : null;
  const reached = prev && prev.focus !== fi && prev.why[fi] ? { from: prev.focus, why: prev.why[fi] } : null;
  // centre the spiral on the screen-centre cell
  const c = unproj(W / 2 + off.tx, H / 2 + off.ty);
  const cx = wrapP(Math.round(c.x), G), cy = wrapP(Math.round(c.y), R);
  layout = focusLayout(fi, cx, cy);
  mode = 'focus';
  const L = layout;
  retarget(L, i => (i === fi ? 0 : 0.08 + 0.55 * Math.sqrt(L.rank[i] / N)), focusLook(L));
  if (!keepPath) {
    const at = path.indexOf(fi);
    if (at >= 0) path = path.slice(0, at + 1); else path.push(fi);
    if (path.length > 12) path = path.slice(-12);
  }
  if (reached) reachMap.set(fi, reached);
  document.querySelectorAll('.w-lenses button').forEach(b => b.setAttribute('aria-pressed', 'false'));
  $('#status').textContent = `Sorted around ${A[fi].t}`;
  showCard(fi);
  const s = Math.max(cam.s, phone() ? 26 : 38);
  tweenCam(cx, cy, Math.min(s, phone() ? 48 : 64), 1.0);
  renderPath();
  buildMarkers();
  buildRings();
  setURL();
  hideHint();
}

function back() {
  if (mode !== 'focus') return;
  if (path.length > 1) { path.pop(); focusAlbum(path.at(-1), { keepPath: true }); }
  else setLens(lens);
}

function setURL() {
  const p = new URLSearchParams();
  if (mode === 'focus') p.set('album', A[layout.focus].slug);
  else if (lens !== 'colour') p.set('lens', lens);
  history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`);
}

// ---------------------------------------------------------------- DOM: markers + ring labels
const markersEl = $('#markers'), ringsEl = $('#rings');
let markerEls = [];
function buildMarkers() {
  markersEl.innerHTML = '';
  markerEls = [];
  if (mode !== 'lens') return;
  for (const m of layout.markers) {
    for (let k = -1; k <= 1; k++) {
      const el = document.createElement('div');
      el.className = `w-marker${m.minor ? ' minor' : ''}`;
      el.textContent = m.text;
      markersEl.appendChild(el);
      markerEls.push({ el, m, k });
    }
  }
}
let ringEls = [];
function buildRings() {
  ringsEl.innerHTML = '';
  ringEls = [];
  if (mode !== 'focus') return;
  for (const t of layout.tiers) {
    if (!t.anchor) continue;
    const el = document.createElement('div');
    el.className = `w-ring t${t.t}`;
    el.innerHTML = `${esc(t.label)}<b>${fmtN(t.items.length)}</b>`;
    ringsEl.appendChild(el);
    ringEls.push({ el, t });
  }
}
function overCard(x, y) {
  if (card.hidden) return false;
  const r = card.getBoundingClientRect();
  return x > r.left - 20 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 20;
}
function placeOverlays() {
  const busy = animating();
  const op = busy ? '0' : '1';
  if (mode === 'lens') {
    const top = unproj(W / 2, 80).y;
    const vis = [];
    for (const it of markerEls) {
      const p = proj(it.m.col - 0.5, top, it.k);
      it.x = p.x;
      it.el.style.transform = `translateX(${p.x.toFixed(1)}px)`;
      if (p.x > -4 && p.x < W - 40 && (!it.m.minor || cam.s > 30)) vis.push(it); else it.el.style.opacity = '0';
    }
    // drop any marker that would overlap the one before it (majors first)
    vis.sort((a, b) => (a.m.minor - b.m.minor) || a.x - b.x);
    const taken = [];
    for (const it of vis) {
      const w = (it.el._w ||= it.el.offsetWidth || 60);
      const clash = taken.some(([l, r]) => it.x < r + 6 && it.x + w > l - 6);
      it.el.style.opacity = clash ? '0' : op;
      if (!clash) taken.push([it.x, it.x + w]);
    }
  } else {
    for (const { el, t } of ringEls) {
      const p = proj(t.anchor[0], t.anchor[1]);
      const h = p.size / 2 + 6;
      const [dx, dy] = t.dir;
      const x = p.x + dx * h, y = p.y + dy * h;
      const w = (el._w ||= el.offsetWidth), hh = (el._h ||= el.offsetHeight);
      let left = dx > 0.3 ? x : dx < -0.3 ? x - w : x - w / 2;
      const top = dy > 0.3 ? y : dy < -0.3 ? y - hh : y - hh / 2;
      const inView = x > 0 && x < W && y > (phone() ? 100 : 120) && y < H - 70;
      left = Math.max(8, Math.min(W - w - 8, left));
      const on = inView && cam.s > 9 && !overCard(left + w / 2, top + hh / 2) && !overCard(left, top) && !overCard(left + w, top);
      el.style.opacity = on ? op : '0';
      el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
  }
}

// ---------------------------------------------------------------- DOM: path, card, tip
const thumbStyle = (ai, px) => {
  const c = sleeveCell(d, ai);
  const cols = d.atlas.cols;
  return `background-image:url(${sleeveSheetUrl(c.sheet)});background-size:${cols * px}px ${cols * px}px;background-position:-${(c.x / c.size) * px}px -${(c.y / c.size) * px}px`;
};
function renderPath() {
  const el = $('#path');
  if (mode !== 'focus' || !path.length) { el.hidden = true; return; }
  el.hidden = false;
  const px = phone() ? 26 : 30;
  el.innerHTML = `<span class="x-label">Path</span>` + path.map((ai, k) =>
    `${k ? '<span class="sep">›</span>' : ''}<button type="button" data-ai="${ai}" title="${esc(A[ai].t)} · ${esc(A[ai].by)}" ${ai === layout.focus ? 'aria-current="true"' : ''}><span class="thumb" style="${thumbStyle(ai, px)}"></span></button>`).join('') +
    `<button type="button" class="close" data-close aria-label="Back to the whole wall" title="Back to the whole wall">×</button>`;
}
$('#path').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.close != null) return setLens(lens);
  focusAlbum(Number(b.dataset.ai));
});

const card = $('#card');
function closeCard() { card.hidden = true; card.innerHTML = ''; layoutOffset(); U.uHiTier.value = -1; }
function showCard(fi) {
  tip.hidden = true;
  const a = A[fi];
  const L = layout;
  const reach = reachMap.get(fi);
  const fromLine = reach && path.includes(reach.from)
    ? `<p class="from">From <button type="button" data-ai="${reach.from}">${esc(A[reach.from].t)}</button>: ${esc(reach.why)}</p>` : '';
  const artists = a.a.length ? a.a.map(i => `<a href="${artistHref(d.artists[i])}" target="_blank" rel="noopener">${esc(nameOf(i))}</a>`).join(', ') : esc(a.by);
  const rows = [
    ['Year', a.y],
    ['Label', a.l.slice(0, 2).join(', ')],
    ['Vinyl', a.vc],
    ['Format', a.fmt],
    ['Style', a.s.slice(0, 3).join(', ')],
    ['Added', fmtDate(a.added)],
  ].filter(r => r[1]);
  const v = a.v[0];
  const legend = L.tiers.map(t => `<li><button type="button" data-tier="${t.t}"><span class="sw t${t.t}"></span><span>${esc(t.label)}</span><span class="n">${fmtN(t.items.length)}</span></button></li>`).join('');
  card.innerHTML = `
    <button type="button" class="grab" aria-label="Show or hide details"></button>
    ${fromLine}
    <div class="head">
      <div class="sleeve" style="${thumbStyle(fi, phone() ? 76 : 112)}"><img alt="" src="${sleeveUrl(a, 'hi-res')}"></div>
      <div class="titles">
        <h2>${esc(a.t)}</h2>
        <div class="by">${artists}</div>
        <div class="actions">
          <a class="key primary" href="${albumHref(a)}" target="_blank" rel="noopener">Album page ↗</a>
          <button type="button" class="key" data-zoom>Zoom in</button>
        </div>
      </div>
    </div>
    <div class="body">
      <dl>${rows.map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('')}</dl>
      ${v ? `<div class="video"><div class="vframe"><img alt="" src="${ytThumb(v[0])}" loading="lazy"><button type="button" class="vplay" data-play="${v[0]}"><span>▶ Play ${v[2] === 'live' ? 'live video' : 'video'}</span></button></div><div class="vtitle">${esc(v[1])}</div></div>` : ''}
      <h3>Rings, from the centre out</h3>
      <ul class="legend">${legend}</ul>
    </div>`;
  const img = card.querySelector('.sleeve img');
  img.onload = () => img.classList.add('on');
  card.hidden = false;
  if (phone()) card.classList.add('collapsed');
  card.scrollTop = 0;
  requestAnimationFrame(layoutOffset);
  $('#live').textContent = `${a.t} by ${a.by}, centred. The wall is sorted around it.`;
}
card.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('grab')) { card.classList.toggle('collapsed'); requestAnimationFrame(layoutOffset); return; }
  if (b.dataset.play) {
    const fr = b.closest('.vframe');
    fr.innerHTML = `<iframe src="${ytEmbed(b.dataset.play, { start: 0, mute: 0 })}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`;
    return;
  }
  if (b.dataset.ai) return focusAlbum(Number(b.dataset.ai));
  if (b.dataset.zoom != null && mode === 'focus') {
    const [cx, cy] = layout.centre;
    return tweenCam(cx, cy, Math.min(maxS, (Math.min(W, H) * (phone() ? 0.5 : 0.62)) / 3), 0.8);
  }
  if (b.dataset.tier) {
    const t = layout.tiers.find(x => String(x.t) === b.dataset.tier);
    if (t?.anchor) tweenCam(t.anchor[0] - t.dir[0] * 2, t.anchor[1] - t.dir[1] * 2, cam.s, 0.7);
  }
});
card.addEventListener('pointerover', e => { const b = e.target.closest('[data-tier]'); U.uHiTier.value = b ? Number(b.dataset.tier) : -1; });
card.addEventListener('pointerleave', () => { U.uHiTier.value = -1; });
card.addEventListener('focusin', e => { const b = e.target.closest('[data-tier]'); U.uHiTier.value = b ? Number(b.dataset.tier) : -1; });

const tip = $('#tip');
function showTip(ai, x, y) {
  if (ai < 0 || phone()) { tip.hidden = true; return; }
  const a = A[ai];
  let why = '';
  if (mode === 'focus') why = ai === layout.focus ? '' : layout.why[ai] || 'Near in colour';
  else why = layout.tipOf(ai);
  tip.innerHTML = `<div class="t">${esc(a.t)}</div><div class="a">${esc(a.by)}${a.y ? ` · ${a.y}` : ''}</div>${why ? `<div class="why">${esc(why)}</div>` : ''}`;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const tx = Math.min(W - r.width - 8, x + 16), ty = y + 18 + r.height > H - 60 ? y - r.height - 12 : y + 18;
  tip.style.transform = `translate(${tx}px, ${ty}px)`;
}

let hintTimer = setTimeout(hideHint, 9000);
function hideHint() { $('#hint').classList.add('gone'); clearTimeout(hintTimer); }

// ---------------------------------------------------------------- input
const pointers = new Map();
let drag = null, pinch = null, hoverAi = -1, kbd = false;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tween = null; vel = { x: 0, y: 0 }; kbd = false;
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, lt: performance.now() };
  else if (pointers.size === 2) { drag = null; pinch = pinchState(); }
});
function pinchState() {
  const [p, q] = [...pointers.values()];
  return { dist: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
}
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && !pointers.size) {
    const c = unproj(e.clientX, e.clientY);
    U.uPointer.value.set(c.px, c.py);
    pointerTarget = reduce ? 0 : 1;
    const ai = albumUnder(e.clientX, e.clientY);
    if (ai !== hoverAi) { hoverAi = ai; U.uHover.value = ai; }
    showTip(animating() ? -1 : ai, e.clientX, e.clientY);
    return;
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const n = pinchState();
    zoomAt(n.mx, n.my, n.dist / pinch.dist);
    cam.x -= (n.mx - pinch.mx) / cam.s; cam.y -= (n.my - pinch.my) / cam.s;
    pinch = n; return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const now = performance.now(), dt = Math.max(1, now - drag.lt) / 1000;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 6) { canvas.classList.add('dragging'); tip.hidden = true; pointerTarget = 0; hideHint(); }
  cam.x -= dx / cam.s; cam.y -= dy / cam.s;
  vel.x = 0.75 * vel.x + 0.25 * (-dx / cam.s / dt); vel.y = 0.75 * vel.y + 0.25 * (-dy / cam.s / dt);
  drag.x = e.clientX; drag.y = e.clientY; drag.lt = now;
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; vel = { x: 0, y: 0 }; return; }
  if (!drag) return;
  const quick = performance.now() - drag.t < 450;
  if (drag.moved < 8 && quick && e.type === 'pointerup') {
    const ai = albumUnder(e.clientX, e.clientY);
    if (ai >= 0) {
      if (mode === 'focus' && ai === layout.focus) {
        const [cx, cy] = layout.centre;
        tweenCam(cx, cy, cam.s * 3 > Math.min(W, H) * 0.5 ? (phone() ? 26 : 40) : (Math.min(W, H) * 0.62) / 3, 0.8);
      } else focusAlbum(ai);
    }
    vel = { x: 0, y: 0 };
  } else if (performance.now() - drag.lt > 80 || reduce) vel = { x: 0, y: 0 };
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { pointerTarget = 0; tip.hidden = true; U.uHover.value = -1; hoverAi = -1; } });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); tween = null; hideHint();
  const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
  zoomAt(e.clientX, e.clientY, k);
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  const inCard = e.target.closest?.('.w-card, .w-top, .w-path');
  const step = 1;
  const pan = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (pan && !inCard) {
    e.preventDefault(); kbd = true;
    tweenCam(Math.round(cam.x + (tween ? tween.dx : 0)) + pan[0], Math.round(cam.y + (tween ? tween.dy : 0)) + pan[1], cam.s, 0.18);
  } else if ((e.key === '+' || e.key === '=') && !inCard) { zoomAt(W / 2 + off.x, H / 2 + off.y, 1.25); }
  else if ((e.key === '-' || e.key === '_') && !inCard) { zoomAt(W / 2 + off.x, H / 2 + off.y, 0.8); }
  else if (e.key === 'Enter' && !inCard) {
    const ai = albumUnder(W / 2 + off.x, H / 2 + off.y);
    if (ai >= 0 && !(mode === 'focus' && ai === layout.focus)) focusAlbum(ai);
  } else if (e.key === 'Escape') {
    const fr = card.querySelector('iframe');
    if (fr) { const id = new URL(fr.src).pathname.split('/').pop(); fr.closest('.vframe').innerHTML = `<img alt="" src="${ytThumb(id)}"><button type="button" class="vplay" data-play="${id}"><span>▶ Play video</span></button>`; }
    else back();
  }
});
document.querySelectorAll('.w-lenses button').forEach(b => b.addEventListener('click', () => setLens(b.dataset.lens)));
addEventListener('resize', () => { resize(); renderPath(); });

// ---------------------------------------------------------------- frame loop
let pointerTarget = 0, last = clock(), lastOverlay = 0;
function frame() {
  const now = clock(), dt = Math.min(0.1, now - last); last = now;
  if (tween) {
    const e = ease(Math.min(1, (now - tween.t0) / tween.dur));
    cam.x = tween.x0 + tween.dx * e; cam.y = tween.y0 + tween.dy * e;
    cam.s = tween.s0 * Math.pow(tween.s1 / tween.s0, e);
    if (e >= 1) tween = null;
  } else if (!drag && !pinch && (Math.abs(vel.x) + Math.abs(vel.y) > 0.01)) {
    cam.x += vel.x * dt; cam.y += vel.y * dt;
    const k = Math.exp(-dt * 4.2); vel.x *= k; vel.y *= k;
  }
  cam.x = wrapP(cam.x, G); cam.y = wrapP(cam.y, R);
  const ko = 1 - Math.exp(-dt * 8);
  off.x += (off.tx - off.x) * ko; off.y += (off.ty - off.y) * ko;

  for (let s = 0; s < 4; s++) if (sheetLoaded[s]) sheetReady[s] = Math.min(1, (now - sheetLoaded[s]) / 0.4);
  U.uReady.value.set(...sheetReady);
  U.uCam.value.set(cam.x, cam.y);
  U.uScale.value = cam.s;
  U.uClipOff.value.set((2 * off.x) / W, (-2 * off.y) / H);
  U.uT.value = now - tStart;
  U.uPointerOn.value += (pointerTarget - U.uPointerOn.value) * ko;
  U.uLiftAmt.value = Math.min(28, cam.s * 0.4);
  U.uFlight.value = reduce ? 0 : cam.s * 1.4 + 50;
  if (kbd) U.uHover.value = albumUnder(W / 2 + off.x, H / 2 + off.y);

  placeOverlays();
  if (now - lastOverlay > 0.15) { lastOverlay = now; pickHiRes(); }
  for (const o of OVERLAYS) {
    const u = o.material.uniforms;
    const entry = o.userData.album >= 0 ? hiCache.get(o.userData.album) : null;
    const ready = entry?.tex;
    if (ready && u.uTex.value !== ready) u.uTex.value = ready;
    o.userData.alpha = ready && !animating() ? Math.min(1, (now - Math.max(entry.at, tStart + maxDel + DUR)) / 0.3) : 0;
    u.uAlpha.value = o.userData.alpha;
    o.visible = o.userData.alpha > 0.01;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// load the real sleeve for the few tiles big enough to need it
function pickHiRes() {
  const want = [];
  if (!animating()) {
    const tile = cam.s * 0.94;
    if (mode === 'focus' && tile * 3 >= 130) want.push(layout.focus);
    if (tile >= 150) {
      const span = Math.ceil(Math.max(W, H) / cam.s / 2) + 1;
      const cand = [];
      for (let dy = -span; dy <= span; dy++) {
        for (let dx = -span; dx <= span; dx++) {
          const gx = wrapP(Math.round(cam.x) + dx, G), gy = wrapP(Math.round(cam.y) + dy, R);
          const ai = albumAt[gy * G + gx];
          if (ai < 0 || want.includes(ai) || cand.some(c => c[0] === ai)) continue;
          const p = proj(S.tx[ai], S.ty[ai], 0, S.mt[ai]);
          if (p.x < -p.size || p.x > W + p.size || p.y < -p.size || p.y > H + p.size) continue;
          cand.push([ai, Math.hypot(p.x - W / 2 - off.x, p.y - H / 2 - off.y)]);
        }
      }
      cand.sort((p, q) => p[1] - q[1]).slice(0, OVERLAYS.length - want.length).forEach(c => want.push(c[0]));
    }
  }
  const free = OVERLAYS.filter(o => !want.includes(o.userData.album));
  for (const o of OVERLAYS) if (!want.includes(o.userData.album)) { o.userData.album = -1; o.material.uniforms.uTex.value = null; o.userData.alpha = 0; }
  for (const ai of want) {
    if (OVERLAYS.some(o => o.userData.album === ai)) continue;
    const o = free.find(x => x.userData.album === -1); if (!o) break;
    o.userData.album = ai;
    hiTex(ai);
  }
  for (const o of OVERLAYS) {
    const ai = o.userData.album; if (ai < 0) continue;
    const u = o.material.uniforms;
    u.uCellPos.value.set(S.tx[ai], S.ty[ai]);
    u.uMul.value = S.mt[ai];
    u.uDimO.value = S.dt[ai];
  }
}

// ---------------------------------------------------------------- start
resize();
cam.s = phone() ? 30 : 44;
$('#loading').hidden = true;
const startSlug = params.get('album');
const startAi = startSlug != null ? d.albumBySlug.get(startSlug) : undefined;
setLens(lens, { intro: !reduce && startAi == null });
if (startAi != null) {
  cam.x = 0; cam.y = 0;
  focusAlbum(startAi);
  tween = null;
  const [cx, cy] = layout.centre; cam.x = cx; cam.y = cy;
  cam.s = phone() ? 34 : 54;
  off.x = off.tx; off.y = off.ty;
}
requestAnimationFrame(frame);
