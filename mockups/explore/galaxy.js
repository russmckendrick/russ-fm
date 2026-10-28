// The Galaxy: every artist in the collection as a star, grouped into the 12
// genre families, with light trails for the people they share.
// Three.js is imported by full URL so Vite leaves it alone; the import map in
// galaxy.html resolves the bare 'three' used inside the addons.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/lines/LineMaterial.js';
import {
  loadExplore, mountNav, artistUrl, fanartUrl, artistHref, albumHref, describeLink,
  avatarCell, avatarSheetUrl, sleeveCell, sleeveSheetUrl,
} from '/mockups/explore/shared.js';

const $ = id => document.getElementById(id);
const loaderEl = $('loader'), barEl = $('bar'), noteEl = $('loadnote');
const setProgress = (p, note) => {
  barEl.style.width = `${Math.round(p * 100)}%`;
  if (note) noteEl.textContent = note;
};
const fail = msg => { noteEl.textContent = `Something went wrong: ${msg}`; };
addEventListener('error', e => fail(e.message));
addEventListener('unhandledrejection', e => fail(e.reason?.message || String(e.reason)));

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => innerWidth <= 720;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').trim();
const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

mountNav('galaxy');
setProgress(0.04, 'Loading the collection');
const d = await loadExplore();
let VC = null;
try { VC = await fetch('/src/config/vinyl-colours.json').then(r => (r.ok ? r.json() : null)); } catch { /* plain black vinyl */ }
setProgress(0.15, 'Sorting artists into families');

// ---- data prep ------------------------------------------------------------
THREE.ColorManagement.enabled = false;
const A = d.artists, NA = A.length, FAM = d.families, NF = FAM.length;
const CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
const famIdx = new Map(FAM.map((f, i) => [f.key, i]));
const hidden = new Uint8Array(NA);
A.forEach((a, i) => { if (a.slug === 'various' || !a.records.length) hidden[i] = 1; });

const fam = new Uint8Array(NA);
const size = new Float32Array(NA);
const col = new Float32Array(NA * 3);
const tmpC = new THREE.Color();
const hsl = {};
A.forEach((a, i) => {
  const count = new Array(NF).fill(0);
  let r = 0, g = 0, b = 0;
  for (const ri of a.records) {
    const al = d.albums[ri];
    count[famIdx.get(al.fam)]++;
    tmpC.set(al.fl); r += tmpC.r; g += tmpC.g; b += tmpC.b;
  }
  let best = famIdx.get(d.albums[a.records[0]]?.fam) ?? 0;
  count.forEach((c, k) => { if (c > count[best]) best = k; });
  fam[i] = best;
  const n = Math.max(1, a.records.length);
  tmpC.setRGB(r / n, g / n, b / n).getHSL(hsl);
  tmpC.setHSL(hsl.h, Math.min(0.92, hsl.s * 1.45 + 0.12), THREE.MathUtils.clamp(hsl.l, 0.52, 0.7));
  col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
  size[i] = hidden[i] ? 0 : Math.min(21, 2.4 + 2.3 * Math.sqrt(a.records.length));
});

// Family colour: the average hue of its more colourful sleeves.
const famCol = FAM.map(f => {
  let x = 0, y = 0;
  for (const al of d.albums) {
    if (al.fam !== f.key) continue;
    tmpC.set(al.fl).getHSL(hsl);
    const w = hsl.s * (1 - Math.abs(hsl.l - 0.5) * 2);
    x += Math.cos(hsl.h * Math.PI * 2) * w;
    y += Math.sin(hsl.h * Math.PI * 2) * w;
  }
  const h = ((Math.atan2(y, x) / (Math.PI * 2)) + 1) % 1;
  return new THREE.Color().setHSL(h, 0.5, 0.64);
});
const famCount = new Array(NF).fill(0);
for (let i = 0; i < NA; i++) if (!hidden[i]) famCount[fam[i]]++;

// Links: colour by the strongest kind of reason.
const LINK_COLS = ['#A9C1EC', '#F2A93B', '#E07F98'].map(h => new THREE.Color(h));
const LINK_NAMES = ['member', 'bandmate', 'guest'];
const links = d.links.filter(l => !hidden[l.a] && !hidden[l.b]);
const linkType = links.map(l => (l.why.some(w => w.type === 'member' || w.type === 'group' || w.type === 'alias') ? 0
  : l.why.some(w => w.type === 'bandmate') ? 1 : 2));
const linksOf = A.map(() => []);
links.forEach((l, k) => { linksOf[l.a].push(k); linksOf[l.b].push(k); });
const otherEnd = (k, i) => (links[k].a === i ? links[k].b : links[k].a);
const visibleCount = NA - hidden.reduce((s, v) => s + v, 0);
$('count').textContent = `${plural(visibleCount, 'artist')} · ${plural(links.length, 'connection')}`;

// ---- layout (worker, cached) ---------------------------------------------
const famR = famCount.map(c => 50 + 30 * Math.cbrt(c));
const centres = FAM.map((f, k) => {
  const th = 0.3 + k * 0.72;
  const r = 600 + k * 190;
  return [Math.cos(th) * r, Math.sin(k * 1.7) * 90, Math.sin(th) * r];
});

function layout({ n, fam, size, hidden, links, centres, radii, iters }, progress) {
  let seed = 20261028;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const P = new Float32Array(n * 3), V = new Float32Array(n * 3), F = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = centres[fam[i]], R = radii[fam[i]];
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, rr = R * Math.cbrt(rnd()) * 0.85, q = Math.sqrt(1 - u * u);
    P[i * 3] = c[0] + Math.cos(t) * q * rr;
    P[i * 3 + 1] = c[1] + u * rr * 0.55;
    P[i * 3 + 2] = c[2] + Math.sin(t) * q * rr;
  }
  const CELL = 90;
  const cellKey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  for (let it = 0; it < iters; it++) {
    const alpha = 1 - (it / iters) * 0.85;
    F.fill(0);
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const k = cellKey(Math.floor(P[i * 3] / CELL), Math.floor(P[i * 3 + 1] / CELL), Math.floor(P[i * 3 + 2] / CELL));
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(i);
    }
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const cx = Math.floor(P[i * 3] / CELL), cy = Math.floor(P[i * 3 + 1] / CELL), cz = Math.floor(P[i * 3 + 2] / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const cell = grid.get(cellKey(cx + ox, cy + oy, cz + oz));
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2];
          const range = (size[i] + size[j]) * 2.2 + 24;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > range * range) continue;
          const dd = Math.sqrt(d2) + 0.01;
          const push = ((range - dd) / dd) * 0.12;
          F[i * 3] -= dx * push; F[i * 3 + 1] -= dy * push; F[i * 3 + 2] -= dz * push;
          F[j * 3] += dx * push; F[j * 3 + 1] += dy * push; F[j * 3 + 2] += dz * push;
        }
      }
    }
    for (let k = 0; k < links.length; k += 2) {
      const a = links[k], b = links[k + 1];
      const dx = P[b * 3] - P[a * 3], dy = P[b * 3 + 1] - P[a * 3 + 1], dz = P[b * 3 + 2] - P[a * 3 + 2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const same = fam[a] === fam[b];
      const rest = (size[a] + size[b]) * 1.6 + (same ? 34 : 60);
      const f = ((dd - rest) / dd) * (same ? 0.03 : 0.004);
      F[a * 3] += dx * f; F[a * 3 + 1] += dy * f; F[a * 3 + 2] += dz * f;
      F[b * 3] -= dx * f; F[b * 3 + 1] -= dy * f; F[b * 3 + 2] -= dz * f;
    }
    for (let i = 0; i < n; i++) {
      if (hidden[i]) continue;
      const c = centres[fam[i]], R = radii[fam[i]];
      const dx = c[0] - P[i * 3], dy = c[1] - P[i * 3 + 1], dz = c[2] - P[i * 3 + 2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const g = 0.004 + (dd > R ? (0.04 * (dd - R)) / dd : 0);
      F[i * 3] += dx * g; F[i * 3 + 1] += dy * g + dy * 0.006; F[i * 3 + 2] += dz * g;
      for (let a = 0; a < 3; a++) {
        let v = (V[i * 3 + a] + F[i * 3 + a]) * 0.6;
        if (v > 20) v = 20; else if (v < -20) v = -20;
        V[i * 3 + a] = v;
        P[i * 3 + a] += v * alpha;
      }
    }
    if (progress && it % 10 === 0) progress(it / iters);
  }
  return P;
}

function runLayout() {
  const linkArr = new Int32Array(links.length * 2);
  links.forEach((l, k) => { linkArr[k * 2] = l.a; linkArr[k * 2 + 1] = l.b; });
  const job = { n: NA, fam, size, hidden, links: linkArr, centres, radii: famR, iters: 320 };
  return new Promise(resolve => {
    let done = false;
    const local = () => { if (!done) { done = true; resolve(layout(job)); } };
    try {
      const src = `const layout = ${layout.toString()};
self.onmessage = e => { const P = layout(e.data, p => self.postMessage({ p })); self.postMessage({ P }, [P.buffer]); };`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = e => {
        if (e.data.p != null) setProgress(0.2 + e.data.p * 0.6);
        if (e.data.P && !done) { done = true; w.terminate(); resolve(e.data.P); }
      };
      w.onerror = () => { w.terminate(); local(); };
      w.postMessage(job);
    } catch { local(); }
  });
}

const LAYOUT_KEY = `galaxy-layout-v5-${NA}-${links.length}-${d.albums.length}`;
let pos = null;
try {
  const raw = localStorage.getItem(LAYOUT_KEY);
  if (raw) { const arr = JSON.parse(raw); if (arr.length === NA * 3) pos = Float32Array.from(arr); }
} catch { /* no cache */ }
if (!pos) {
  setProgress(0.2, `Placing ${plural(visibleCount, 'star')}`);
  pos = await runLayout();
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(Array.from(pos, v => Math.round(v * 10) / 10))); } catch { /* full */ }
}
setProgress(0.85, 'Lighting the stars');
const P = i => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

// family centroids and spread
const famC = FAM.map(() => new THREE.Vector3());
const famSpread = new Array(NF).fill(0);
for (let i = 0; i < NA; i++) if (!hidden[i]) famC[fam[i]].add(P(i));
famC.forEach((c, k) => c.divideScalar(Math.max(1, famCount[k])));
for (let i = 0; i < NA; i++) if (!hidden[i]) famSpread[fam[i]] += P(i).distanceToSquared(famC[fam[i]]);
famSpread.forEach((s, k) => { famSpread[k] = Math.sqrt(s / Math.max(1, famCount[k])) * 1.25; });
const galaxyC = famC.reduce((s, c) => s.add(c), new THREE.Vector3()).divideScalar(NF);

// ---- renderer ---------------------------------------------------------------
const canvas = $('sky');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone() ? 1.75 : 2));
const SKY = new THREE.Color('#121110');
renderer.setClearColor(SKY, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 2, 40000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.9;
controls.screenSpacePanning = true;
controls.minDistance = 12;
controls.maxDistance = 16000;
controls.autoRotateSpeed = 0.28;
let W = innerWidth, H = innerHeight;

const texLoader = new THREE.TextureLoader();
const prepTex = t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
const blank = new THREE.DataTexture(new Uint8Array([40, 38, 35, 255]), 1, 1);
blank.needsUpdate = true;

// ---- stars --------------------------------------------------------------------
const quad = new THREE.PlaneGeometry(1, 1);
function instanced(count) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  g.instanceCount = count;
  return g;
}
const starGeo = instanced(NA);
const cells = new Float32Array(NA * 4);
const seeds = new Float32Array(NA);
for (let i = 0; i < NA; i++) {
  const c = avatarCell(d, i);
  cells.set([c.u, c.v, c.w, c.h], i * 4);
  seeds[i] = Math.random();
}
const dimArr = new Float32Array(NA);
const hiArr = new Float32Array(NA);
starGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
starGeo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
starGeo.setAttribute('iCol', new THREE.InstancedBufferAttribute(col, 3));
starGeo.setAttribute('iCell', new THREE.InstancedBufferAttribute(cells, 4));
starGeo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
const dimAttr = new THREE.InstancedBufferAttribute(dimArr, 1).setUsage(THREE.DynamicDrawUsage);
const hiAttr = new THREE.InstancedBufferAttribute(hiArr, 1).setUsage(THREE.DynamicDrawUsage);
starGeo.setAttribute('iDim', dimAttr);
starGeo.setAttribute('iHi', hiAttr);

const shared = {
  uRes: { value: new THREE.Vector2(W, H) },
  uMinPx: { value: 2.3 },
  uTime: { value: 0 },
  uFocus: { value: 0 },
};
const STAR_VS = /* glsl */`
attribute vec3 iPos; attribute float iSize; attribute vec3 iCol; attribute vec4 iCell;
attribute float iDim; attribute float iHi; attribute float iSeed;
uniform vec2 uRes; uniform float uMinPx; uniform float uQuad; uniform float uTime; uniform float uFocus;
varying vec2 vUv; varying vec3 vCol; varying vec4 vCell; varying float vDim; varying float vHi; varying float vPx; varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float z = max(-mv.z, 0.1);
  float px = iSize * projectionMatrix[1][1] * uRes.y * 0.5 / z;
  float s = iSize * max(1.0, uMinPx / max(px, 0.001));
  vPx = px;
  vec2 q = position.xy * 2.0 * uQuad;
  mv.xy += q * s;
  vUv = q; vCol = iCol; vCell = iCell; vDim = iDim * uFocus; vHi = iHi;
  vTw = 0.82 + 0.18 * sin(uTime * (0.5 + fract(iSeed * 7.0)) + iSeed * 40.0);
  gl_Position = iSize <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;
const avatarTex = blank;
const coreMat = new THREE.ShaderMaterial({
  uniforms: { ...shared, uQuad: { value: 1 }, uAtlas: { value: avatarTex }, uBg: { value: SKY } },
  vertexShader: STAR_VS,
  fragmentShader: /* glsl */`
uniform sampler2D uAtlas; uniform vec3 uBg;
varying vec2 vUv; varying vec3 vCol; varying vec4 vCell; varying float vDim; varying float vHi; varying float vPx;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  vec2 t = vUv * 0.5 + 0.5; t.y = 1.0 - t.y;
  vec3 img = texture2D(uAtlas, vCell.xy + (t * 0.94 + 0.03) * vCell.zw).rgb;
  vec3 c = mix(img, vCol, smoothstep(9.0, 3.5, vPx));
  c = mix(c, vCol, smoothstep(0.84, 0.93, r) * 0.9);
  c = mix(c, uBg, vDim * 0.82);
  gl_FragColor = vec4(c, 1.0);
}`,
});
const glowMat = new THREE.ShaderMaterial({
  uniforms: { ...shared, uQuad: { value: 4.2 } },
  vertexShader: STAR_VS,
  fragmentShader: /* glsl */`
uniform float uQuad;
varying vec2 vUv; varying vec3 vCol; varying float vDim; varying float vHi; varying float vTw; varying float vPx;
void main() {
  float r = length(vUv);
  float g = pow(clamp(1.0 - (r - 0.85) / (uQuad - 0.85), 0.0, 1.0), 2.8) * smoothstep(0.92, 1.04, r);
  float a = g * 0.5 * vTw * (1.0 - vDim * 0.92) * (1.0 + vHi * 0.8) * mix(1.0, 0.3, smoothstep(12.0, 70.0, vPx));
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
}`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
// share the uniform objects so one update reaches both
for (const k of Object.keys(shared)) { coreMat.uniforms[k] = shared[k]; glowMat.uniforms[k] = shared[k]; }
const coreMesh = new THREE.Mesh(starGeo, coreMat);
const glowMesh = new THREE.Mesh(starGeo, glowMat);
coreMesh.frustumCulled = glowMesh.frustumCulled = false;
coreMesh.renderOrder = 2; glowMesh.renderOrder = 3;
scene.add(coreMesh, glowMesh);
texLoader.load(avatarSheetUrl, t => { coreMat.uniforms.uAtlas.value = prepTex(t); });

// ---- light trails -------------------------------------------------------------
const SEG = 14;
const bez = (a, c, b, t, out) => {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
};
function linkCtrl(k) {
  const a = P(links[k].a), b = P(links[k].b);
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y += a.distanceTo(b) * 0.17;
  return [a, c, b];
}
/** Curve along link k, starting at artist `from`. */
function linkPath(k, from) {
  const [a, c, b] = linkCtrl(k);
  const rev = links[k].a !== from;
  return t => bez(a, c, b, rev ? 1 - t : t, new THREE.Vector3());
}
const trailPos = new Float32Array(links.length * SEG * 6);
const trailCol = new Float32Array(links.length * SEG * 6);
const trailOn = new Float32Array(links.length * SEG * 2);
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  links.forEach((l, k) => {
    const [a, c, b] = linkCtrl(k);
    const lc = LINK_COLS[linkType[k]];
    for (let s = 0; s < SEG; s++) {
      bez(a, c, b, s / SEG, p0); bez(a, c, b, (s + 1) / SEG, p1);
      const o = (k * SEG + s) * 6;
      trailPos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], o);
      trailCol.set([lc.r, lc.g, lc.b, lc.r, lc.g, lc.b], o);
    }
  });
}
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailOnAttr = new THREE.BufferAttribute(trailOn, 1).setUsage(THREE.DynamicDrawUsage);
trailGeo.setAttribute('aOn', trailOnAttr);
const trailMat = new THREE.ShaderMaterial({
  uniforms: { uFocus: shared.uFocus, uBase: { value: 0.2 } },
  vertexShader: /* glsl */`
attribute vec3 color; attribute float aOn;
uniform float uFocus; uniform float uBase;
varying vec3 vC; varying float vA;
void main() {
  vC = color;
  vA = aOn > 0.5 ? 0.0 : uBase * (1.0 - 0.82 * uFocus);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */`
varying vec3 vC; varying float vA;
void main() { gl_FragColor = vec4(vC, vA); }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const trails = new THREE.LineSegments(trailGeo, trailMat);
trails.frustumCulled = false;
trails.renderOrder = 1;
scene.add(trails);

// bright trails for the focused artist
const fatMat = new LineMaterial({
  vertexColors: true, linewidth: 2, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false,
});
fatMat.resolution.set(W, H);
let fatLines = null;

// ---- dust: one mote per record, plus faint family haze ---------------------------
const rand = (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const gauss = () => { let u = 0; for (let k = 0; k < 3; k++) u += rand(); return (u - 1.5) * 1.15; };
const dustP = [], dustC = [], dustS = [], dustA = [];
d.albums.forEach(al => {
  const i = al.a.find(x => !hidden[x]);
  if (i == null) return;
  const s = size[i] * 1.6 + 6;
  const p = P(i).add(new THREE.Vector3(gauss() * s, gauss() * s * 0.6, gauss() * s));
  const k = fam[i];
  if (rand() < 0.35) p.lerp(famC[k].clone().add(new THREE.Vector3(gauss(), gauss() * 0.5, gauss()).multiplyScalar(famSpread[k] * 0.6)), rand() * 0.5);
  tmpC.set(al.fl);
  dustP.push(p.x, p.y, p.z); dustC.push(tmpC.r, tmpC.g, tmpC.b); dustS.push(2 + rand() * 2.2); dustA.push(0.55);
});
FAM.forEach((f, k) => {
  const n = Math.round(160 + famCount[k] * 1.4);
  for (let j = 0; j < n; j++) {
    const p = famC[k].clone().add(new THREE.Vector3(gauss(), gauss() * 0.45, gauss()).multiplyScalar(famSpread[k] * 0.75));
    dustP.push(p.x, p.y, p.z); dustC.push(famCol[k].r, famCol[k].g, famCol[k].b); dustS.push(3 + rand() * 6); dustA.push(0.16);
  }
});
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustP, 3));
dustGeo.setAttribute('color', new THREE.Float32BufferAttribute(dustC, 3));
dustGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(dustS, 1));
dustGeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(dustA, 1));
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 1 }, uFocus: shared.uFocus, uPR: { value: renderer.getPixelRatio() } },
  vertexShader: /* glsl */`
attribute vec3 color; attribute float aSize; attribute float aAlpha;
uniform float uScale; uniform float uPR;
varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uScale / max(-mv.z, 1.0);
  vA = aAlpha * smoothstep(0.4, 1.6, px);
  gl_PointSize = clamp(px, 1.2, 28.0) * uPR;
  vC = color;
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader: /* glsl */`
uniform float uFocus;
varying vec3 vC; varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 1.8) * vA * (1.0 - uFocus * 0.72);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, a);
}`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);

// soft haze per family
const hazeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
})();
const hazes = FAM.map((f, k) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, color: famCol[k], opacity: 0.075, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.copy(famC[k]);
  s.scale.setScalar(famSpread[k] * 3.4);
  s.renderOrder = 0;
  scene.add(s);
  return s;
});

// far background stars
{
  const n = 2600, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) {
    const u = rand() * 2 - 1, t = rand() * Math.PI * 2, q = Math.sqrt(1 - u * u), r = 12000 + rand() * 9000;
    p.set([Math.cos(t) * q * r, u * r, Math.sin(t) * q * r], j * 3);
    const b = 0.18 + rand() * rand() * 0.55;
    c.set([b, b * 0.97, b * 0.9], j * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4 * renderer.getPixelRatio(), sizeAttenuation: false, vertexColors: true, depthWrite: false })));
}

// travelling spark used during a hop
const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
spark.visible = false;
spark.renderOrder = 6;
scene.add(spark);

// ---- orbiting records ---------------------------------------------------------------
const MAX_DISCS = 48;
const discGeo = instanced(0);
const discPos = new Float32Array(MAX_DISCS * 3);
const discPosAttr = new THREE.InstancedBufferAttribute(discPos, 3).setUsage(THREE.DynamicDrawUsage);
discGeo.setAttribute('iPos', discPosAttr);
const discAttrs = {
  iR: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
  iCell: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 4), 4),
  iVin: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 3), 3),
  iFl: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 3), 3),
  iAlpha: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
  iPat: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
  iSeed: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
};
for (const [k, v] of Object.entries(discAttrs)) discGeo.setAttribute(k, v);
const discMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: shared.uTime, uSpin: { value: RM ? 0 : 1.6 }, uAppear: { value: 0 },
    uS0: { value: blank }, uS1: { value: blank }, uS2: { value: blank }, uS3: { value: blank },
    uHave: { value: new THREE.Vector4() },
  },
  vertexShader: /* glsl */`
attribute vec3 iPos; attribute float iR; attribute vec4 iCell; attribute vec3 iVin; attribute vec3 iFl;
attribute float iAlpha; attribute float iPat; attribute float iSeed;
uniform float uTime; uniform float uSpin; uniform float uAppear;
varying vec2 vP; varying vec4 vCell; varying vec3 vVin; varying vec3 vFl; varying float vAlpha; varying float vPat; varying float vSeed; varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vP = position.xy * 2.0;
  mv.xy += vP * iR * uAppear;
  vRot = -uTime * uSpin + iSeed * 6.2831;
  vCell = iCell; vVin = iVin; vFl = iFl; vAlpha = iAlpha; vPat = iPat; vSeed = iSeed;
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader: /* glsl */`
uniform sampler2D uS0; uniform sampler2D uS1; uniform sampler2D uS2; uniform sampler2D uS3; uniform vec4 uHave;
varying vec2 vP; varying vec4 vCell; varying vec3 vVin; varying vec3 vFl; varying float vAlpha; varying float vPat; varying float vSeed; varying float vRot;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float r = length(vP);
  if (r > 1.0 || r < 0.045) discard;
  float cs = cos(vRot), sn = sin(vRot);
  vec2 q = mat2(cs, -sn, sn, cs) * vP;
  const float LABEL = 0.4;
  vec2 t = clamp(q / LABEL * 0.47 + 0.5, 0.0, 1.0); t.y = 1.0 - t.y;
  vec2 st = vCell.xy + t * vCell.z;
  vec3 s0 = texture2D(uS0, st).rgb, s1 = texture2D(uS1, st).rgb, s2 = texture2D(uS2, st).rgb, s3 = texture2D(uS3, st).rgb;
  float sh = vCell.w;
  vec3 tex = sh < 0.5 ? s0 : sh < 1.5 ? s1 : sh < 2.5 ? s2 : s3;
  float have = sh < 0.5 ? uHave.x : sh < 1.5 ? uHave.y : sh < 2.5 ? uHave.z : uHave.w;
  vec3 c; float a = 1.0;
  if (r < LABEL) {
    c = mix(vFl, tex, have) * (1.0 - 0.3 * smoothstep(LABEL - 0.03, LABEL, r));
  } else {
    vec3 base = vVin;
    if (vPat > 0.5 && vPat < 1.5) {
      float n = sin(q.x * 6.0 + sin(q.y * 4.0 + vSeed * 10.0) * 2.2) * sin(q.y * 5.0 + vSeed * 3.0);
      base = mix(base, vFl, smoothstep(0.0, 0.7, n) * 0.7);
    } else if (vPat > 1.5) {
      base = mix(base, vFl, step(0.86, hash(floor(q * 16.0) + vSeed)) * 0.85);
    }
    base *= 0.9 + 0.1 * (0.5 + 0.5 * sin(r * 230.0));
    float ang = atan(vP.y, vP.x);
    base += vec3(pow(abs(cos(ang - 0.7)), 16.0) * 0.24);
    base = mix(base, base * 0.55, smoothstep(0.9, 1.0, r));
    base += vec3(0.1) * smoothstep(0.965, 1.0, r);
    c = base; a = vAlpha;
  }
  gl_FragColor = vec4(c, a);
}`,
  transparent: true,
});
const discs = new THREE.Mesh(discGeo, discMat);
discs.frustumCulled = false;
discs.renderOrder = 5;
scene.add(discs);
const sheets = [];
function needSheet(s) {
  if (sheets[s]) return;
  sheets[s] = texLoader.load(sleeveSheetUrl(s), t => {
    discMat.uniforms[`uS${s}`].value = prepTex(t);
    discMat.uniforms.uHave.value.setComponent(s, 1);
  });
}

function vinylLook(vc) {
  if (!vc) return { c: '#0d0d0d', a: 1, pat: 0 };
  const s = vc.toLowerCase();
  const words = s.split(/[^a-z]+/).filter(Boolean);
  let c = null, pat = 0;
  if (VC) {
    for (const [p, h] of Object.entries(VC.phrases || {})) if (s.includes(p)) { c = h; break; }
    if (!c) for (const w of words) if (VC.colours?.[w]) { c = VC.colours[w]; break; }
    for (const [name, stems] of Object.entries(VC.patterns || {})) {
      if (stems.some(st => s.includes(st))) { pat = name === 'splatter' ? 2 : 1; break; }
    }
  }
  const glass = words.some(w => (VC?.glass || ['clear', 'crystal']).includes(w));
  const trans = words.some(w => (VC?.translucent || ['transparent', 'translucent']).includes(w));
  if (!c && glass) c = '#dcdad2';
  return { c: c || '#8b8f94', a: glass ? 0.5 : trans ? 0.74 : 1, pat };
}

const orbit = { artist: -1, recs: [], rings: [], disc: 3, U: new THREE.Vector3(), Ws: [], centre: new THREE.Vector3() };
function orbitSpec(i) {
  const recs = [...A[i].records].sort((x, y) => (d.albums[x].y || 9999) - (d.albums[y].y || 9999)).slice(0, isPhone() ? 28 : MAX_DISCS);
  const s = size[i];
  const disc = Math.max(2.4, (s * 0.4 + 1.6) * (recs.length > 18 ? 0.8 : 1));
  const rings = [];
  let placed = 0, k = 0;
  const r0 = s * 1.8 + disc * 2.3;
  while (placed < recs.length) {
    const R = r0 + k * disc * 3.1;
    const cap = Math.max(6, Math.floor((Math.PI * 2 * R) / (disc * 2.5)));
    const m = Math.min(cap, recs.length - placed);
    rings.push({ R, m, start: placed });
    placed += m; k++;
  }
  const outer = rings.length ? rings[rings.length - 1].R + disc : s * 2;
  return { recs, disc, rings, outer };
}
function buildOrbit(i, viewDir) {
  const spec = orbitSpec(i);
  Object.assign(orbit, spec, { artist: i, centre: P(i) });
  const vd = viewDir.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(vd);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const up = vd.clone().cross(right).normalize();
  orbit.U = right;
  orbit.Ws = spec.rings.map((r, k) => {
    const tilt = THREE.MathUtils.degToRad(60 + k * 4);
    const nrm = vd.clone().multiplyScalar(Math.cos(tilt)).add(up.clone().multiplyScalar(Math.sin(tilt))).normalize();
    return nrm.clone().cross(right).normalize();
  });
  spec.recs.forEach((ri, j) => {
    const al = d.albums[ri];
    const c = sleeveCell(d, ri);
    needSheet(c.sheet);
    discAttrs.iR.array[j] = spec.disc;
    discAttrs.iCell.array.set([c.u, c.v, c.w, c.sheet], j * 4);
    const v = vinylLook(al.vc);
    tmpC.set(v.c); discAttrs.iVin.array.set([tmpC.r, tmpC.g, tmpC.b], j * 3);
    tmpC.set(al.fl); discAttrs.iFl.array.set([tmpC.r, tmpC.g, tmpC.b], j * 3);
    discAttrs.iAlpha.array[j] = v.a;
    discAttrs.iPat.array[j] = v.pat;
    discAttrs.iSeed.array[j] = (j * 0.618) % 1;
  });
  for (const a of Object.values(discAttrs)) a.needsUpdate = true;
  discGeo.instanceCount = spec.recs.length;
  discMat.uniforms.uAppear.value = 0;
  updateOrbit(0);
}
function clearOrbit() { orbit.artist = -1; orbit.recs = []; discGeo.instanceCount = 0; }
function updateOrbit(time) {
  if (orbit.artist < 0) return;
  const c = orbit.centre;
  orbit.rings.forEach((ring, k) => {
    const w = orbit.Ws[k];
    const speed = RM ? 0 : 0.16 / (1 + k * 0.4) * (k % 2 ? -1 : 1);
    for (let q = 0; q < ring.m; q++) {
      const j = ring.start + q;
      const ang = (q / ring.m) * Math.PI * 2 + time * speed + k * 0.4;
      const ca = Math.cos(ang) * ring.R, sa = Math.sin(ang) * ring.R;
      discPos[j * 3] = c.x + orbit.U.x * ca + w.x * sa;
      discPos[j * 3 + 1] = c.y + orbit.U.y * ca + w.y * sa;
      discPos[j * 3 + 2] = c.z + orbit.U.z * ca + w.z * sa;
    }
  });
  discPosAttr.needsUpdate = true;
}

// ---- labels -------------------------------------------------------------------
const labelsEl = $('labels');
const famEls = FAM.map((f, k) => {
  const b = document.createElement('button');
  b.className = 'g-fam';
  b.type = 'button';
  b.style.setProperty('--fc', `#${famCol[k].clone().offsetHSL(0, 0, 0.1).getHexString()}`);
  b.innerHTML = `<b>${CODES[k]}</b>${esc(f.name)}<small>${plural(famCount[k], 'artist')}</small>`;
  b.addEventListener('click', () => flyToFamily(k));
  labelsEl.append(b);
  return b;
});
const famLabelAt = famC.map((c, k) => c.clone().add(new THREE.Vector3(0, famSpread[k] * 0.62, 0)));
let nearEls = [];
let meEl = null;

const _v = new THREE.Vector3();
function toScreen(v) {
  _v.copy(v).applyMatrix4(camera.matrixWorldInverse);
  const z = -_v.z;
  if (z <= 1) return null;
  _v.applyMatrix4(camera.projectionMatrix);
  return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, z };
}
const place = (el, s, dy = 0) => {
  if (!s || s.x < -200 || s.x > W + 200 || s.y < -100 || s.y > H + 100) { el.style.visibility = 'hidden'; return false; }
  el.style.visibility = 'visible';
  el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + dy).toFixed(1)}px) translate(-50%, -50%)`;
  return true;
};
function updateLabels() {
  const camPos = camera.position;
  famEls.forEach((el, k) => {
    const s = toScreen(famLabelAt[k]);
    const dist = camPos.distanceTo(famC[k]);
    let o = THREE.MathUtils.clamp((dist - famSpread[k] * 0.9) / (famSpread[k] * 1.2), 0, 1);
    if (focus >= 0) o *= 0.3;
    el.style.opacity = o.toFixed(2);
    el.style.pointerEvents = o > 0.2 ? 'auto' : 'none';
    place(el, s);
  });
  if (focus >= 0) {
    const proj11 = camera.projectionMatrix.elements[5];
    // usable screen area, clear of the header, panel and nav
    const phone = isPhone();
    const bx = { l: 14, t: phone ? 110 : 178, r: W - 14 - (phone || panel.hidden ? 0 : panel.offsetWidth + 12), b: H - 74 - (phone && !panel.hidden ? panel.offsetHeight : 0) };
    const fc = toScreen(orbit.centre) || { x: (bx.l + bx.r) / 2, y: (bx.t + bx.b) / 2 };
    const fv = orbit.centre.clone().applyMatrix4(camera.matrixWorldInverse);
    const edge = [];
    for (const el of nearEls) {
      const i = +el.dataset.i;
      const s = toScreen(P(i));
      const r = s ? Math.max(size[i] * proj11 * H * 0.5 / s.z, 2.3) : 0;
      if (s && s.x > bx.l && s.x < bx.r && s.y > bx.t && s.y < bx.b) {
        el.classList.remove('is-edge');
        place(el, s, r + 11);
        continue;
      }
      // off screen: pin to the edge, pointing the way
      const cv = P(i).applyMatrix4(camera.matrixWorldInverse);
      let dx = cv.x - fv.x, dy = -(cv.y - fv.y);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const cx = THREE.MathUtils.clamp(fc.x, bx.l + 1, bx.r - 1), cy = THREE.MathUtils.clamp(fc.y, bx.t + 1, bx.b - 1);
      const t = Math.min(dx > 0 ? (bx.r - cx) / dx : dx < 0 ? (bx.l - cx) / dx : Infinity, dy > 0 ? (bx.b - cy) / dy : dy < 0 ? (bx.t - cy) / dy : Infinity);
      el.classList.add('is-edge');
      el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
      const w = el.offsetWidth, h = el.offsetHeight;
      const x = THREE.MathUtils.clamp(cx + dx * t, bx.l + w / 2, bx.r - w / 2);
      const y = THREE.MathUtils.clamp(cy + dy * t, bx.t + h / 2, bx.b - h / 2);
      const vert = Math.abs(dx * t + cx - (dx > 0 ? bx.r : bx.l)) < 2;
      edge.push({ el, x, y, w, h, side: vert ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'B' : 'T') });
    }
    // keep pinned labels on the same edge from piling up
    for (const side of ['L', 'R', 'T', 'B']) {
      const vert = side === 'L' || side === 'R';
      const list = edge.filter(e => e.side === side).sort((p, q) => (vert ? p.y - q.y : p.x - q.x));
      for (let n = 1; n < list.length; n++) {
        const p = list[n - 1], q = list[n];
        if (vert && q.y - p.y < (p.h + q.h) / 2 + 4) q.y = p.y + (p.h + q.h) / 2 + 4;
        if (!vert && q.x - p.x < (p.w + q.w) / 2 + 6) q.x = p.x + (p.w + q.w) / 2 + 6;
      }
    }
    for (const e of edge) {
      const out = e.x + e.w / 2 > bx.r + 2 || e.y + e.h / 2 > bx.b + 2;
      if (out) e.el.style.visibility = 'hidden'; else place(e.el, e);
    }
    if (meEl) {
      const s = toScreen(orbit.centre);
      const r = s ? Math.max(size[focus] * proj11 * H * 0.5 / s.z, 2.3) : 0;
      place(meEl, s, r + 14);
    }
  }
}

// ---- focus --------------------------------------------------------------------
let focus = -1;
let pathHist = [];
let focusTarget = 0;
const panel = $('panel');

function setFocus(i, viewDir) {
  focus = i;
  dimArr.fill(1);
  hiArr.fill(0);
  dimArr[i] = 0; hiArr[i] = 1;
  const ks = linksOf[i];
  for (const k of ks) { const o = otherEnd(k, i); dimArr[o] = 0; hiArr[o] = 0.55; }
  dimAttr.needsUpdate = hiAttr.needsUpdate = true;
  trailOn.fill(0);
  for (const k of ks) trailOn.fill(1, k * SEG * 2, (k + 1) * SEG * 2);
  trailOnAttr.needsUpdate = true;
  focusTarget = 1;

  // bright trails
  if (fatLines) { scene.remove(fatLines); fatLines.geometry.dispose(); fatLines = null; }
  if (ks.length) {
    const pp = [], cc = [];
    for (const k of ks) {
      const off = k * SEG * 6;
      for (let s = 0; s < SEG * 6; s++) pp.push(trailPos[off + s]);
      const lc = LINK_COLS[linkType[k]];
      for (let s = 0; s < SEG * 2; s++) cc.push(lc.r, lc.g, lc.b);
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(pp);
    g.setColors(cc);
    fatLines = new LineSegments2(g, fatMat);
    fatLines.renderOrder = 4;
    scene.add(fatLines);
  }
  fatMat.opacity = 0;

  buildOrbit(i, viewDir);
  buildNearLabels(i);
  renderPanel(i);
  try {
    const u = new URL(location.href);
    u.searchParams.set('seed', A[i].slug);
    history.replaceState(null, '', u);
  } catch { /* file: */ }
}

function clearFocus() {
  focus = -1;
  focusTarget = 0;
  clearOrbit();
  if (fatLines) { scene.remove(fatLines); fatLines.geometry.dispose(); fatLines = null; }
  nearEls.forEach(e => e.remove()); nearEls = [];
  meEl?.remove(); meEl = null;
  hiArr.fill(0); hiAttr.needsUpdate = true;
  trailOn.fill(0); trailOnAttr.needsUpdate = true;
  panel.hidden = true;
  pathHist = [];
  try {
    const u = new URL(location.href);
    u.searchParams.delete('seed');
    history.replaceState(null, '', u);
  } catch { /* file: */ }
}

function buildNearLabels(i) {
  nearEls.forEach(e => e.remove());
  meEl?.remove();
  nearEls = linksOf[i].map(k => {
    const o = otherEnd(k, i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-near';
    b.dataset.i = o;
    b.innerHTML = `<span class="g-arr" aria-hidden="true">→</span><span>${esc(A[o].name)}</span>`;
    b.style.setProperty('--lc', `#${LINK_COLS[linkType[k]].getHexString()}`);
    b.title = reasons(links[k].why, i, o)[0] || '';
    b.setAttribute('aria-label', `Go to ${A[o].name}`);
    b.addEventListener('click', () => go(o, { link: k }));
    labelsEl.append(b);
    return b;
  });
  meEl = document.createElement('span');
  meEl.className = 'g-me';
  meEl.textContent = A[i].name;
  labelsEl.append(meEl);
}

/** Distance the camera sits from a focused artist. */
function focusDist(i) {
  const { outer } = orbitSpec(i);
  const c = P(i);
  const near = linksOf[i].map(k => P(otherEnd(k, i)).distanceTo(c)).sort((x, y) => x - y);
  const q = near.length ? near[Math.floor(near.length * 0.3)] : 0;
  return Math.max(80, outer * 3.6, Math.min(q * 1.5, outer * 7)) * (isPhone() ? 1.5 : 1);
}

/** Go to artist i. With `link`, travel along that trail from the current artist. */
function go(i, { link = -1, fromPath = -1 } = {}) {
  if (hidden[i]) return;
  hideTip();
  const target = P(i);
  const dist = focusDist(i);
  const cur = camera.position.clone().sub(controls.target).normalize();
  const dir = cur.clone();
  if (dir.y < 0.22) { dir.y = 0.22; dir.normalize(); }
  if (fromPath >= 0) pathHist = pathHist.slice(0, fromPath + 1);
  else if (pathHist[pathHist.length - 1] !== i) pathHist = [...pathHist, i].slice(-14);
  const path = link >= 0 && focus >= 0 ? linkPath(link, focus) : null;
  setFocus(i, dir);
  flyTo(target, dist, { dir, path, spark: !!path });
}

function flyToFamily(k) {
  if (focus >= 0) clearFocus();
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }
  flyTo(famC[k].clone(), famSpread[k] * (isPhone() ? 5.2 : 3.1), { dir });
}
const overviewDist = () => (isPhone() ? 9800 : 4900);
// Look across the map's long axis on a wide screen, along it on a tall one,
// so the spiral fills the screen either way.
const longAxis = (() => {
  let xx = 0, zz = 0, xz = 0;
  famC.forEach((c, k) => {
    const dx = c.x - galaxyC.x, dz = c.z - galaxyC.z, w = famCount[k];
    xx += dx * dx * w; zz += dz * dz * w; xz += dx * dz * w;
  });
  const th = 0.5 * Math.atan2(2 * xz, xx - zz);
  return new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
})();
const across = new THREE.Vector3(-longAxis.z, 0, longAxis.x);
if (across.z < 0) across.negate();
const overviewDirWide = across.clone().add(new THREE.Vector3(0, 0.9, 0)).normalize();
const overviewDirTall = longAxis.clone().add(new THREE.Vector3(0, 0.95, 0)).normalize();
const overviewDir = () => (innerWidth < innerHeight ? overviewDirTall : overviewDirWide);
function flyHome() {
  if (focus >= 0) clearFocus();
  flyTo(galaxyC.clone(), overviewDist(), { dir: overviewDir() });
}

// ---- flights --------------------------------------------------------------------
let flight = null;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(target, dist, { dir = null, path = null, spark: withSpark = false, dur } = {}) {
  const t0 = controls.target.clone();
  const off = camera.position.clone().sub(t0);
  const d0 = Math.max(1, off.length());
  const dir0 = off.normalize();
  const dir1 = (dir || dir0).clone().normalize();
  const travel = t0.distanceTo(target);
  if (RM || dur === 0) {
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(dir1, dist);
    camera.lookAt(target);
    controls.update();
    flight = null;
    discMat.uniforms.uAppear.value = 1;
    return;
  }
  const duration = dur ?? THREE.MathUtils.clamp(900 + travel * 0.75, 1100, 3400);
  flight = { t0, target: target.clone(), d0, d1: dist, dir0, dir1, travel, path, spark: withSpark, start: performance.now(), duration };
  controls.enabled = false;
}
const _dir = new THREE.Vector3(), _tgt = new THREE.Vector3();
function stepFlight(now) {
  if (!flight) return;
  const f = flight;
  const k = Math.min(1, (now - f.start) / f.duration);
  const e = ease(k);
  if (f.path) _tgt.copy(f.path(e)); else _tgt.copy(f.t0).lerp(f.target, e);
  const lift = Math.min(1.3, f.travel / Math.max(80, f.d0 + f.d1));
  const dist = Math.exp(THREE.MathUtils.lerp(Math.log(f.d0), Math.log(f.d1), e)) * (1 + lift * Math.sin(Math.PI * e));
  _dir.copy(f.dir0).lerp(f.dir1, e).normalize();
  camera.position.copy(_tgt).addScaledVector(_dir, dist);
  camera.lookAt(_tgt);
  controls.target.copy(_tgt);
  spark.visible = f.spark && k < 1;
  if (spark.visible) { spark.position.copy(_tgt); spark.scale.setScalar(dist * 0.05); }
  if (k >= 1) endFlight();
}
function endFlight() {
  flight = null;
  spark.visible = false;
  controls.enabled = true;
  controls.update();
}

// ---- side panel -------------------------------------------------------------------
const AV_COLS = d.atlas.avatarCols, AV_ROWS = Math.ceil(NA / AV_COLS);
const avStyle = i => `background-size:${AV_COLS * 100}% ${AV_ROWS * 100}%;background-position:${((i % AV_COLS) / (AV_COLS - 1)) * 100}% ${(Math.floor(i / AV_COLS) / (AV_ROWS - 1)) * 100}%`;
const sleeveStyle = ri => {
  const c = sleeveCell(d, ri), n = d.atlas.cols;
  const cx = c.x / c.size, cy = c.y / c.size;
  return `background-image:url(${sleeveSheetUrl(c.sheet)});background-position:${(cx / (n - 1)) * 100}% ${(cy / (n - 1)) * 100}%`;
};
const ORDER = { member: 0, group: 1, alias: 2, bandmate: 3, guest: 4 };
function reasons(why, from, to) {
  const out = [], seen = new Set();
  for (const w of [...why].sort((x, y) => ORDER[x.type] - ORDER[y.type])) {
    let key;
    if (w.type === 'member' || w.type === 'bandmate') key = `p:${norm(w.who)}`;
    else if (w.type === 'group') key = `p:${norm(A[d.artistBySlug.get(w.from)]?.name)}`;
    else if (w.type === 'alias') key = 'alias';
    else key = `g:${w.album}:${w.track}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try { out.push(describeLink(d, w, from, to)); } catch { /* skip odd reason */ }
  }
  return out;
}
function renderPanel(i) {
  const a = A[i];
  const recs = [...a.records].sort((x, y) => (d.albums[x].y || 9999) - (d.albums[y].y || 9999));
  const fn = a.fanart?.[0];
  const hero = fn ? fanartUrl(a, fn) : artistUrl(a, 'medium');
  const fp = a.focus ? `${(a.focus[0] * 100).toFixed(0)}% ${(a.focus[1] * 100).toFixed(0)}%` : '50% 30%';
  const life = a.formed ? `Formed ${a.formed}` : a.born ? `Born ${a.born}` : null;
  const meta = [a.from, life, a.died ? `Died ${a.died}` : null, plural(a.records.length, 'record'), FAM[fam[i]].name].filter(Boolean);
  const ks = [...linksOf[i]].sort((x, y) => linkType[x] - linkType[y] || A[otherEnd(x, i)].name.localeCompare(A[otherEnd(y, i)].name));
  const conns = ks.map(k => {
    const o = otherEnd(k, i);
    const lines = reasons(links[k].why, i, o).slice(0, 2);
    return `<li><button type="button" data-go="${o}" data-link="${k}">
      <span class="g-av" style="${avStyle(o)};--lc:${'#' + LINK_COLS[linkType[k]].getHexString()}"></span>
      <span><span class="g-ln">${esc(A[o].name)}</span>${lines.map(t => `<span class="g-lw">${esc(t)}</span>`).join('')}</span>
    </button></li>`;
  }).join('');
  const path = pathHist.length > 1
    ? `<ol class="g-path" aria-label="Where you have been">${pathHist.map((p, n) => `<li><button type="button" data-path="${n}">${esc(A[p].name)}</button></li>`).join('')}</ol>`
    : '';
  const fl = d.albums[recs[0]]?.fl || '#2b2926';
  panel.innerHTML = `
    <button type="button" class="g-grab" aria-label="Show or hide details"></button>
    <button type="button" class="g-mob-close" data-close aria-label="Close">×</button>
    <div class="g-hero" style="--hc:${fl}">
      <img src="${hero}" alt="" style="object-position:${fp}" onerror="this.parentNode.style.display='none'">
      <button type="button" class="g-close" data-close aria-label="Close">×</button>
    </div>
    <div class="g-body">
      ${path}
      <h2 class="g-name">${esc(a.name)}</h2>
      <p class="g-meta">${meta.map(esc).join(' · ')}</p>
      ${a.bio ? `<p class="g-bio">${esc(a.bio)}${a.bio.length >= 420 ? '…' : ''}</p>` : ''}
      ${a.members?.length ? `<h3 class="g-h x-label">Members</h3><ul class="g-members">${a.members.map(m => `<li>${esc(m.replace(/\s*\(\d+\)$/, ''))}</li>`).join('')}</ul>` : ''}
      <h3 class="g-h x-label">Connected to${ks.length ? ` (${ks.length})` : ''}</h3>
      ${ks.length ? `<ul class="g-links">${conns}</ul>` : '<p class="g-none">No shared members or guest spots with other artists in the collection.</p>'}
      <h3 class="g-h x-label">In the collection (${recs.length})</h3>
      <div class="g-recs">${recs.slice(0, 36).map(ri => {
        const al = d.albums[ri];
        return `<a href="${albumHref(al)}" target="_blank" rel="noopener" style="${sleeveStyle(ri)}" title="${esc(al.t)}${al.y ? ` (${al.y})` : ''}" aria-label="${esc(al.t)}"></a>`;
      }).join('')}</div>
      <a class="g-out" href="${artistHref(a)}" target="_blank" rel="noopener">${esc(a.name)} on russ.fm ↗</a>
    </div>`;
  panel.hidden = false;
  panel.classList.remove('is-min');
  panel.scrollTop = 0;
}
panel.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.hasAttribute('data-close')) { clearFocus(); return; }
  if (t.classList.contains('g-grab')) { panel.classList.toggle('is-min'); return; }
  if (t.dataset.go) { go(+t.dataset.go, { link: +t.dataset.link }); return; }
  if (t.dataset.path) {
    const n = +t.dataset.path, target = pathHist[n];
    if (target !== focus) {
      const k = linksOf[focus].find(x => otherEnd(x, focus) === target);
      go(target, { fromPath: n, link: k ?? -1 });
    }
  }
});

// ---- picking + pointer ------------------------------------------------------------
const tip = $('tip');
function hideTip() { tip.hidden = true; }
function showTip(x, y, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const tx = Math.min(W - w - 8, x + 14), ty = y + 18 + h > H - 60 ? y - h - 12 : y + 18;
  tip.style.transform = `translate(${tx}px, ${ty}px)`;
}
function pickStar(mx, my) {
  const e = camera.projectionMatrix.elements[5];
  let best = -1, bestZ = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < NA; i++) {
    if (hidden[i]) continue;
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(camera.matrixWorldInverse);
    const z = -v.z;
    if (z <= 1) continue;
    v.applyMatrix4(camera.projectionMatrix);
    const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    const r = Math.max(size[i] * e * H * 0.5 / z, 2.3) + 5;
    const dx = sx - mx, dy = sy - my;
    if (dx * dx + dy * dy < r * r && z < bestZ) { best = i; bestZ = z; }
  }
  return best;
}
function pickDisc(mx, my) {
  if (orbit.artist < 0) return -1;
  const e = camera.projectionMatrix.elements[5];
  const ap = discMat.uniforms.uAppear.value;
  let best = -1, bestZ = Infinity;
  for (let j = 0; j < orbit.recs.length; j++) {
    const s = toScreen(new THREE.Vector3(discPos[j * 3], discPos[j * 3 + 1], discPos[j * 3 + 2]));
    if (!s) continue;
    const r = orbit.disc * ap * e * H * 0.5 / s.z + 2;
    const dx = s.x - mx, dy = s.y - my;
    if (dx * dx + dy * dy < r * r && s.z < bestZ) { best = j; bestZ = s.z; }
  }
  return best;
}
function pickTrail(mx, my) {
  if (focus < 0) return -1;
  let best = -1, bestD = 7;
  const p = new THREE.Vector3();
  for (const k of linksOf[focus]) {
    const [a, c, b] = linkCtrl(k);
    let prev = null;
    for (let s = 0; s <= SEG; s++) {
      const sc = toScreen(bez(a, c, b, s / SEG, p));
      if (sc && prev) {
        const vx = sc.x - prev.x, vy = sc.y - prev.y;
        const l2 = vx * vx + vy * vy || 1;
        const t = THREE.MathUtils.clamp(((mx - prev.x) * vx + (my - prev.y) * vy) / l2, 0, 1);
        const dx = prev.x + vx * t - mx, dy = prev.y + vy * t - my;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bestD) { bestD = dd; best = k; }
      }
      prev = sc;
    }
  }
  return best;
}
function pickAt(mx, my) {
  const j = pickDisc(mx, my);
  if (j >= 0) return { kind: 'disc', j };
  const i = pickStar(mx, my);
  if (i >= 0) return { kind: 'star', i };
  const k = pickTrail(mx, my);
  if (k >= 0) return { kind: 'trail', k };
  return null;
}
function describeHit(h) {
  if (h.kind === 'disc') {
    const al = d.albums[orbit.recs[h.j]];
    return `<b>${esc(al.t)}</b><span>${[al.y, al.vc ? `${al.vc} vinyl` : null, 'Open on russ.fm'].filter(Boolean).map(esc).join(' · ')}</span>`;
  }
  if (h.kind === 'star') {
    const a = A[h.i];
    const n = linksOf[h.i].length;
    return `<b>${esc(a.name)}</b><span>${plural(a.records.length, 'record')} · ${esc(FAM[fam[h.i]].name)}${n ? ` · ${plural(n, 'connection')}` : ''}</span>`;
  }
  const o = otherEnd(h.k, focus);
  const why = reasons(links[h.k].why, focus, o)[0] || '';
  return `<b>To ${esc(A[o].name)}</b><span>${esc(why)}</span>`;
}

let lastInput = performance.now();
let interacted = false;
const touched = () => {
  lastInput = performance.now();
  controls.autoRotate = false;
  if (!interacted) { interacted = true; $('hint').style.opacity = '0'; }
};
let down = null;
let hoverReq = null;
canvas.addEventListener('pointerdown', e => {
  touched();
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (flight) endFlight();
  hideTip();
});
canvas.addEventListener('pointermove', e => {
  lastInput = performance.now();
  if (e.pointerType !== 'mouse' || (e.buttons && down)) return;
  hoverReq = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerleave', () => { hoverReq = null; hideTip(); canvas.style.cursor = ''; });
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 6 || !quick) return;
  const h = pickAt(e.clientX, e.clientY);
  if (!h) return;
  if (h.kind === 'disc') window.open(albumHref(d.albums[orbit.recs[h.j]]), '_blank', 'noopener');
  else if (h.kind === 'star') {
    if (h.i === focus) return;
    const k = focus >= 0 ? linksOf[focus].find(x => otherEnd(x, focus) === h.i) : undefined;
    go(h.i, { link: k ?? -1 });
  } else go(otherEnd(h.k, focus), { link: h.k });
});
canvas.addEventListener('wheel', touched, { passive: true });
canvas.addEventListener('dblclick', e => e.preventDefault());

// ---- search ----------------------------------------------------------------------
const qEl = $('q'), resEl = $('results');
const index = A.map((a, i) => ({ i, n: norm(a.name) })).filter(x => !hidden[x.i]);
let results = [], sel = 0;
function renderResults() {
  if (!results.length) { resEl.hidden = true; qEl.setAttribute('aria-expanded', 'false'); return; }
  resEl.innerHTML = results.map((i, n) => `<li role="option" id="r${n}" data-i="${i}" aria-selected="${n === sel}">
    <span class="g-av" style="${avStyle(i)}"></span>${esc(A[i].name)}<small>${CODES[fam[i]]} · ${A[i].records.length}</small></li>`).join('');
  resEl.hidden = false;
  qEl.setAttribute('aria-expanded', 'true');
  qEl.setAttribute('aria-activedescendant', `r${sel}`);
}
qEl.addEventListener('input', () => {
  const q = norm(qEl.value);
  sel = 0;
  results = !q ? [] : index.filter(x => x.n.includes(q))
    .sort((x, y) => (y.n.startsWith(q) - x.n.startsWith(q)) || A[y.i].records.length - A[x.i].records.length)
    .slice(0, 8).map(x => x.i);
  renderResults();
});
const pickResult = i => { results = []; renderResults(); qEl.value = ''; qEl.blur(); touched(); go(i); };
qEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && results.length) { sel = (sel + 1) % results.length; renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && results.length) { sel = (sel - 1 + results.length) % results.length; renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter' && results.length) { pickResult(results[sel]); e.preventDefault(); }
  else if (e.key === 'Escape') { qEl.value = ''; results = []; renderResults(); qEl.blur(); }
});
resEl.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pickResult(+li.dataset.i); } });
qEl.addEventListener('blur', () => setTimeout(() => { results = []; renderResults(); }, 120));

const wellConnected = index.filter(x => linksOf[x.i].length >= 2).map(x => x.i);
$('rand').addEventListener('click', () => { touched(); go(wellConnected[Math.floor(Math.random() * wellConnected.length)]); });
$('home').addEventListener('click', () => { touched(); flyHome(); });
addEventListener('keydown', e => {
  if (e.target === qEl) return;
  touched();
  if (e.key === '/') { qEl.focus(); e.preventDefault(); }
  else if (e.key === 'Escape' && focus >= 0) clearFocus();
});

// ---- resize + view offset -----------------------------------------------------------
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  shared.uRes.value.set(W, H);
  fatMat.resolution.set(W, H);
  dustMat.uniforms.uScale.value = camera.projectionMatrix.elements[5] * H * 0.5;
  offX = offY = -1; // force view offset refresh
}
let offX = 0, offY = 0, curX = 0, curY = 0;
function wantOffset() {
  if (focus < 0 || panel.hidden) return [0, 0];
  if (isPhone()) return [0, (panel.offsetHeight + 62) / 2];
  return [(panel.offsetWidth + 12) / 2, 0];
}
function stepOffset(dt) {
  const [tx, ty] = wantOffset();
  const k = RM ? 1 : Math.min(1, dt * 5);
  const nx = curX + (tx - curX) * k, ny = curY + (ty - curY) * k;
  if (Math.abs(nx - offX) > 0.05 || Math.abs(ny - offY) > 0.05) {
    curX = nx; curY = ny; offX = nx; offY = ny;
    if (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.1) camera.clearViewOffset();
    else camera.setViewOffset(W, H, nx, ny, W, H);
  }
}
addEventListener('resize', resize);
resize();

// ---- start --------------------------------------------------------------------------
camera.position.copy(galaxyC).addScaledVector(overviewDir(), overviewDist());
controls.target.copy(galaxyC);
camera.lookAt(galaxyC);
controls.update();

const clock = new THREE.Clock();
let time = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const lerpK = rate => Math.min(1, rawDt * rate);
  const now = performance.now();
  if (!RM) time += dt;
  shared.uTime.value = time;
  shared.uFocus.value += (focusTarget - shared.uFocus.value) * lerpK(4);
  if (RM) shared.uFocus.value = focusTarget;
  if (focus >= 0) {
    fatMat.opacity += (0.95 - fatMat.opacity) * lerpK(3);
    const ap = discMat.uniforms.uAppear;
    if (!flight || (now - flight.start) / flight.duration > 0.65) ap.value += (1 - ap.value) * lerpK(3.5);
    if (RM && !flight) ap.value = 1;
  }
  stepFlight(now);
  controls.autoRotate = !RM && !flight && now - lastInput > 7000;
  if (!flight) controls.update();
  stepOffset(rawDt);
  camera.updateMatrixWorld();
  updateOrbit(time);
  renderer.render(scene, camera);
  updateLabels();
  if (hoverReq) {
    const { x, y } = hoverReq;
    hoverReq = null;
    const h = flight ? null : pickAt(x, y);
    canvas.style.cursor = h ? 'pointer' : '';
    if (h) showTip(x, y, describeHit(h)); else hideTip();
  }
}

setProgress(1, 'Ready');
const seed = new URLSearchParams(location.search).get('seed');
const seedIdx = seed ? d.artistBySlug.get(seed) : undefined;
requestAnimationFrame(() => {
  loaderEl.classList.add('is-done');
  frame();
  if (seedIdx != null && !hidden[seedIdx]) {
    setTimeout(() => go(seedIdx), RM ? 0 : 350);
  }
});
