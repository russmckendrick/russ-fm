// The Aisle: a row of record crates you flick through. The crate dividers are
// lenses (genre, label, decade, vinyl colour, mood, country); pulling a record
// slides the disc out in its pressing colour and lists what it connects to.
// Three.js by full URL so Vite leaves it alone (the import map in aisle.html covers bare 'three').
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {
  loadExplore, sleeveUrl, mountNav, sleeveCell, sleeveSheetUrl, sleeveSheetCount,
  ytEmbed, albumHref, artistHref, describeLink,
} from '/mockups/explore/shared.js';

mountNav('aisle');
const $ = id => document.getElementById(id);
const loadingEl = $('loading');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const d = await loadExplore();
const VC = await fetch('/src/config/vinyl-colours.json').then(r => r.json()).catch(() => null);
const A = d.albums;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// helpers
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const hash = n => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = n => n.toLocaleString('en-GB');
const cleanLabel = s => (s || '').replace(/\s*\(\d+\)$/, '');
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), h | 1); h ^= h + Math.imul(h ^ (h >>> 7), h | 61); return ((h ^ (h >>> 14)) >>> 0) / 4294967296; };
}
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function lum(hex) { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

// ---------------------------------------------------------------------------
// vinyl colour: the site's shared vocabulary (src/config/vinyl-colours.json)
const V = VC || {
  colours: { red: '#c81d25', blue: '#1f4fb5', green: '#1f8a4c', yellow: '#f0c419', orange: '#ee7a1a', pink: '#ec6fa5', purple: '#6b2fa0', white: '#f1eee6', gold: '#c9a24a', silver: '#b9bdc2', black: '#0b0b0b' },
  phrases: {}, glass: ['clear', 'crystal'], translucent: ['transparent', 'translucent'], metallic: ['gold', 'silver'],
  patterns: { marble: ['marbl'], swirl: ['swirl'], splatter: ['splatter'] }, flame: { words: ['flame'], base: '#c4381a', accents: ['#f7931e', '#f2d21f'] },
  mixed: { base: '#ece3d2', accents: ['#d4553f', '#3f7fb5', '#e3b23c', '#4f9a6b'] },
};
const PATTERNS = Object.entries(V.patterns).map(([n, ps]) => [n, new RegExp(`^(${ps.join('|')})`)]);
const vinylCache = new Map();
function parseVinyl(text) {
  if (vinylCache.has(text)) return vinylCache.get(text);
  const words = text.toLowerCase().replace(/\btri[^a-z]*(?=colou?r)/g, 'tri').split(/[^a-z]+/).filter(Boolean);
  const out = { colours: [], clear: false, translucent: false, metallic: false, flame: false, pattern: null };
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const pair = `${w} ${words[k + 1] || ''}`;
    if (V.phrases[pair]) { out.colours.push(V.phrases[pair]); k++; }
    else if (V.glass.includes(w)) out.clear = true;
    else if (V.translucent.includes(w)) out.translucent = true;
    else if (V.flame?.words.includes(w)) out.flame = true;
    else if (V.colours[w]) { out.colours.push(V.colours[w]); if (V.metallic.includes(w)) out.metallic = true; }
    else { const p = PATTERNS.find(([, re]) => re.test(w)); if (p) out.pattern ??= p[0]; }
  }
  vinylCache.set(text, out);
  return out;
}
const NOT_VINYL = new Set(['CD', 'Digital', 'Cassette', 'DVD', 'Laserdisc', 'PlayTape', 'VHS']);
/** How the disc looks: body colours, opacity and pattern. */
function vinylLook(al) {
  if (al.fmt === 'CD') return { cd: true };
  if (!al.vc) return { body: ['#0b0b0b'], alpha: 1, pattern: null };
  const p = parseVinyl(al.vc);
  let body = [...new Set(p.colours)];
  let pattern = p.pattern;
  let alpha = 1;
  if (p.flame) { body = [V.flame.base, ...V.flame.accents]; pattern ??= 'splatter'; }
  if (!body.length && p.clear) { body = ['#dfe6ea']; alpha = 0.4; }
  else if (p.clear || p.translucent) alpha = 0.66;
  if (!body.length) { body = [V.mixed.base, ...V.mixed.accents]; pattern ??= 'marble'; }
  return { body, alpha, pattern, metallic: p.metallic };
}
const COLOUR_FAMS = [['White', '#f1eee6'], ['Yellow', '#f0c419'], ['Orange', '#ee7a1a'], ['Red', '#c81d25'], ['Pink', '#ec6fa5'], ['Purple', '#6b2fa0'], ['Blue', '#1f4fb5'], ['Green', '#1f8a4c'], ['Brown', '#6b4327'], ['Grey', '#8b8f94']];
const COLOUR_ORDER = ['Black', 'Clear', ...COLOUR_FAMS.map(f => f[0]), 'Gold & silver', 'Marbled & mixed', 'Other colours', 'Not vinyl'];
const COLOUR_SWATCH = { Black: '#111111', Clear: '#dfe6ea', 'Gold & silver': '#c9a24a', 'Marbled & mixed': 'mix', 'Other colours': '#888888', 'Not vinyl': '#b9bdc2', ...Object.fromEntries(COLOUR_FAMS) };
function colourCrate(al) {
  if (NOT_VINYL.has(al.fmt)) return 'Not vinyl';
  if (!al.vc) return 'Black';
  const p = parseVinyl(al.vc);
  const cols = [...new Set(p.colours)];
  if (p.pattern || cols.length > 1 || p.flame) return 'Marbled & mixed';
  if (!cols.length) return p.clear ? 'Clear' : 'Other colours';
  if (p.metallic) return 'Gold & silver';
  if (cols[0] === (V.colours.black || '#0b0b0b')) return 'Black';
  const [r, g, b] = hexRgb(cols[0]);
  let best = 'Other colours', bd = Infinity;
  for (const [name, hex] of COLOUR_FAMS) {
    const [x, y, z] = hexRgb(hex);
    const dd = (r - x) ** 2 * 0.3 + (g - y) ** 2 * 0.59 + (b - z) ** 2 * 0.11;
    if (dd < bd) { bd = dd; best = name; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// lenses: each one deals the whole collection into crates
const famName = Object.fromEntries(d.families.map(f => [f.key, f.name]));
const sortKey = A.map(al => (al.by || '').replace(/^the\s+/i, '').toLowerCase());
const byArtist = (x, y) => sortKey[x].localeCompare(sortKey[y]) || (A[x].y || 0) - (A[y].y || 0) || A[x].t.localeCompare(A[y].t);
const firstLabel = A.map(al => cleanLabel(al.l[0]) || 'No label');
const moodOf = A.map(al => (al.a.length && d.artists[al.a[0]].mood) || '');
const decadeOf = al => (al.y ? `${Math.floor(al.y / 10) * 10}s` : 'Year unknown');
const countryOf = A.map(al => al.c || 'Unknown');

function topKeys(values, n, min) {
  const m = new Map();
  values.forEach(v => m.set(v, (m.get(v) || 0) + 1));
  return new Set([...m].filter(([k, c]) => k && c >= min).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k));
}
const TOP_LABELS = topKeys(firstLabel.filter(l => l !== 'No label'), 20, 1);
const TOP_MOODS = topKeys(moodOf, 17, 40);
const TOP_COUNTRIES = topKeys(countryOf.filter(c => c !== 'Unknown'), 13, 20);

const LENSES = [
  { key: 'genre', label: 'Genre', note: 'Twelve genre families, A–Z by artist',
    of: i => famName[A[i].fam], order: d.families.map(f => f.name) },
  { key: 'label', label: 'Label', note: 'The 20 biggest labels, then everything else',
    of: i => (TOP_LABELS.has(firstLabel[i]) ? firstLabel[i] : 'Other labels'), order: 'count', last: ['Other labels'] },
  { key: 'decade', label: 'Decade', note: 'By the year the record first came out',
    of: i => decadeOf(A[i]), order: 'alpha', last: ['Year unknown'] },
  { key: 'colour', label: 'Vinyl colour', note: 'By the colour of the pressing',
    of: i => colourCrate(A[i]), order: COLOUR_ORDER },
  { key: 'mood', label: 'Mood', note: "The artist's mood on TheAudioDB",
    of: i => (TOP_MOODS.has(moodOf[i]) ? moodOf[i] : moodOf[i] ? 'Other moods' : 'No mood listed'), order: 'count', last: ['Other moods', 'No mood listed'] },
  { key: 'country', label: 'Country', note: 'Where this pressing was released',
    of: i => (TOP_COUNTRIES.has(countryOf[i]) ? countryOf[i] : 'Elsewhere'), order: 'count', last: ['Elsewhere'] },
];
const lensCache = new Map();
function getLens(key) {
  if (lensCache.has(key)) return lensCache.get(key);
  const def = LENSES.find(l => l.key === key);
  const groups = new Map();
  A.forEach((_, i) => { const k = def.of(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  let names = [...groups.keys()].filter(k => !(def.last || []).includes(k));
  if (def.order === 'count') names.sort((a, b) => groups.get(b).length - groups.get(a).length);
  else if (def.order === 'alpha') names.sort();
  else names = def.order.filter(n => groups.has(n));
  names.push(...(def.last || []).filter(n => groups.has(n)));
  const crateOf = new Int16Array(A.length);
  const posOf = new Int32Array(A.length);
  const crates = names.map((name, c) => {
    const items = groups.get(name);
    if (name === 'Other labels') items.sort((x, y) => firstLabel[x].localeCompare(firstLabel[y]) || byArtist(x, y));
    else items.sort(byArtist);
    items.forEach((i, k) => { crateOf[i] = c; posOf[i] = k; });
    return { name, items, swatch: key === 'colour' ? COLOUR_SWATCH[name] : null };
  });
  const lens = { ...def, crates, crateOf, posOf };
  lensCache.set(key, lens);
  return lens;
}

// ---------------------------------------------------------------------------
// three.js scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
const scene = new THREE.Scene();
const NIGHT = new THREE.Color('#1b1a18');
scene.background = NIGHT;
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

// Geometry constants (1 unit = one 12" sleeve).
const SPACING = 1.46;
const Z_CUR = 0.06, GAP = 0.02, FRONT_IN = 0.86, FRONT_H = 0.40;
const STAND = -0.085;
const FLIPPED = 11, BEHIND = 36, WIN = FLIPPED + 1 + BEHIND;
const MAX_CRATES = 24;
const crateX = c => c * SPACING;

// One lit shader for everything in the room, so the crates, dividers and
// instanced sleeves all sit in the same lamp light. Each crate has its own
// lamp; the one you're stood at is brighter.
const lightUniforms = {
  uLamp: { value: new THREE.Vector3(0, 2.6, 1.4) },
  uDim: { value: 1 },
  uFogColor: { value: NIGHT.clone() },
  uFog: { value: new THREE.Vector2(4.5, 15) },
  uSpacing: { value: SPACING },
};
const LIGHT_GLSL = /* glsl */`
uniform vec3 uLamp; uniform float uDim; uniform vec3 uFogColor; uniform vec2 uFog; uniform float uSpacing;
vec3 shade(vec3 base, vec3 n, vec3 w, float depth) {
  vec3 L = uLamp - w; float dist = length(L); L /= dist;
  float main = max(dot(n, L), 0.0) / (1.0 + 0.16 * dist * dist);
  float cx = floor(w.x / uSpacing + 0.5) * uSpacing;
  vec3 P = vec3(cx, 2.3, 0.9) - w; float pd = length(P); P /= pd;
  float pool = max(dot(n, P), 0.0) / (1.0 + 0.5 * pd * pd);
  vec3 warm = vec3(1.0, 0.86, 0.68);
  vec3 col = base * (vec3(0.055, 0.05, 0.048) + warm * (main * 2.1 + pool * 0.95));
  col *= uDim;
  return mix(col, uFogColor, smoothstep(uFog.x, uFog.y, depth));
}`;

function litMaterial({ map = null, color = '#ffffff', alphaTest = 0, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms, map: { value: map }, uColor: { value: new THREE.Color(color) }, uHasMap: { value: map ? 1 : 0 }, uAlphaTest: { value: alphaTest } },
    side,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
        vec4 mv = viewMatrix * w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uColor; uniform float uHasMap; uniform float uAlphaTest;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
      ${LIGHT_GLSL}
      void main() {
        vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
        if (tex.a < uAlphaTest) discard;
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(shade(tex.rgb * uColor, n, vW, vDepth), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---- atlases ----
const blank = new THREE.DataTexture(new Uint8Array([40, 40, 40, 255]), 1, 1);
blank.needsUpdate = true;
const SHEETS = sleeveSheetCount(d);
const sheetTex = [blank, blank, blank, blank];
const sheetImg = [];
const ready = new THREE.Vector4(0, 0, 0, 0);
let sheetsLoaded = 0;
const loader = new THREE.TextureLoader();
for (let s = 0; s < SHEETS; s++) {
  loader.load(sleeveSheetUrl(s), tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    sheetTex[s] = tex; sheetImg[s] = tex.image;
    recordMat.uniforms[`t${s}`].value = tex;
    ready.setComponent(s, 1);
    sheetsLoaded++;
    loadingEl.textContent = sheetsLoaded < SHEETS ? `Loading sleeves ${sheetsLoaded} of ${SHEETS}` : `${nf(A.length)} records`;
    if (hero && !hero.hasMedium) setHeroFront(hero.al);
  });
}

// ---- instanced sleeves ----
const recordGeo = new THREE.BoxGeometry(1, 1, 0.011);
recordGeo.translate(0, 0.5, 0);
const INSTANCES = MAX_CRATES * WIN;
const aCell = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 4), 4);
const aCol = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 3), 3);
aCell.setUsage(THREE.DynamicDrawUsage); aCol.setUsage(THREE.DynamicDrawUsage);
recordGeo.setAttribute('aCell', aCell);
recordGeo.setAttribute('aCol', aCol);
const recordMat = new THREE.ShaderMaterial({
  uniforms: { ...lightUniforms, t0: { value: blank }, t1: { value: blank }, t2: { value: blank }, t3: { value: blank }, uReady: { value: ready }, uCellW: { value: 1 / d.atlas.cols } },
  vertexShader: /* glsl */`
    attribute vec4 aCell; attribute vec3 aCol;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth; varying vec4 vCell; varying vec3 vCol; varying float vFace;
    void main() {
      mat4 m = modelMatrix * instanceMatrix;
      vec4 w = m * vec4(position, 1.0);
      vW = w.xyz; vN = normalize(mat3(m) * normal); vUv = uv; vCell = aCell; vCol = aCol;
      vFace = normal.z > 0.5 ? 1.0 : (normal.z < -0.5 ? -1.0 : 0.0);
      vec4 mv = viewMatrix * w; vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3; uniform vec4 uReady; uniform float uCellW;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth; varying vec4 vCell; varying vec3 vCol; varying float vFace;
    ${LIGHT_GLSL}
    void main() {
      vec3 base;
      if (vFace > 0.5) {
        vec2 f = clamp(vUv, 0.012, 0.988);
        vec2 uv = vec2(vCell.x + f.x * uCellW, 1.0 - vCell.y - (1.0 - f.y) * uCellW);
        float s = vCell.z; vec3 tex; float r;
        if (s < 0.5) { tex = texture2D(t0, uv).rgb; r = uReady.x; }
        else if (s < 1.5) { tex = texture2D(t1, uv).rgb; r = uReady.y; }
        else if (s < 2.5) { tex = texture2D(t2, uv).rgb; r = uReady.z; }
        else { tex = texture2D(t3, uv).rgb; r = uReady.w; }
        base = mix(vCol, tex, r);
      } else if (vFace < -0.5) {
        base = vCol * 0.55 + 0.02;
      } else {
        // spine and top edge: the sleeve colour, worn darker, with a pale card core
        base = mix(vCol * 0.5, vec3(0.55, 0.5, 0.42), 0.18);
      }
      gl_FragColor = vec4(shade(base, normalize(vN), vW, vDepth), 1.0);
      #include <colorspace_fragment>
    }`,
});
const records = new THREE.InstancedMesh(recordGeo, recordMat, INSTANCES);
records.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
records.frustumCulled = false;
scene.add(records);

// ---- room: bench, floor, crates ----
function woodTexture(seed, tint) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  const rnd = seeded('wood' + seed);
  g.fillStyle = tint; g.fillRect(0, 0, 512, 128);
  for (let k = 0; k < 70; k++) {
    const y = rnd() * 128; const a = 0.03 + rnd() * 0.08;
    g.strokeStyle = rnd() > 0.5 ? `rgba(40,22,10,${a})` : `rgba(255,230,190,${a * 0.6})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + k) * (1 + rnd() * 3));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  return tex;
}
const woodMat = litMaterial({ map: woodTexture(1, '#7a6550') });
const woodMatDark = litMaterial({ map: woodTexture(2, '#68553f') });
const benchMat = litMaterial({ map: woodTexture(3, '#2c241d') });
const floorMat = litMaterial({ color: '#211e1a' });

const bench = new THREE.Mesh(new THREE.BoxGeometry(1, 0.86, 2.3), benchMat);
scene.add(bench);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.set(40, -0.92, 0);
scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 12), litMaterial({ color: '#3a342c' }));
wall.position.set(40, 5, -2.6);
scene.add(wall);

const CW = 1.2, CD = 1.78, WALL = 0.03;
const geoSide = new THREE.BoxGeometry(WALL, 0.5, CD);
const geoBack = new THREE.BoxGeometry(CW, 0.5, WALL);
const geoFront = new THREE.BoxGeometry(CW, FRONT_H, WALL);
const geoBase = new THREE.BoxGeometry(CW, 0.03, CD);
const geoDivider = new THREE.PlaneGeometry(1.1, 1.375);
geoDivider.translate(0, 1.375 / 2, 0);
const geoLabel = new THREE.PlaneGeometry(0.62, 0.155);

const crateGroups = [];
for (let c = 0; c < MAX_CRATES; c++) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.crate = c; g.add(m); return m; };
  add(geoSide, woodMatDark, -CW / 2 + WALL / 2, 0.25, 0);
  add(geoSide, woodMatDark, CW / 2 - WALL / 2, 0.25, 0);
  add(geoBack, woodMat, 0, 0.25, -CD / 2 + WALL / 2);
  add(geoFront, woodMat, 0, FRONT_H / 2, CD / 2 - WALL / 2);
  add(geoBase, woodMatDark, 0, -0.015, 0);
  const divCanvas = document.createElement('canvas'); divCanvas.width = 512; divCanvas.height = 640;
  const divTex = new THREE.CanvasTexture(divCanvas); divTex.colorSpace = THREE.SRGBColorSpace; divTex.anisotropy = maxAniso;
  const divider = add(geoDivider, litMaterial({ map: divTex, alphaTest: 0.5, side: THREE.DoubleSide }), 0, 0, -0.8);
  divider.rotation.x = STAND;
  const labCanvas = document.createElement('canvas'); labCanvas.width = 512; labCanvas.height = 128;
  const labTex = new THREE.CanvasTexture(labCanvas); labTex.colorSpace = THREE.SRGBColorSpace; labTex.anisotropy = maxAniso;
  add(geoLabel, litMaterial({ map: labTex }), 0, FRONT_H * 0.52, CD / 2 + 0.002);
  g.position.x = crateX(c);
  g.rotation.y = (hash(c * 7 + 3) - 0.5) * 0.03;
  g.userData = { divider, divCanvas, divTex, labCanvas, labTex };
  g.visible = false;
  scene.add(g);
  crateGroups.push(g);
}

// Divider cards: shop-style tabs, staggered left / right / centre.
function fitFont(g, text, weight, max, min, width, family = 'Saira') {
  let size = max;
  do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > width && size > min);
  return size + 2;
}
function drawSwatch(g, x, y, r, swatch) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  if (swatch === 'mix') {
    const grad = g.createConicGradient(0, x, y);
    ['#d4553f', '#e3b23c', '#4f9a6b', '#3f7fb5', '#d4553f'].forEach((c, k, arr) => grad.addColorStop(k / (arr.length - 1), c));
    g.fillStyle = grad;
  } else g.fillStyle = swatch;
  g.fill(); g.strokeStyle = 'rgba(33,31,27,0.35)'; g.lineWidth = 2; g.stroke();
}
function drawCrateCards(c, crate) {
  const { divCanvas, divTex, labCanvas, labTex } = crateGroups[c].userData;
  const g = divCanvas.getContext('2d');
  const W = 512, H = 640, tabH = 168, tabW = 360, r = 22;
  const tabX = [16, W - tabW - 16, (W - tabW) / 2][c % 3];
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#e4dccb';
  g.beginPath();
  g.moveTo(0, tabH); g.lineTo(tabX, tabH); g.lineTo(tabX, r); g.quadraticCurveTo(tabX, 0, tabX + r, 0);
  g.lineTo(tabX + tabW - r, 0); g.quadraticCurveTo(tabX + tabW, 0, tabX + tabW, r); g.lineTo(tabX + tabW, tabH);
  g.lineTo(W, tabH); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  g.fillStyle = 'rgba(33,31,27,0.08)'; g.fillRect(0, tabH, W, 3);
  const n = crate.items.length;
  let tx = tabX + 22;
  if (crate.swatch) { drawSwatch(g, tx + 15, 62, 15, crate.swatch); tx += 40; }
  g.fillStyle = '#211f1b'; g.textBaseline = 'alphabetic';
  fitFont(g, crate.name, 640, 64, 26, tabX + tabW - 20 - tx);
  g.fillText(crate.name, tx, 82);
  g.font = '400 27px "Fragment Mono"'; g.fillStyle = '#56524a';
  g.fillText(`${nf(n)} record${n === 1 ? '' : 's'}`, tabX + 22, 136);
  divTex.needsUpdate = true;

  const l = labCanvas.getContext('2d');
  l.fillStyle = '#ece6d8'; l.fillRect(0, 0, 512, 128);
  l.strokeStyle = 'rgba(33,31,27,0.25)'; l.lineWidth = 3; l.strokeRect(8, 8, 496, 112);
  let lx = 30;
  if (crate.swatch) { drawSwatch(l, 50, 64, 18, crate.swatch); lx = 82; }
  l.fillStyle = '#211f1b';
  fitFont(l, crate.name.toUpperCase(), 400, 40, 18, 340 - (lx - 30), 'Michroma');
  l.textBaseline = 'middle';
  l.fillText(crate.name.toUpperCase(), lx, 66);
  l.font = '400 28px "Fragment Mono"'; l.fillStyle = '#56524a'; l.textAlign = 'right';
  l.fillText(nf(n), 482, 66); l.textAlign = 'left';
  labTex.needsUpdate = true;
}

// ---- detail overlay: the record you're facing gets its full-size sleeve ----
const medCache = new Map();
function mediumTexture(al, onload) {
  if (medCache.has(al.slug)) { const t = medCache.get(al.slug); if (t.image) onload?.(t); else t.userData.waiters.push(onload); return t; }
  const t = loader.load(sleeveUrl(al, 'medium'), tex => { tex.userData.waiters.forEach(f => f?.(tex)); tex.userData.waiters = []; });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.userData.waiters = [onload];
  medCache.set(al.slug, t);
  if (medCache.size > 24) { const [k, old] = medCache.entries().next().value; medCache.delete(k); old.dispose(); }
  return t;
}
const detailGeo = new THREE.PlaneGeometry(1, 1); detailGeo.translate(0, 0.5, 0.0062);
const detailMat = litMaterial({ map: blank });
const detail = new THREE.Mesh(detailGeo, detailMat);
detail.matrixAutoUpdate = false; detail.visible = false;
scene.add(detail);
let detailFor = null;

// ---- the pulled record: sleeve, disc sliding out sideways, a sheen that stays put ----
// drawn in its own pass after a depth clear, so it always sits in front of the crates
const heroScene = new THREE.Scene();
const heroGroup = new THREE.Group(); heroGroup.visible = false; heroScene.add(heroGroup);
const heroFrontMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const heroBackMat = new THREE.MeshBasicMaterial({ color: 0x333333, fog: false });
const heroEdgeMat = new THREE.MeshBasicMaterial({ color: 0x222222, fog: false });
const heroSleeve = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.012), [heroEdgeMat, heroEdgeMat, heroEdgeMat, heroEdgeMat, heroFrontMat, heroBackMat]);
heroGroup.add(heroSleeve);
const discSlide = new THREE.Group(); heroGroup.add(discSlide);
const discGeo = new THREE.CylinderGeometry(0.49, 0.49, 0.0035, 128, 1); discGeo.rotateX(Math.PI / 2);
const discFaceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true });
const discEdgeMat = new THREE.MeshBasicMaterial({ color: 0x111111, fog: false });
const disc = new THREE.Mesh(discGeo, [discEdgeMat, discFaceMat, discFaceMat]);
discSlide.add(disc);
const sheenCanvas = document.createElement('canvas'); sheenCanvas.width = sheenCanvas.height = 512;
{
  const g = sheenCanvas.getContext('2d');
  const grad = g.createConicGradient(-Math.PI / 4, 256, 256);
  [[0, 0], [0.06, 0.55], [0.13, 0], [0.5, 0], [0.56, 0.4], [0.63, 0], [1, 0]].forEach(([s, a]) => grad.addColorStop(s, `rgba(255,255,255,${a})`));
  g.fillStyle = grad; g.beginPath(); g.arc(256, 256, 252, 0, TAU); g.arc(256, 256, 86, 0, TAU, true); g.fill('evenodd');
}
const sheenTex = new THREE.CanvasTexture(sheenCanvas);
const sheen = new THREE.Mesh(new THREE.CircleGeometry(0.49, 96), new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sheen.position.z = 0.0021; discSlide.add(sheen);

function discCanvas(al) {
  const S = 1024, R = S / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const look = vinylLook(al);
  const rnd = seeded(al.slug);
  g.save(); g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip();
  let light = false;
  if (look.cd) {
    const rad = g.createRadialGradient(R, R, R * 0.1, R, R, R);
    rad.addColorStop(0, '#e9ecef'); rad.addColorStop(1, '#a9adb3');
    g.fillStyle = rad; g.fillRect(0, 0, S, S);
    const con = g.createConicGradient(0, R, R);
    ['#ff8a8a', '#ffe08a', '#8affb0', '#8ad0ff', '#d08aff', '#ff8a8a'].forEach((c, k, arr) => con.addColorStop(k / (arr.length - 1), c));
    g.globalAlpha = 0.28; g.fillStyle = con; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
    light = true;
  } else {
    const body = look.body;
    light = lum(body[0]) > 0.5 && look.alpha >= 0.5;
    g.globalAlpha = look.alpha;
    if ((look.pattern === 'split' || look.pattern === 'tricolour') && body.length > 1) {
      body.forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, -Math.PI / 2 + (k / body.length) * TAU, -Math.PI / 2 + ((k + 1) / body.length) * TAU); g.fill(); });
    } else {
      g.fillStyle = body[0]; g.fillRect(0, 0, S, S);
      const others = body.length > 1 ? body.slice(1) : [mixHex(body[0], '#ffffff', 0.55), mixHex(body[0], '#000000', 0.5)];
      if (look.pattern === 'splatter') {
        for (let k = 0; k < 520; k++) {
          const a = rnd() * TAU, rr = Math.sqrt(rnd()) * R, s = 1.5 + rnd() ** 3 * 22;
          g.fillStyle = others[k % others.length]; g.globalAlpha = look.alpha * (0.6 + rnd() * 0.4);
          g.beginPath(); g.ellipse(R + Math.cos(a) * rr, R + Math.sin(a) * rr, s, s * (0.5 + rnd() * 0.6), rnd() * TAU, 0, TAU); g.fill();
        }
      } else if (look.pattern || body.length > 1) {
        g.filter = 'blur(9px)';
        for (let k = 0; k < 46; k++) {
          g.strokeStyle = others[k % others.length]; g.globalAlpha = look.alpha * (0.45 + rnd() * 0.5);
          // a streak that drifts in or out and wobbles as it runs round the disc
          g.lineWidth = 6 + rnd() * 60; const r0 = R * (0.3 + rnd() * 0.66); const a0 = rnd() * TAU;
          const sweep = 0.6 + rnd() * 2.8, drift = (rnd() - 0.5) * R * 0.35, wob = R * (0.02 + rnd() * 0.06), fq = 2 + rnd() * 5;
          g.beginPath();
          for (let q = 0; q <= 40; q++) {
            const t = q / 40, a = a0 + sweep * t, rr = r0 + drift * t + Math.sin(t * fq + k) * wob;
            const x = R + Math.cos(a) * rr, y = R + Math.sin(a) * rr;
            q ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.stroke();
        }
        g.filter = 'none';
      }
    }
    g.globalAlpha = 1;
    g.lineWidth = 1;
    g.strokeStyle = light ? 'rgba(0,0,0,0.075)' : 'rgba(255,255,255,0.045)';
    for (let r = R * 0.35; r < R * 0.965; r += 2.4) { g.beginPath(); g.arc(R, R, r, 0, TAU); g.stroke(); }
    g.lineWidth = 3.5;
    g.strokeStyle = light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.1)';
    const gaps = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < gaps; k++) { g.beginPath(); g.arc(R, R, R * (0.4 + (k + rnd() * 0.6) / gaps * 0.54), 0, TAU); g.stroke(); }
    g.lineWidth = 10; g.strokeStyle = light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.08)';
    g.beginPath(); g.arc(R, R, R - 9, 0, TAU); g.stroke();
  }
  g.restore();
  // centre label in the sleeve's own colours, with the real title and artist
  const LR = look.cd ? R * 0.3 : R * 0.33;
  g.fillStyle = look.cd ? 'rgba(0,0,0,0)' : al.fl;
  if (!look.cd) { g.beginPath(); g.arc(R, R, LR, 0, TAU); g.fill(); }
  g.fillStyle = look.cd ? '#2a2a2a' : al.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const title = al.t.length > 34 ? al.t.slice(0, 33) + '…' : al.t;
  fitFont(g, title, 640, 40, 18, LR * 1.55);
  g.fillText(title, R, R - LR * 0.38);
  fitFont(g, al.by, 450, 28, 14, LR * 1.4);
  g.fillText(al.by, R, R + LR * 0.38);
  g.font = '400 20px "Fragment Mono"';
  if (al.y) g.fillText(String(al.y), R, R + LR * 0.7);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(R, R, look.cd ? 60 : 11, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
  return { cv, transparent: look.cd ? true : look.alpha < 1, look };
}

function setHeroFront(al) {
  // atlas crop straight away, then the medium sleeve
  const img = sheetImg[sleeveCell(d, A.indexOf(al)).sheet];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const cell = sleeveCell(d, A.indexOf(al));
  if (img) g.drawImage(img, cell.x, cell.y, cell.size, cell.size, 0, 0, 128, 128);
  else { g.fillStyle = al.fl; g.fillRect(0, 0, 128, 128); }
  const tmp = new THREE.CanvasTexture(cv); tmp.colorSpace = THREE.SRGBColorSpace;
  if (!hero?.hasMedium) { heroFrontMat.map?.userData?.temp && heroFrontMat.map.dispose(); tmp.userData.temp = true; heroFrontMat.map = tmp; heroFrontMat.needsUpdate = true; }
  mediumTexture(al, tex => {
    if (!hero || hero.al !== al) return;
    if (heroFrontMat.map?.userData?.temp) heroFrontMat.map.dispose();
    heroFrontMat.map = tex; heroFrontMat.needsUpdate = true; hero.hasMedium = true;
  });
}

// ---------------------------------------------------------------------------
// state
let lens = null;
let crates = [];          // [{ name, items, swatch, pos, target, winStart }]
let active = 0;
let camX = 0, dragX = 0;
let hero = null;          // { c, i, al, idx, p, s, dir, hasMedium }
let pendingPull = null;   // { c, i, at }
let lensAnim = null;      // { phase, t0, next }
let lastNow = -1;

function applyLens(key) {
  lens = getLens(key);
  crates = lens.crates.map(cr => ({ ...cr, pos: 0, target: 0, winStart: null }));
  crateGroups.forEach((g, c) => { g.visible = c < crates.length; if (c < crates.length) drawCrateCards(c, crates[c]); });
  const len = (crates.length - 1) * SPACING + 5;
  bench.scale.x = len; bench.position.set((crates.length - 1) * SPACING / 2, -0.03 - 0.43, 0);
  active = clamp(active, 0, crates.length - 1);
  renderLensBar(); renderStrip(); updateHud(true);
}

// ---------------------------------------------------------------------------
// per-frame layout of every sleeve
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _col = new THREE.Color();
const pz = k => Z_CUR + 0.045 + Math.min(k, 10) * 0.016;

/** Where record i of crate c sits for a crate position `pos`. Writes into _p / _q. Returns false if hidden. */
function recordPose(c, i, pos, yOff = 0) {
  const t = pos - i;
  if (t > FLIPPED + 0.5 || t < -BEHIND) return false;
  const kmax = clamp(pos - 1, 0, 10);
  const rest = Math.atan((FRONT_IN - pz(kmax)) / FRONT_H);
  const jx = (hash(i * 3 + c * 131) - 0.5) * 0.026;
  const ja = (hash(i * 5 + 1 + c * 17) - 0.5) * 0.014;
  const jy = (hash(i * 11 + 7) - 0.5) * 0.012;
  let z, ang, y = 0;
  if (t <= 0) {
    z = Z_CUR + t * GAP; ang = STAND + ja;
  } else if (t < 1) {
    const e = smooth(0.08, 0.92, t);
    z = lerp(Z_CUR, pz(0), e); ang = lerp(STAND + ja, rest - kmax * 0.0096, e);
    y = Math.sin(Math.PI * t) * 0.07;
  } else {
    const k = Math.min(t - 1, 10);
    z = pz(k); ang = rest - (kmax - k) * 0.0096 + ja * 0.5;
  }
  if (Math.abs(t) < 1) y += 0.03 * (1 - Math.abs(t));
  _p.set(crateX(c) + jx, y + yOff, z);
  _e.set(ang, jy, 0); _q.setFromEuler(_e);
  return true;
}

function lensOffset(c, j, now) {
  if (!lensAnim) return 0;
  const el = (now - lensAnim.t0) / 1000;
  const delay = Math.min(Math.abs(c - active), 7) * 0.035 + (WIN - 1 - j) * 0.0035;
  if (lensAnim.phase === 'out') return easeIn(clamp((el - delay) / 0.3, 0, 1)) * 3.2;
  const p = clamp((el - delay) / 0.42, 0, 1);
  return (1 - easeOut(p)) * 3.2 - Math.sin(p * Math.PI) * 0.03 * (p > 0.6 ? 1 : 0);
}

function layoutRecords(now) {
  for (let c = 0; c < MAX_CRATES; c++) {
    const base = c * WIN;
    const cr = crates[c];
    if (!cr) { for (let j = 0; j < WIN; j++) records.setMatrixAt(base + j, ZERO); continue; }
    const start = Math.floor(cr.pos) - FLIPPED;
    if (cr.winStart !== start) {
      cr.winStart = start;
      for (let j = 0; j < WIN; j++) {
        const i = start + j;
        if (i < 0 || i >= cr.items.length) continue;
        const ai = cr.items[i];
        const cell = sleeveCell(d, ai);
        aCell.setXYZW(base + j, cell.u, cell.v, cell.sheet, 0);
        _col.set(A[ai].fl);
        aCol.setXYZ(base + j, _col.r, _col.g, _col.b);
      }
      aCell.needsUpdate = true; aCol.needsUpdate = true;
    }
    for (let j = 0; j < WIN; j++) {
      const i = start + j;
      if (i < 0 || i >= cr.items.length || (hero && hero.c === c && hero.i === i) || !recordPose(c, i, cr.pos, lensOffset(c, j, now))) {
        records.setMatrixAt(base + j, ZERO); continue;
      }
      _m.compose(_p, _q, _s);
      records.setMatrixAt(base + j, _m);
    }
    // the divider rides with the restock too
    const div = crateGroups[c].userData.divider;
    div.position.y = lensOffset(c, WIN - 1, now) * 1.1;
  }
  records.instanceMatrix.needsUpdate = true;
  records.boundingSphere = null;
}

// ---------------------------------------------------------------------------
// camera
function isPhone() { return innerWidth < 760; }
function camPose(x, out, look) {
  if (isPhone()) { out.set(x - 0.32, 2.75, 2.95); look.set(x + 0.04, 0.42, 0.02); }
  else { out.set(x - 1.05, 2.5, 3.8); look.set(x + 0.5, 0.36, -0.25); }
}
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = isPhone() ? 47 : 36;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// presentation pose for the pulled record, worked out from the free screen area
const _pp = new THREE.Vector3(), _pq = new THREE.Quaternion(), _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _dir = new THREE.Vector3();
function presentPose() {
  const W = innerWidth, H = innerHeight, phone = isPhone();
  const panelW = phone ? 0 : Math.min(410, W * 0.36);
  const top = phone ? 96 : 110, bottom = phone ? H * 0.54 + 8 : 40;
  const fw = W - panelW, fh = H - top - bottom;
  const cx = fw / 2, cy = top + fh / 2;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const Dh = 1.0 / (2 * tanH * (fh * 0.74 / H));
  const Dw = (phone ? 1.5 : 1.62) / (2 * tanH * camera.aspect * (fw * 0.82 / W));
  const D = Math.max(Dh, Dw, 1.3);
  _dir.set((cx / W) * 2 - 1, -((cy / H) * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
  camera.getWorldDirection(_fwd);
  _pp.copy(camera.position).addScaledVector(_dir, D / _dir.dot(_fwd));
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _pp.addScaledVector(_right, phone ? -0.25 : -0.29);
  _e.set(0.0, 0.2, 0); _pq.copy(camera.quaternion).multiply(_q.setFromEuler(_e));
}

// ---------------------------------------------------------------------------
// riffle sound: a short burst of filtered noise per sleeve
let audio = null, noise = null, lastTick = 0;
let soundOn = (() => { try { return localStorage.getItem('aisle-sound') !== 'off'; } catch { return true; } })();
const soundBtn = $('soundBtn');
function renderSound() { soundBtn.textContent = soundOn ? 'Riffle sound on' : 'Riffle sound off'; soundBtn.setAttribute('aria-pressed', soundOn); }
renderSound();
soundBtn.onclick = () => { soundOn = !soundOn; try { localStorage.setItem('aisle-sound', soundOn ? 'on' : 'off'); } catch {} renderSound(); };
function ensureAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  try {
    audio = new AudioContext();
    noise = audio.createBuffer(1, audio.sampleRate * 0.08, audio.sampleRate);
    const ch = noise.getChannelData(0);
    for (let k = 0; k < ch.length; k++) ch[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / ch.length, 3);
  } catch { audio = null; }
}
function tick() {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  if (t - lastTick < 0.028) return;
  lastTick = t;
  const src = audio.createBufferSource(); src.buffer = noise; src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 1800; bp.Q.value = 0.9;
  const gain = audio.createGain(); gain.gain.value = 0.11;
  src.connect(bp).connect(gain).connect(audio.destination); src.start();
}

// ---------------------------------------------------------------------------
// actions
const cur = () => crates[active];
const facing = cr => clamp(Math.round(cr.target), 0, cr.items.length - 1);

function flick(n) {
  if (lensAnim) return;
  if (hero) { stepPulled(n); return; }
  const cr = cur();
  cr.target = clamp(Math.round(cr.target) + n, 0, cr.items.length - 1);
}
function goCrate(c) {
  if (lensAnim || !crates.length) return;
  c = clamp(c, 0, crates.length - 1);
  if (c === active) return;
  if (hero) putBack();
  if (reduced) crossfade(() => { active = c; camX = crateX(c); updateHud(true); });
  else { active = c; updateHud(true); }
}
function crossfade(fn) {
  const f = $('fade'); f.classList.add('on');
  setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, 170);
}

function pull(c = active, i = facing(crates[active])) {
  const cr = crates[c];
  if (!cr || i < 0 || i >= cr.items.length) return;
  const idx = cr.items[i];
  const al = A[idx];
  hero = { c, i, idx, al, p: reduced ? 1 : 0, s: reduced ? 1 : 0, dir: 1, hasMedium: false, t: 0 };
  heroGroup.visible = true;
  setHeroFront(al);
  _col.set(al.fl);
  heroBackMat.color.copy(_col).multiplyScalar(0.6);
  heroEdgeMat.color.copy(_col).multiplyScalar(0.4);
  const { cv, transparent, look } = discCanvas(al);
  discFaceMat.map?.dispose();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  discFaceMat.map = tex; discFaceMat.transparent = transparent; discFaceMat.depthWrite = !transparent; discFaceMat.needsUpdate = true;
  discEdgeMat.color.set(look.cd ? '#b9bdc2' : look.body[0]).multiplyScalar(0.6);
  disc.scale.setScalar(look.cd ? 0.82 : 1);
  sheen.scale.setScalar(look.cd ? 0.82 : 1);
  disc.rotation.z = Math.PI / 2;
  openPanel(idx);
  ensureAudio();
  const u = new URL(location); u.searchParams.set('album', al.slug); u.searchParams.set('lens', lens.key); history.replaceState(null, '', u);
}
function putBack() {
  if (!hero) return;
  hero.dir = -1;
  if (reduced) { hero.p = 0; hero.s = 0; }
  closePanel();
  const u = new URL(location); u.searchParams.delete('album'); history.replaceState(null, '', u);
}
function stepPulled(n) {
  const { c, i } = hero;
  const ni = clamp(i + n, 0, crates[c].items.length - 1);
  if (ni === i) return;
  putBack();
  crates[c].target = ni;
  pendingPull = { c, i: ni, at: performance.now() };
}
/** Find a record in the crates: dolly to its crate, riffle to it, pull it out. */
function jumpTo(idx, { pullIt = true } = {}) {
  if (lensAnim) return;
  const c = lens.crateOf[idx], i = lens.posOf[idx];
  if (hero) putBack();
  const cr = crates[c];
  if (Math.abs(cr.pos - i) > 9) { cr.pos = clamp(i + (i > cr.pos ? -8 : 8), 0, cr.items.length - 1); cr.winStart = null; }
  cr.target = i;
  if (reduced) { cr.pos = i; }
  if (c !== active) { if (reduced) crossfade(() => { active = c; camX = crateX(c); updateHud(true); }); else { active = c; updateHud(true); } }
  if (pullIt) pendingPull = { c, i, at: performance.now() };
}
function setLens(key, focusIdx = null) {
  if (lensAnim || (lens && lens.key === key && focusIdx == null)) return;
  if (hero) putBack();
  const finish = () => {
    if (focusIdx != null) {
      const L = getLens(key);
      active = L.crateOf[focusIdx];
    }
    applyLens(key);
    if (focusIdx != null) {
      const cr = crates[active]; const i = lens.posOf[focusIdx];
      cr.pos = cr.target = i; cr.winStart = null;
      camX = reduced ? crateX(active) : camX;
      pendingPull = { c: active, i, at: performance.now() + (reduced ? 0 : 900) };
    }
    const u = new URL(location); u.searchParams.set('lens', key); history.replaceState(null, '', u);
  };
  if (reduced || !lens) { lens ? crossfade(finish) : finish(); return; }
  lensAnim = { phase: 'out', t0: performance.now(), finish };
  for (let k = 0; k < 6; k++) setTimeout(tick, k * 60);
}

// ---------------------------------------------------------------------------
// DOM: lens bar, crate strip, HUD, panel
function renderLensBar() {
  $('lenses').innerHTML = LENSES.map((l, k) => `<button role="tab" data-lens="${l.key}" aria-selected="${lens?.key === l.key}">${l.label}<kbd>${k + 1}</kbd></button>`).join('');
}
$('lenses').addEventListener('click', e => { const b = e.target.closest('button[data-lens]'); if (b) setLens(b.dataset.lens); });
function renderStrip() {
  $('strip').innerHTML = crates.map((cr, c) => {
    const sw = cr.swatch ? `<i style="background:${cr.swatch === 'mix' ? 'conic-gradient(#d4553f,#e3b23c,#4f9a6b,#3f7fb5,#d4553f)' : cr.swatch}"></i>` : '';
    return `<button data-c="${c}" aria-current="${c === active}">${sw}${esc(cr.name)}<b>${nf(cr.items.length)}</b></button>`;
  }).join('');
}
$('strip').addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (b) goCrate(+b.dataset.c); });
let announced = '';
function updateHud(force = false) {
  if (!lens) return;
  const cr = cur();
  const i = clamp(Math.round(cr.pos), 0, cr.items.length - 1);
  const key = `${lens.key}:${active}:${i}`;
  if (!force && key === lastNow) return;
  const crateChanged = force || !String(lastNow).startsWith(`${lens.key}:${active}:`);
  lastNow = key;
  if (crateChanged) {
    $('lensLabel').textContent = lens.label;
    $('crateName').textContent = cr.name;
    $('crateMeta').textContent = `${nf(cr.items.length)} records · ${lens.note}`;
    document.querySelectorAll('#strip button').forEach(b => {
      const on = +b.dataset.c === active; b.setAttribute('aria-current', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    });
  }
  const al = A[cr.items[i]];
  const extra = lens.key === 'label' && cr.name === 'Other labels' ? ` · ${esc(firstLabel[cr.items[i]])}` : '';
  $('now').innerHTML = `<span class="x-mono">${i + 1} / ${nf(cr.items.length)}</span><b>${esc(al.t)}</b><br><span>${esc(al.by)}${al.y ? `, ${al.y}` : ''}${extra}</span>`;
  clearTimeout(updateHud.tm);
  updateHud.tm = setTimeout(() => { const s = `${al.t} by ${al.by}`; if (s !== announced) { announced = s; $('now').setAttribute('aria-label', `${i + 1} of ${cr.items.length}: ${s}`); } }, 400);
}
$('prevCrate').onclick = () => goCrate(active - 1);
$('nextCrate').onclick = () => goCrate(active + 1);
$('back').onclick = () => flick(-1);
$('fwd').onclick = () => flick(1);
$('pullBtn').onclick = () => { if (!lensAnim) pull(); };
$('putBack').onclick = () => putBack();

function thumbStyle(idx, size) {
  const c = sleeveCell(d, idx); const k = size / c.size;
  return `background-image:url(${sleeveSheetUrl(c.sheet)});background-size:${d.atlas.cols * c.size * k}px;background-position:-${c.x * k}px -${c.y * k}px`;
}
function thumbButton(idx) {
  const al = A[idx];
  return `<button data-jump="${idx}" title="${esc(al.t)} — ${esc(al.by)}${al.y ? `, ${al.y}` : ''}"><span class="th" style="${thumbStyle(idx, 66)}"></span><em>${esc(al.t)}</em></button>`;
}
function swatchFor(al) {
  const look = vinylLook(al);
  if (look.cd) return '#b9bdc2';
  if (look.body.length > 1) return `conic-gradient(${look.body.concat(look.body[0]).join(',')})`;
  return look.body[0];
}

const panel = $('panel');
function openPanel(idx) {
  const al = A[idx];
  const cr = crates[lens.crateOf[idx]];
  $('pWhere').textContent = `${cr.name} · ${lens.posOf[idx] + 1} of ${nf(cr.items.length)}`;
  $('pTitle').textContent = al.t;
  $('pArtist').innerHTML = al.a.length
    ? al.a.map(a => `<a href="${artistHref(d.artists[a])}" target="_blank" rel="noopener">${esc(d.artists[a].name)}</a>`).join(', ')
    : esc(al.by);
  const disc = al.fmt === 'CD' ? 'CD' : al.vc ? `<span class="swatch" style="background:${swatchFor(al)}"></span>${esc(al.vc)}` : `<span class="swatch" style="background:#111"></span>Black`;
  const facts = [
    ['Year', al.y || '—'],
    ['Label', esc([...new Set(al.l.map(cleanLabel))].slice(0, 3).join(', ') || '—')],
    ['Pressing', `${esc(al.fmt || 'Vinyl')} · ${esc(al.c || 'unknown')}`],
    ['Disc', disc],
    ['Style', esc((al.s.length ? al.s : al.g).slice(0, 4).join(', ') || '—')],
  ];
  if (al.lis) facts.push(['Last.fm', `${nf(al.lis)} listeners`]);
  $('pFacts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('pLink').href = albumHref(al);

  // the same record under every other lens
  $('pLenses').innerHTML = LENSES.filter(l => l.key !== lens.key).map(l => {
    const L = getLens(l.key); const c = L.crates[L.crateOf[idx]];
    return `<button data-lens="${l.key}" data-idx="${idx}"><small>${l.label}</small>${esc(c.name)}</button>`;
  }).join('');

  // related: same artist, then linked artists with the reason
  const groups = [];
  const seen = new Set([idx]);
  for (const a of al.a) {
    const ar = d.artists[a];
    const more = ar.records.filter(r => !seen.has(r));
    more.forEach(r => seen.add(r));
    if (more.length) groups.push({ text: `More by <b>${esc(ar.name)}</b>`, items: more.slice(0, 10) });
  }
  const links = [];
  for (const a of al.a) for (const nb of d.neighbours[a]) links.push({ from: a, ...nb });
  const rank = l => (l.why.some(w => w.type === 'guest' && w.album === idx) ? 0 : l.why.some(w => w.type === 'bandmate' || w.type === 'member' || w.type === 'group') ? 1 : 2);
  links.sort((x, y) => rank(x) - rank(y) || d.artists[y.other].records.length - d.artists[x.other].records.length);
  const seenArtists = new Set(al.a);
  for (const l of links) {
    if (seenArtists.has(l.other) || groups.length > 9) continue;
    seenArtists.add(l.other);
    const recs = d.artists[l.other].records.filter(r => !seen.has(r));
    if (!recs.length) continue;
    recs.forEach(r => seen.add(r));
    const why = l.why.find(w => w.type === 'guest' && w.album === idx) || l.why[0];
    const more = l.why.length > 1 ? ` <span>+${l.why.length - 1} more link${l.why.length > 2 ? 's' : ''}</span>` : '';
    groups.push({ text: `<b>${esc(d.artists[l.other].name)}</b>: ${esc(describeLink(d, why, l.from, l.other))}${more}`, items: recs.slice(0, 8) });
  }
  if (groups.length < 3) {
    const lab = al.l[0];
    const same = (d.byLabel.get(lab) || []).filter(r => !seen.has(r) && A[r].y && al.y && Math.abs(A[r].y - al.y) <= 2);
    if (same.length) groups.push({ text: `Also on <b>${esc(cleanLabel(lab))}</b> within two years`, items: same.slice(0, 8) });
  }
  $('pRelated').innerHTML = groups.length
    ? groups.map(g => `<div class="rel"><p>${g.text}</p><div class="rel-row">${g.items.map(thumbButton).join('')}</div></div>`).join('')
    : `<p class="rel" style="color:var(--dim);font-size:13.5px;margin:0">Nothing else in the collection links to this one yet.</p>`;

  renderTv(al);
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('pulled');
  panel.scrollTop = 0;
}
function closePanel() {
  panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('pulled');
  setTimeout(() => { if (!hero || hero.dir < 0) $('tvWrap').innerHTML = ''; }, 300);
}
panel.addEventListener('click', e => {
  const j = e.target.closest('[data-jump]');
  if (j) { jumpTo(+j.dataset.jump); canvas.focus({ preventScroll: true }); return; }
  const l = e.target.closest('button[data-lens]');
  if (l) { setLens(l.dataset.lens, +l.dataset.idx); canvas.focus({ preventScroll: true }); }
});

function renderTv(al) {
  let vids = al.v.map(v => ({ id: v[0], title: v[1], kind: v[2] }));
  let from = 'This record';
  if (!vids.length) {
    for (const a of al.a) vids.push(...d.artists[a].videos.map(v => ({ id: v[0], title: v[1], kind: v[2] ? `from ${v[2]}` : '' })));
    vids = vids.slice(0, 4);
    from = vids.length ? `${d.artists[al.a[0]].name}` : '';
  }
  const wrap = $('tvWrap');
  if (!vids.length) { wrap.innerHTML = ''; return; }
  let k = 0, sound = false;
  const draw = () => {
    const v = vids[k];
    wrap.innerHTML = `<div class="tv"><div class="tv-screen"><iframe allow="autoplay; encrypted-media" title="${esc(v.title)}" src="${ytEmbed(v.id, { mute: sound ? 0 : 1 })}"></iframe>
      <button class="tv-sound" aria-label="${sound ? 'Mute' : 'Sound on'}"><span>${sound ? 'Mute' : 'Tap for sound'}</span></button></div>
      <div class="tv-cap"><span class="x-plate">TV · ${esc(from)}</span><span class="x-mono">${esc(v.title)}${v.kind && v.kind !== 'video' ? ` · ${esc(v.kind)}` : ''}</span></div>
      ${vids.length > 1 ? `<div class="tv-list">${vids.map((_, n) => `<button data-v="${n}" aria-current="${n === k}">${n + 1}</button>`).join('')}</div>` : ''}</div>`;
    wrap.querySelector('.tv-sound').onclick = () => { sound = !sound; draw(); };
    wrap.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => { k = +b.dataset.v; draw(); }; });
  };
  draw();
}

// ---------------------------------------------------------------------------
// input: wheel, drag / swipe, tap, keys
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function pick(x, y) {
  _ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (hero && hero.dir > 0) {
    if (raycaster.intersectObject(heroGroup, true).length) return { hero: true };
  }
  const hit = raycaster.intersectObject(records)[0];
  const crateHit = raycaster.intersectObjects(crateGroups.filter(g => g.visible), true)[0];
  if (hit && (!crateHit || hit.distance <= crateHit.distance + 0.01)) {
    const c = Math.floor(hit.instanceId / WIN), j = hit.instanceId % WIN;
    return { c, i: crates[c].winStart + j };
  }
  if (crateHit) return { c: crateHit.object.userData.crate, crate: true };
  return null;
}
function tap(x, y) {
  if (lensAnim) return;
  const h = pick(x, y);
  if (hero) { if (!h || !h.hero) putBack(); return; }
  if (!h) return;
  if (h.c !== active) { goCrate(h.c); return; }
  if (h.crate) return;
  const cr = cur(); const f = facing(cr);
  if (h.i === f && Math.abs(cr.pos - f) < 0.3) pull();
  else cr.target = clamp(h.i, 0, cr.items.length - 1);
}

let drag = null;
const stepPx = () => (isPhone() ? 22 : 26);
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (!crates.length) return;
  drag = { x: e.clientX, y: e.clientY, axis: null, start: cur().target, vy: 0, ly: e.clientY, lt: performance.now() };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) {
    if (e.pointerType === 'mouse') { const h = pick(e.clientX, e.clientY); canvas.classList.toggle('point', !!h && (!h.crate || h.c !== active)); }
    return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.axis && Math.hypot(dx, dy) > 9) drag.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
  const now = performance.now();
  if (drag.axis === 'y' && !hero && !lensAnim) {
    const cr = cur();
    cr.target = clamp(drag.start + dy / stepPx(), 0, cr.items.length - 1);
    const dt = Math.max(now - drag.lt, 1);
    drag.vy = clamp(lerp(drag.vy, (e.clientY - drag.ly) / dt, 0.5), -2.5, 2.5);
  } else if (drag.axis === 'x' && !hero) {
    dragX = clamp(-dx / innerWidth * 1.6, -1.2, 1.2);
  }
  drag.ly = e.clientY; drag.lt = now;
});
function endDrag(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const g = drag; drag = null; dragX = 0;
  if (!g.axis) { tap(e.clientX, e.clientY); return; }
  if (g.axis === 'y') {
    if (hero) { if (Math.abs(dy) > 30) stepPulled(dy > 0 ? 1 : -1); return; }
    const cr = cur();
    cr.target = clamp(Math.round(cr.target + (g.vy * 1000 / stepPx()) * 0.12), 0, cr.items.length - 1);
  } else if (Math.abs(dx) > 50) {
    goCrate(active + (dx < 0 ? 1 : -1));
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', e => { drag = null; dragX = 0; });

let wheelAcc = 0, wheelT = 0;
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (lensAnim) return;
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
  if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 30 && performance.now() - wheelT > 450) {
    wheelT = performance.now(); goCrate(active + (dx > 0 ? 1 : -1)); return;
  }
  wheelAcc += dy;
  const step = hero ? 90 : 36;
  while (Math.abs(wheelAcc) >= step) { const n = Math.sign(wheelAcc); wheelAcc -= n * step; flick(n); if (hero) { wheelAcc = 0; break; } }
}, { passive: false });

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, a, iframe');
  ensureAudio();
  switch (e.key) {
    case 'ArrowDown': case 'j': flick(1); break;
    case 'ArrowUp': case 'k': flick(-1); break;
    case 'PageDown': flick(10); break;
    case 'PageUp': flick(-10); break;
    case 'ArrowRight': goCrate(active + 1); break;
    case 'ArrowLeft': goCrate(active - 1); break;
    case 'Enter': case ' ':
      if (onControl) return;
      if (hero && hero.dir > 0) putBack(); else if (!lensAnim) pull();
      break;
    case 'Escape': putBack(); break;
    default:
      if (/^[1-6]$/.test(e.key)) setLens(LENSES[+e.key - 1].key); else return;
  }
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// frame loop
let prev = performance.now();
let lastFloor = new Map();
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _up = new THREE.Vector3();
function frame(now) {
  const dt = Math.min((now - prev) / 1000, 0.05); prev = now;

  // lens restock phases
  if (lensAnim) {
    const el = (now - lensAnim.t0) / 1000;
    if (lensAnim.phase === 'out' && el > 0.78) { lensAnim.finish(); lensAnim = { phase: 'in', t0: now }; for (let k = 0; k < 8; k++) setTimeout(tick, 250 + k * 45); }
    else if (lensAnim.phase === 'in' && el > 1.0) lensAnim = null;
  }

  // crate positions chase their targets: fast when far (a riffle), easing in at the end
  crates.forEach((cr, c) => {
    const diff = cr.target - cr.pos;
    if (reduced && !drag) { cr.pos = cr.target; }
    else if (Math.abs(diff) > 1e-4) {
      let step = diff * (1 - Math.exp(-dt * 13));
      const mag = clamp(Math.abs(step), Math.min(Math.abs(diff), 2.2 * dt), 30 * dt);
      cr.pos += Math.sign(diff) * mag;
    } else cr.pos = cr.target;
    if (c === active) {
      const f = Math.floor(cr.pos + 0.5);
      if (lastFloor.get(c) !== undefined && lastFloor.get(c) !== f) tick();
      lastFloor.set(c, f);
    }
  });

  // camera dolly along the aisle
  const tx = crateX(active) + dragX;
  camX = reduced ? crateX(active) : lerp(camX, tx, 1 - Math.exp(-dt * 6.5));
  camPose(camX, _cp, _cl);
  camera.position.copy(_cp); camera.lookAt(_cl);
  camera.updateMatrixWorld();
  lightUniforms.uLamp.value.set(camX + 0.15, 2.55, 1.25);
  lightUniforms.uDim.value = lerp(lightUniforms.uDim.value, hero && hero.dir > 0 ? 0.42 : 1, 1 - Math.exp(-dt * 5));

  if (crates.length) {
    layoutRecords(now);
    updateHud();
  }

  // detail overlay on the facing record once it settles
  const cr = cur();
  const f = cr ? facing(cr) : -1;
  const settled = cr && !lensAnim && Math.abs(cr.pos - cr.target) < 0.02 && Math.abs(cr.target - f) < 0.01 && !(hero && hero.c === active && hero.i === f);
  if (settled) {
    const idx = cr.items[f];
    if (detailFor !== idx) {
      detailFor = idx; detail.visible = false;
      mediumTexture(A[idx], tex => { if (detailFor === idx) { detailMat.uniforms.map.value = tex; detail.visible = true; } });
    }
    if (recordPose(active, f, cr.pos)) { detail.matrix.compose(_p, _q, _s); detail.matrixWorld.copy(detail.matrix); }
  } else { detail.visible = false; detailFor = null; }

  // pending pull (after a jump or a step while pulled)
  if (pendingPull && !hero && now >= pendingPull.at) {
    const pc = crates[pendingPull.c];
    const arrived = Math.abs(camX - crateX(pendingPull.c)) < 0.06 && pc && Math.abs(pc.pos - pendingPull.i) < 0.03 && !lensAnim;
    if (arrived) { const { c, i } = pendingPull; pendingPull = null; pull(c, i); }
    else if (now - pendingPull.at > 6000) pendingPull = null;
  }

  // pulled record
  if (hero) {
    if (hero.dir > 0) {
      hero.p = Math.min(1, hero.p + dt / 0.75);
      if (hero.p > 0.72) hero.s = Math.min(1, hero.s + dt / 0.65);
    } else {
      hero.s = Math.max(0, hero.s - dt / 0.22);
      if (hero.s < 0.35) hero.p = Math.max(0, hero.p - dt / 0.45);
    }
    if (hero.dir < 0 && hero.p <= 0) { hero = null; heroGroup.visible = false; }
    else {
      hero.t += dt;
      presentPose();
      const home = !!crates[hero.c] && recordPose(hero.c, hero.i, crates[hero.c].pos);
      _up.set(0, 0.5, 0).applyQuaternion(_q); _hp.copy(_p).add(_up); _hq.copy(_q);
      if (!home) { _hp.copy(_pp); _hq.copy(_pq); }
      const e = easeInOut(hero.p);
      heroGroup.position.lerpVectors(_hp, _pp, e);
      heroGroup.position.y += Math.sin(Math.PI * e) * 0.45;
      heroGroup.quaternion.slerpQuaternions(_hq, _pq, e);
      if (!reduced) {
        _e.set(Math.sin(hero.t * 0.7) * 0.025 * e, Math.sin(Math.PI * e) * 0.9 + Math.sin(hero.t * 0.5) * 0.04 * e, 0);
        heroGroup.quaternion.multiply(_q.setFromEuler(_e));
      }
      // early in the lift it is still among the sleeves, so it is depth-sorted with them
      const layer = hero.p < 0.3 ? scene : heroScene;
      if (heroGroup.parent !== layer) layer.add(heroGroup);
      discSlide.position.x = easeInOut(hero.s) * (isPhone() ? 0.5 : 0.6);
      if (!reduced && hero.s > 0.5) disc.rotation.z -= dt * 0.55;
    }
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (heroGroup.visible && heroGroup.parent === heroScene) { renderer.clearDepth(); renderer.render(heroScene, camera); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// start
await Promise.race([
  Promise.all(['640 40px Saira', '450 28px Saira', '400 40px Michroma', '400 27px "Fragment Mono"'].map(f => document.fonts.load(f))),
  new Promise(r => setTimeout(r, 2500)),
]).catch(() => {});

const startLens = LENSES.some(l => l.key === params.get('lens')) ? params.get('lens') : 'genre';
const startAlbum = d.albumBySlug.get(params.get('album'));
const startSeed = d.artistBySlug.get(params.get('seed'));
const focusIdx = startAlbum ?? (startSeed != null ? d.artists[startSeed].records[0] : null);
if (focusIdx != null) active = getLens(startLens).crateOf[focusIdx];
applyLens(startLens);
camX = crateX(active);
if (focusIdx != null) {
  const cr = crates[active]; const i = lens.posOf[focusIdx];
  cr.pos = cr.target = i;
  if (startAlbum != null) pendingPull = { c: active, i, at: performance.now() + 300 };
}
canvas.tabIndex = 0;
requestAnimationFrame(frame);
