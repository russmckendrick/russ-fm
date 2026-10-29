/**
 * The Galaxy's Three.js scene: instanced avatar stars with glows, light
 * trails, family dust and haze, orbiting record discs for the focused artist,
 * camera flights, picking, and the DOM labels drawn over the canvas (family
 * names, linked artists, edge pills, the tooltip).
 *
 * Loaded only by GalaxyCanvas (lazy), so `three` stays out of the main bundle.
 * The page owns state (which artist is focused, the URL); the scene reports
 * clicks through callbacks and is told what to show.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { vinylLook } from '@/lib/vinylLook';
import { AVATAR_SHEET_URL, avatarCell, sleeveCell, sleeveSheetUrl } from './data';
import { GalaxyHiRes } from './galaxyHiRes';
import {
  TRAIL_KINDS,
  clearOfEachOther,
  discPaint,
  edgePoint,
  focusDistance,
  hexToRgb,
  labelledConnections,
  orbitRings,
  otherEnd,
  reasonLines,
  spreadPinned,
  type Box,
  type GalaxyPrep,
  type OrbitRing,
  type Pinned,
} from './galaxyLayout';
import type { ExploreData } from './types';

export interface GalaxySceneOptions {
  canvas: HTMLCanvasElement;
  /** Absolutely positioned over the canvas; labels and the tooltip go in here. */
  overlay: HTMLElement;
  data: ExploreData;
  prep: GalaxyPrep;
  positions: Float32Array;
  reducedMotion: boolean;
  /** A star, trail or label was clicked: go to this artist (along `link` when there is one). */
  onSelect: (artist: number, link: number) => void;
  /** A record disc was clicked. */
  onOpenAlbum: (album: number) => void;
  /** A family label was clicked (the scene flies there itself). */
  onFamily?: (family: number) => void;
  /** The visitor touched the map (drag, wheel, click). */
  onInteract?: () => void;
}

export interface Insets {
  /** Room the panel takes on the right (wide screens) or at the bottom (phones). */
  right: number;
  bottom: number;
  /** The title and search block in the top left: labels keep out of it. */
  hudRight: number;
  hudBottom: number;
}

const SKY = '#0e0d0c';
const MAX_DISCS = 48;
const SEG = 10;
const MIN_PX = 2.3;
const NEAR_LABELS = 24;
const FAT_LINES = 40;

const STAR_VS = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute vec3 iCol; attribute vec4 iCell;
attribute float iDim; attribute float iHi; attribute float iSeed; attribute float iClear;
uniform vec2 uRes; uniform float uMinPx; uniform float uQuad; uniform float uTime; uniform float uFocus;
varying vec2 vUv; varying vec3 vCol; varying vec4 vCell; varying float vDim; varying float vHi; varying float vPx; varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float z = max(-mv.z, 0.1);
  float px = iSize * projectionMatrix[1][1] * uRes.y * 0.5 / z;
  float s = iSize * iClear * max(1.0, uMinPx / max(px, 0.001));
  vPx = px;
  vec2 q = position.xy * 2.0 * uQuad;
  mv.xy += q * s;
  vUv = q; vCol = iCol; vCell = iCell; vDim = iDim * uFocus; vHi = iHi;
  vTw = 0.82 + 0.18 * sin(uTime * (0.5 + fract(iSeed * 7.0)) + iSeed * 40.0);
  gl_Position = iSize <= 0.0 || iClear < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;

const CORE_FS = /* glsl */ `
uniform sampler2D uAtlas; uniform vec3 uBg; uniform float uHaveAtlas;
varying vec2 vUv; varying vec3 vCol; varying vec4 vCell; varying float vDim; varying float vHi; varying float vPx;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  vec2 t = vUv * 0.5 + 0.5; t.y = 1.0 - t.y;
  vec3 img = texture2D(uAtlas, vCell.xy + (t * 0.94 + 0.03) * vCell.zw).rgb;
  vec3 c = mix(vCol * 0.55, img, uHaveAtlas);
  c = mix(c, vCol, smoothstep(9.0, 3.5, vPx));
  c = mix(c, vCol, smoothstep(0.84, 0.93, r) * 0.9);
  c = mix(c, uBg, vDim * 0.82);
  gl_FragColor = vec4(c, 1.0);
}`;

const GLOW_FS = /* glsl */ `
uniform float uQuad;
varying vec2 vUv; varying vec3 vCol; varying float vDim; varying float vHi; varying float vTw; varying float vPx;
void main() {
  float r = length(vUv);
  float g = pow(clamp(1.0 - (r - 0.85) / (uQuad - 0.85), 0.0, 1.0), 2.8) * smoothstep(0.92, 1.04, r);
  float a = g * 0.5 * vTw * (1.0 - vDim * 0.92) * (1.0 + vHi * 0.8) * mix(1.0, 0.3, smoothstep(12.0, 70.0, vPx));
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
}`;

const DISC_VS = /* glsl */ `
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
}`;

const DISC_FS = /* glsl */ `
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
}`;

const TRAIL_VS = /* glsl */ `
attribute vec3 color; attribute float aAlpha; attribute float aOn;
uniform float uFocus;
varying vec3 vC; varying float vA;
void main() {
  vC = color;
  // aOn: 1 drawn as a bright fat line instead, 2 a focused artist's minor trail (kept thin, lifted a little)
  vA = aOn > 1.5 ? 0.09 * uFocus : aOn > 0.5 ? 0.0 : aAlpha * (1.0 - 0.85 * uFocus);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TRAIL_FS = /* glsl */ `
varying vec3 vC; varying float vA;
void main() { gl_FragColor = vec4(vC, vA); }`;

const DUST_VS = /* glsl */ `
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
}`;

const DUST_FS = /* glsl */ `
uniform float uFocus;
varying vec3 vC; varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 1.8) * vA * (1.0 - uFocus * 0.72);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, a);
}`;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const rgbColour = (rgb: readonly number[]) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);

interface Flight {
  t0: THREE.Vector3;
  target: THREE.Vector3;
  d0: number;
  d1: number;
  dir0: THREE.Vector3;
  dir1: THREE.Vector3;
  travel: number;
  path: ((t: number) => THREE.Vector3) | null;
  start: number;
  duration: number;
}

type Hit = { kind: 'disc'; j: number } | { kind: 'star'; i: number } | { kind: 'trail'; k: number };

export class GalaxyScene {
  private o: GalaxySceneOptions;
  private d: ExploreData;
  private p: GalaxyPrep;
  private pos: Float32Array;
  private rm: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private W = 1;
  private H = 1;
  private raf = 0;
  private clock = new THREE.Clock();
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private cleanups: (() => void)[] = [];
  private resizeObs: ResizeObserver;
  private texLoader = new THREE.TextureLoader();
  private blank: THREE.DataTexture;

  private shared = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uMinPx: { value: MIN_PX },
    uTime: { value: 0 },
    uFocus: { value: 0 },
  };
  private coreMat: THREE.ShaderMaterial;
  private dimAttr: THREE.InstancedBufferAttribute;
  /** Per star: 1 drawn at full size, down to 0 when it sits in front of the focused artist and shrinks out of the way. */
  private clearAttr: THREE.InstancedBufferAttribute;
  private hiAttr: THREE.InstancedBufferAttribute;
  private trailPos: Float32Array;
  private trailOn: Float32Array;
  private trailOnAttr: THREE.BufferAttribute;
  private fatMat: LineMaterial;
  private fatLines: LineSegments2 | null = null;
  private dustMat: THREE.ShaderMaterial;
  private spark: THREE.Sprite;
  private famC: THREE.Vector3[];
  private famSpread: number[];
  private famLabelAt: THREE.Vector3[];
  private galaxyC: THREE.Vector3;
  private overviewDirWide: THREE.Vector3;
  private overviewDirTall: THREE.Vector3;
  private sky = rgbColour(hexToRgb(SKY));
  private skyTarget = rgbColour(hexToRgb(SKY));

  // orbit
  private discGeo: THREE.InstancedBufferGeometry;
  private discMat: THREE.ShaderMaterial;
  private discPos = new Float32Array(MAX_DISCS * 3);
  private discPosAttr: THREE.InstancedBufferAttribute;
  private discAttrs: Record<string, THREE.InstancedBufferAttribute>;
  private orbit = { artist: -1, recs: [] as number[], rings: [] as OrbitRing[], disc: 3, outer: 0, U: new THREE.Vector3(), Ws: [] as THREE.Vector3[], centre: new THREE.Vector3() };
  private sheets: (THREE.Texture | null)[] = [null, null, null, null];

  // labels
  private famEls: HTMLButtonElement[] = [];
  private famSize: { w: number; h: number }[] = [];
  private nearEls: HTMLButtonElement[] = [];
  private meEl: HTMLSpanElement | null = null;
  private tip: HTMLDivElement;

  // state
  private focus = -1;
  private focusTarget = 0;
  private flight: Flight | null = null;
  private insets: Insets = { right: 0, bottom: 0, hudRight: 0, hudBottom: 0 };
  private offX = 0;
  private offY = 0;
  private lastInput = performance.now();
  private down: { x: number; y: number; t: number } | null = null;
  private hoverReq: { x: number; y: number } | null = null;
  private disposed = false;
  private hiRes: GalaxyHiRes;

  constructor(o: GalaxySceneOptions) {
    this.o = o;
    this.d = o.data;
    this.p = o.prep;
    this.pos = o.positions;
    this.rm = o.reducedMotion;
    const { canvas } = o;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2));
    this.renderer.setClearColor(this.sky, 1);
    this.camera = new THREE.PerspectiveCamera(50, 1, 2, 40000);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      rotateSpeed: 0.55,
      zoomSpeed: 0.9,
      screenSpacePanning: true,
      minDistance: 12,
      maxDistance: 16000,
      autoRotateSpeed: 0.28,
    });
    this.blank = new THREE.DataTexture(new Uint8Array([40, 38, 35, 255]), 1, 1);
    this.blank.needsUpdate = true;
    this.disposables.push(this.blank, this.controls);

    const { famC, famSpread } = this.families();
    this.famC = famC;
    this.famSpread = famSpread;
    this.famLabelAt = famC.map((c, k) => c.clone().add(new THREE.Vector3(0, famSpread[k] * 0.62, 0)));
    this.galaxyC = famC.reduce((s, c) => s.add(c), new THREE.Vector3()).divideScalar(Math.max(1, famC.length));
    [this.overviewDirWide, this.overviewDirTall] = this.overviewDirs();

    // stars
    const starGeo = this.instanced(this.p.n);
    const cells = new Float32Array(this.p.n * 4);
    const seeds = new Float32Array(this.p.n);
    let s = 7;
    for (let i = 0; i < this.p.n; i++) {
      const c = avatarCell(this.d, i);
      cells.set([c.u, c.v, c.w, c.h], i * 4);
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      seeds[i] = s / 4294967296;
    }
    starGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3));
    starGeo.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.p.size, 1));
    starGeo.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.p.colour, 3));
    starGeo.setAttribute('iCell', new THREE.InstancedBufferAttribute(cells, 4));
    starGeo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.dimAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.p.n), 1).setUsage(THREE.DynamicDrawUsage);
    this.hiAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.p.n), 1).setUsage(THREE.DynamicDrawUsage);
    starGeo.setAttribute('iDim', this.dimAttr);
    starGeo.setAttribute('iHi', this.hiAttr);
    this.clearAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.p.n).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    starGeo.setAttribute('iClear', this.clearAttr);
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uQuad: { value: 1 }, uAtlas: { value: this.blank }, uHaveAtlas: { value: 0 }, uBg: { value: this.sky } },
      vertexShader: STAR_VS,
      fragmentShader: CORE_FS,
      // drawn in the transparent pass after the trails, so trails never cross a face
      transparent: true,
    });
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uQuad: { value: 4.2 } },
      vertexShader: STAR_VS,
      fragmentShader: GLOW_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(starGeo, this.coreMat);
    const glow = new THREE.Mesh(starGeo, glowMat);
    core.frustumCulled = glow.frustumCulled = false;
    core.renderOrder = 3;
    glow.renderOrder = 4;
    this.scene.add(core, glow);
    this.disposables.push(starGeo, this.coreMat, glowMat);
    this.loadTexture(AVATAR_SHEET_URL, t => {
      this.coreMat.uniforms.uAtlas.value = t;
      this.coreMat.uniforms.uHaveAtlas.value = 1;
    });

    // trails: one buffer for every link
    const L = this.p.links.length;
    this.trailPos = new Float32Array(L * SEG * 6);
    const trailCol = new Float32Array(L * SEG * 6);
    const trailAlpha = new Float32Array(L * SEG * 2);
    this.trailOn = new Float32Array(L * SEG * 2);
    const kindRgb = TRAIL_KINDS.map(k => hexToRgb(k.colour));
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    for (let k = 0; k < L; k++) {
      const [a, c, b] = this.linkCtrl(k);
      const kind = this.p.kind[k];
      const lc = kindRgb[kind];
      for (let sg = 0; sg < SEG; sg++) {
        bez(a, c, b, sg / SEG, p0);
        bez(a, c, b, (sg + 1) / SEG, p1);
        const off = (k * SEG + sg) * 6;
        this.trailPos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], off);
        trailCol.set([...lc, ...lc], off);
      }
      trailAlpha.fill(TRAIL_KINDS[kind].alpha, k * SEG * 2, (k + 1) * SEG * 2);
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1));
    this.trailOnAttr = new THREE.BufferAttribute(this.trailOn, 1).setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute('aOn', this.trailOnAttr);
    const trailMat = new THREE.ShaderMaterial({
      uniforms: { uFocus: this.shared.uFocus },
      vertexShader: TRAIL_VS,
      fragmentShader: TRAIL_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trails = new THREE.LineSegments(trailGeo, trailMat);
    trails.frustumCulled = false;
    trails.renderOrder = 1;
    this.scene.add(trails);
    this.disposables.push(trailGeo, trailMat);
    this.fatMat = new LineMaterial({ vertexColors: true, linewidth: 2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false });
    this.disposables.push(this.fatMat);

    // dust: a mote per record round its artist, plus a faint haze per family
    this.dustMat = this.buildDust();
    this.buildHaze();
    this.buildBackground();

    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hazeTex(), color: rgbColour(hexToRgb('#ffe2b0')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spark.visible = false;
    this.spark.renderOrder = 6;
    this.scene.add(this.spark);
    this.disposables.push(this.spark.material);

    // orbiting records
    this.discGeo = this.instanced(0);
    this.discPosAttr = new THREE.InstancedBufferAttribute(this.discPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.discGeo.setAttribute('iPos', this.discPosAttr);
    this.discAttrs = {
      iR: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
      iCell: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 4), 4),
      iVin: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 3), 3),
      iFl: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS * 3), 3),
      iAlpha: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
      iPat: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
      iSeed: new THREE.InstancedBufferAttribute(new Float32Array(MAX_DISCS), 1),
    };
    for (const [k, v] of Object.entries(this.discAttrs)) this.discGeo.setAttribute(k, v);
    this.discMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.shared.uTime,
        uSpin: { value: this.rm ? 0 : 1.6 },
        uAppear: { value: 0 },
        uS0: { value: this.blank },
        uS1: { value: this.blank },
        uS2: { value: this.blank },
        uS3: { value: this.blank },
        uHave: { value: new THREE.Vector4() },
      },
      vertexShader: DISC_VS,
      fragmentShader: DISC_FS,
      transparent: true,
    });
    const discs = new THREE.Mesh(this.discGeo, this.discMat);
    discs.frustumCulled = false;
    discs.renderOrder = 5;
    this.scene.add(discs);
    this.disposables.push(this.discGeo, this.discMat);

    // sharp photos and sleeve labels for whatever is big on screen
    this.hiRes = new GalaxyHiRes({ scene: this.scene, data: this.d, positions: this.pos, size: this.p.size, colour: this.p.colour, hidden: this.p.hidden, sky: this.sky, small });

    // overlay
    this.tip = document.createElement('div');
    this.tip.className = 'gx-tip';
    this.tip.hidden = true;
    this.tip.setAttribute('aria-hidden', 'true');
    o.overlay.append(this.tip);
    this.buildFamilyLabels();

    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();

    this.camera.position.copy(this.galaxyC).addScaledVector(this.overviewDir(), this.overviewDist());
    this.controls.target.copy(this.galaxyC);
    this.camera.lookAt(this.galaxyC);
    this.controls.update();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- public ------------------------------------------------------------------------

  /** Focus an artist (null for none). With `link`, the camera travels along that trail. */
  setFocus(i: number | null, { link = -1, instant = false }: { link?: number; instant?: boolean } = {}) {
    if (this.disposed) return;
    if (i == null || i < 0 || this.p.hidden[i]) {
      if (this.focus >= 0) this.clearFocus();
      return;
    }
    if (i === this.focus) return;
    const prev = this.focus;
    const target = this.P(i);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.22) {
      dir.y = 0.22;
      dir.normalize();
    }
    const path = link >= 0 && prev >= 0 && this.p.links[link] && otherEnd(this.p.links[link], prev) === i ? this.linkPath(link, prev) : null;
    this.applyFocus(i, dir);
    this.flyTo(target, this.focusDist(i), { dir, path, instant });
  }

  flyHome() {
    this.flyTo(this.galaxyC.clone(), this.overviewDist(), { dir: this.overviewDir() });
  }

  flyToFamily(k: number) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.35) {
      dir.y = 0.35;
      dir.normalize();
    }
    this.flyTo(this.famC[k].clone(), this.famSpread[k] * (this.tall() ? 5.2 : 3.1), { dir });
  }

  /** Room taken by the panel (right on wide screens, bottom on phones): the focused star centres in what is left. */
  setInsets(insets: Insets) {
    this.insets = insets;
  }

  setReducedMotion(rm: boolean) {
    this.rm = rm;
    this.discMat.uniforms.uSpin.value = rm ? 0 : 1.6;
  }

  /** Tint the sky toward a dark sleeve swatch (null for the plain ground). */
  setGround(hex: string | null) {
    const c = rgbColour(hexToRgb(hex ?? SKY));
    // keep it dark whatever the swatch
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    this.skyTarget.setHSL(hsl.h, Math.min(hsl.s, 0.3), Math.min(hsl.l, 0.06));
    if (this.rm) this.sky.copy(this.skyTarget);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    for (const c of this.cleanups) c();
    this.hiRes.dispose();
    if (this.fatLines) this.fatLines.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    for (const t of this.sheets) t?.dispose();
    this.famEls.forEach(e => e.remove());
    this.nearEls.forEach(e => e.remove());
    this.meEl?.remove();
    this.tip.remove();
    // no forceContextLoss: React may mount a new scene on the same canvas (Strict Mode), which needs the context
    this.renderer.dispose();
  }

  // ---- building -------------------------------------------------------------------------

  private P(i: number) {
    return new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  private instanced(count: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.instanceCount = count;
    this.disposables.push(quad);
    return g;
  }

  private loadTexture(url: string, done: (t: THREE.Texture) => void) {
    this.texLoader.load(url, t => {
      if (this.disposed) {
        t.dispose();
        return;
      }
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.disposables.push(t);
      done(t);
    });
  }

  private families() {
    const NF = this.d.families.length;
    const famC = Array.from({ length: NF }, () => new THREE.Vector3());
    const spread = new Array<number>(NF).fill(0);
    for (let i = 0; i < this.p.n; i++) if (!this.p.hidden[i]) famC[this.p.fam[i]].add(this.P(i));
    famC.forEach((c, k) => c.divideScalar(Math.max(1, this.p.famCount[k])));
    for (let i = 0; i < this.p.n; i++) if (!this.p.hidden[i]) spread[this.p.fam[i]] += this.P(i).distanceToSquared(famC[this.p.fam[i]]);
    const famSpread = spread.map((s, k) => Math.sqrt(s / Math.max(1, this.p.famCount[k])) * 1.25 || 80);
    return { famC, famSpread };
  }

  /** Look across the map's long axis on a wide screen, along it on a tall one. */
  private overviewDirs(): [THREE.Vector3, THREE.Vector3] {
    let xx = 0;
    let zz = 0;
    let xz = 0;
    this.famC.forEach((c, k) => {
      const dx = c.x - this.galaxyC.x;
      const dz = c.z - this.galaxyC.z;
      const w = this.p.famCount[k];
      xx += dx * dx * w;
      zz += dz * dz * w;
      xz += dx * dz * w;
    });
    const th = 0.5 * Math.atan2(2 * xz, xx - zz);
    const long = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const across = new THREE.Vector3(-long.z, 0, long.x);
    if (across.z < 0) across.negate();
    return [across.add(new THREE.Vector3(0, 0.9, 0)).normalize(), long.add(new THREE.Vector3(0, 0.95, 0)).normalize()];
  }

  private tall = () => this.W < this.H;
  private overviewDir = () => (this.tall() ? this.overviewDirTall : this.overviewDirWide);
  private overviewDist = () => (this.tall() ? 9800 : 4900);

  private linkCtrl(k: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
    const l = this.p.links[k];
    const a = this.P(l.a);
    const b = this.P(l.b);
    const c = a.clone().add(b).multiplyScalar(0.5);
    c.y += a.distanceTo(b) * 0.17;
    return [a, c, b];
  }

  private linkPath(k: number, from: number) {
    const [a, c, b] = this.linkCtrl(k);
    const rev = this.p.links[k].a !== from;
    return (t: number) => bez(a, c, b, rev ? 1 - t : t, new THREE.Vector3());
  }

  private hazeTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    this.disposables.push(t);
    return t;
  }

  private buildDust() {
    let seed = 99;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
    const P: number[] = [];
    const C: number[] = [];
    const S: number[] = [];
    const A: number[] = [];
    for (const al of this.d.albums) {
      const i = al.a.find(x => !this.p.hidden[x]);
      if (i == null) continue;
      const s = this.p.size[i] * 1.6 + 6;
      const pt = this.P(i).add(new THREE.Vector3(gauss() * s, gauss() * s * 0.6, gauss() * s));
      const k = this.p.fam[i];
      if (rand() < 0.35) pt.lerp(this.famC[k].clone().add(new THREE.Vector3(gauss(), gauss() * 0.5, gauss()).multiplyScalar(this.famSpread[k] * 0.6)), rand() * 0.5);
      P.push(pt.x, pt.y, pt.z);
      C.push(...hexToRgb(al.fl));
      S.push(2 + rand() * 2.2);
      A.push(0.55);
    }
    this.d.families.forEach((_, k) => {
      const count = Math.round(160 + this.p.famCount[k] * 1.4);
      for (let j = 0; j < count; j++) {
        const pt = this.famC[k].clone().add(new THREE.Vector3(gauss(), gauss() * 0.45, gauss()).multiplyScalar(this.famSpread[k] * 0.75));
        P.push(pt.x, pt.y, pt.z);
        C.push(...this.p.famColour[k]);
        S.push(3 + rand() * 6);
        A.push(0.16);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(A, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uFocus: this.shared.uFocus, uPR: { value: this.renderer.getPixelRatio() } },
      vertexShader: DUST_VS,
      fragmentShader: DUST_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(g, m);
    dust.frustumCulled = false;
    this.scene.add(dust);
    this.disposables.push(g, m);
    return m;
  }

  private buildHaze() {
    const tex = this.hazeTex();
    this.d.families.forEach((_, k) => {
      const mat = new THREE.SpriteMaterial({ map: tex, color: rgbColour(this.p.famColour[k]), opacity: 0.075, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat);
      s.position.copy(this.famC[k]);
      s.scale.setScalar(this.famSpread[k] * 3.4);
      this.scene.add(s);
      this.disposables.push(mat);
    });
  }

  private buildBackground() {
    const n = 2600;
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    let seed = 3;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let j = 0; j < n; j++) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const r = 12000 + rand() * 9000;
      p.set([Math.cos(t) * q * r, u * r, Math.sin(t) * q * r], j * 3);
      const b = 0.18 + rand() * rand() * 0.55;
      c.set([b, b * 0.97, b * 0.9], j * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.PointsMaterial({ size: 1.4 * this.renderer.getPixelRatio(), sizeAttenuation: false, vertexColors: true, depthWrite: false });
    this.scene.add(new THREE.Points(g, m));
    this.disposables.push(g, m);
  }

  private buildFamilyLabels() {
    this.famEls = this.d.families.map((f, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gx-fam';
      const [r, g, bl] = this.p.famColour[k];
      b.style.setProperty('--fc', `rgb(${Math.round(Math.min(1, r * 1.15) * 255)} ${Math.round(Math.min(1, g * 1.15) * 255)} ${Math.round(Math.min(1, bl * 1.15) * 255)})`);
      b.innerHTML = `<span class="gx-fam-code">${esc(f.code)}</span>${esc(f.name)}<small>${plural(this.p.famCount[k], 'artist')}</small>`;
      b.setAttribute('aria-label', `${f.name}, ${plural(this.p.famCount[k], 'artist')}: go to this part of the map`);
      b.addEventListener('click', () => {
        this.touched();
        this.o.onFamily?.(k);
        this.flyToFamily(k);
      });
      this.o.overlay.append(b);
      return b;
    });
    this.measureFamilyLabels();
  }

  private measureFamilyLabels() {
    this.famSize = this.famEls.map(e => ({ w: e.offsetWidth || 160, h: e.offsetHeight || 30 }));
  }

  // ---- focus ------------------------------------------------------------------------------

  private applyFocus(i: number, viewDir: THREE.Vector3) {
    this.focus = i;
    const dim = this.dimAttr.array as Float32Array;
    const hi = this.hiAttr.array as Float32Array;
    dim.fill(1);
    hi.fill(0);
    dim[i] = 0;
    hi[i] = 1;
    const ks = this.p.linksOf[i];
    for (const k of ks) {
      const other = otherEnd(this.p.links[k], i);
      dim[other] = 0;
      hi[other] = 0.55;
    }
    this.dimAttr.needsUpdate = this.hiAttr.needsUpdate = true;
    this.trailOn.fill(0);
    // the strongest links get bright fat lines; a busy artist's many shared credits stay thin
    const bright = new Set(labelledConnections(this.p, i, FAT_LINES));
    for (const k of ks) this.trailOn.fill(bright.has(k) ? 1 : 2, k * SEG * 2, (k + 1) * SEG * 2);
    this.trailOnAttr.needsUpdate = true;
    this.focusTarget = 1;

    if (this.fatLines) {
      this.scene.remove(this.fatLines);
      this.fatLines.geometry.dispose();
      this.fatLines = null;
    }
    if (bright.size) {
      const pp: number[] = [];
      const cc: number[] = [];
      for (const k of bright) {
        const off = k * SEG * 6;
        for (let s = 0; s < SEG * 6; s++) pp.push(this.trailPos[off + s]);
        const lc = hexToRgb(TRAIL_KINDS[this.p.kind[k]].colour);
        const fade = this.p.kind[k] === 4 ? 0.55 : 1;
        for (let s = 0; s < SEG * 2; s++) cc.push(lc[0] * fade, lc[1] * fade, lc[2] * fade);
      }
      const g = new LineSegmentsGeometry();
      g.setPositions(pp);
      g.setColors(cc);
      this.fatLines = new LineSegments2(g, this.fatMat);
      this.fatLines.renderOrder = 2;
      this.scene.add(this.fatLines);
    }
    this.fatMat.opacity = 0;
    this.buildOrbit(i, viewDir);
    this.buildNearLabels(i);
  }

  private clearFocus() {
    this.focus = -1;
    this.focusTarget = 0;
    this.orbit.artist = -1;
    this.orbit.recs = [];
    this.discGeo.instanceCount = 0;
    if (this.fatLines) {
      this.scene.remove(this.fatLines);
      this.fatLines.geometry.dispose();
      this.fatLines = null;
    }
    this.nearEls.forEach(e => e.remove());
    this.nearEls = [];
    this.meEl?.remove();
    this.meEl = null;
    (this.hiAttr.array as Float32Array).fill(0);
    this.hiAttr.needsUpdate = true;
    this.trailOn.fill(0);
    this.trailOnAttr.needsUpdate = true;
    this.setGround(null);
  }

  private focusDist(i: number) {
    const max = this.tall() ? 28 : MAX_DISCS;
    const { outer } = orbitRings(Math.min(max, this.d.artists[i].records.length), this.p.size[i]);
    const c = this.P(i);
    // frame the strongest links (shared credits only when there is nothing else)
    const ks = this.p.linksOf[i].filter(k => this.p.kind[k] < 4);
    const dists = (ks.length ? ks : this.p.linksOf[i]).map(k => this.P(otherEnd(this.p.links[k], i)).distanceTo(c));
    return focusDistance(outer, dists, this.tall());
  }

  private needSheet(s: number) {
    if (s > 3 || this.sheets[s]) return;
    this.sheets[s] = this.blank;
    this.loadTexture(sleeveSheetUrl(s), t => {
      this.sheets[s] = t;
      this.discMat.uniforms[`uS${s}`].value = t;
      (this.discMat.uniforms.uHave.value as THREE.Vector4).setComponent(s, 1);
    });
  }

  private buildOrbit(i: number, viewDir: THREE.Vector3) {
    const albums = this.d.albums;
    const recs = [...this.d.artists[i].records].sort((x, y) => (albums[x].y ?? 9999) - (albums[y].y ?? 9999)).slice(0, this.tall() ? 28 : MAX_DISCS);
    const spec = orbitRings(recs.length, this.p.size[i]);
    const vd = viewDir.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(vd);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    const up = vd.clone().cross(right).normalize();
    Object.assign(this.orbit, {
      artist: i,
      recs,
      rings: spec.rings,
      disc: spec.disc,
      outer: spec.outer,
      centre: this.P(i),
      U: right,
      Ws: spec.rings.map((_, k) => {
        const tilt = THREE.MathUtils.degToRad(60 + k * 4);
        const nrm = vd.clone().multiplyScalar(Math.cos(tilt)).add(up.clone().multiplyScalar(Math.sin(tilt))).normalize();
        return nrm.cross(right).normalize();
      }),
    });
    const at = this.discAttrs;
    recs.forEach((ri, j) => {
      const al = albums[ri];
      const c = sleeveCell(this.d, ri);
      this.needSheet(c.sheet);
      at.iR.array[j] = spec.disc;
      (at.iCell.array as Float32Array).set([c.u, c.v, c.w, c.sheet], j * 4);
      const paint = discPaint(vinylLook(al.vc));
      const fl = hexToRgb(al.fl);
      (at.iVin.array as Float32Array).set(paint.rgb, j * 3);
      (at.iFl.array as Float32Array).set(paint.accent ?? fl, j * 3);
      at.iAlpha.array[j] = paint.alpha;
      at.iPat.array[j] = paint.pattern;
      at.iSeed.array[j] = (j * 0.618) % 1;
    });
    for (const a of Object.values(at)) a.needsUpdate = true;
    this.discGeo.instanceCount = recs.length;
    this.discMat.uniforms.uAppear.value = 0;
    this.updateOrbit(0);
  }

  private updateOrbit(time: number) {
    const o = this.orbit;
    if (o.artist < 0) return;
    o.rings.forEach((ring, k) => {
      const w = o.Ws[k];
      const speed = this.rm ? 0 : (0.16 / (1 + k * 0.4)) * (k % 2 ? -1 : 1);
      for (let q = 0; q < ring.m; q++) {
        const j = ring.start + q;
        const ang = (q / ring.m) * Math.PI * 2 + time * speed + k * 0.4;
        const ca = Math.cos(ang) * ring.R;
        const sa = Math.sin(ang) * ring.R;
        this.discPos[j * 3] = o.centre.x + o.U.x * ca + w.x * sa;
        this.discPos[j * 3 + 1] = o.centre.y + o.U.y * ca + w.y * sa;
        this.discPos[j * 3 + 2] = o.centre.z + o.U.z * ca + w.z * sa;
      }
    });
    this.discPosAttr.needsUpdate = true;
  }

  private buildNearLabels(i: number) {
    this.nearEls.forEach(e => e.remove());
    this.meEl?.remove();
    this.nearEls = labelledConnections(this.p, i, this.tall() ? 10 : NEAR_LABELS).map(k => {
      const link = this.p.links[k];
      const other = otherEnd(link, i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gx-near';
      b.dataset.i = String(other);
      b.style.setProperty('--lc', TRAIL_KINDS[this.p.kind[k]].colour);
      b.innerHTML = `<span class="gx-arr" aria-hidden="true">→</span><span>${esc(this.d.artists[other].name)}</span>`;
      const why = reasonLines(this.d, link.why, i, other, 1)[0] ?? '';
      b.title = why;
      b.setAttribute('aria-label', `Go to ${this.d.artists[other].name}${why ? `: ${why}` : ''}`);
      b.addEventListener('click', () => {
        this.touched();
        this.o.onSelect(other, k);
      });
      this.o.overlay.append(b);
      return b;
    });
    this.meEl = document.createElement('span');
    this.meEl.className = 'gx-me';
    this.meEl.setAttribute('aria-hidden', 'true');
    this.meEl.textContent = this.d.artists[i].name;
    this.o.overlay.append(this.meEl);
  }

  // ---- flights ------------------------------------------------------------------------

  private flyTo(target: THREE.Vector3, dist: number, { dir = null, path = null, instant = false }: { dir?: THREE.Vector3 | null; path?: ((t: number) => THREE.Vector3) | null; instant?: boolean }) {
    const t0 = this.controls.target.clone();
    const off = this.camera.position.clone().sub(t0);
    const d0 = Math.max(1, off.length());
    const dir0 = off.normalize();
    const dir1 = (dir ?? dir0).clone().normalize();
    const travel = t0.distanceTo(target);
    if (this.rm || instant) {
      this.controls.target.copy(target);
      this.camera.position.copy(target).addScaledVector(dir1, dist);
      this.camera.lookAt(target);
      this.controls.update();
      this.flight = null;
      this.discMat.uniforms.uAppear.value = 1;
      return;
    }
    const duration = THREE.MathUtils.clamp(900 + travel * 0.75, 1100, 3400);
    this.flight = { t0, target: target.clone(), d0, d1: dist, dir0, dir1, travel, path, start: performance.now(), duration };
    this.controls.enabled = false;
  }

  private stepFlight(now: number) {
    const f = this.flight;
    if (!f) return;
    const k = Math.min(1, (now - f.start) / f.duration);
    const e = ease(k);
    const tgt = f.path ? f.path(e) : f.t0.clone().lerp(f.target, e);
    const lift = Math.min(1.3, f.travel / Math.max(80, f.d0 + f.d1));
    const dist = Math.exp(THREE.MathUtils.lerp(Math.log(f.d0), Math.log(f.d1), e)) * (1 + lift * Math.sin(Math.PI * e));
    const dir = f.dir0.clone().lerp(f.dir1, e).normalize();
    this.camera.position.copy(tgt).addScaledVector(dir, dist);
    this.camera.lookAt(tgt);
    this.controls.target.copy(tgt);
    this.spark.visible = !!f.path && k < 1;
    if (this.spark.visible) {
      this.spark.position.copy(tgt);
      this.spark.scale.setScalar(dist * 0.05);
    }
    if (k >= 1) this.endFlight();
  }

  private endFlight() {
    this.flight = null;
    this.spark.visible = false;
    this.controls.enabled = true;
    this.controls.update();
  }

  // ---- input -----------------------------------------------------------------------------

  private touched() {
    this.lastInput = performance.now();
    this.controls.autoRotate = false;
    this.o.onInteract?.();
  }

  private bindInput() {
    const c = this.o.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    on('pointerdown', e => {
      this.touched();
      const { x, y } = local(e);
      this.down = { x, y, t: performance.now() };
      if (this.flight) this.endFlight();
      this.hideTip();
    });
    on('pointermove', e => {
      this.lastInput = performance.now();
      if (e.pointerType !== 'mouse' || (e.buttons && this.down)) return;
      this.hoverReq = local(e);
    });
    on('pointerleave', () => {
      this.hoverReq = null;
      this.hideTip();
      c.style.cursor = '';
    });
    on('pointerup', e => {
      if (!this.down) return;
      const { x, y } = local(e);
      const moved = Math.hypot(x - this.down.x, y - this.down.y);
      const quick = performance.now() - this.down.t < 600;
      this.down = null;
      if (moved > 6 || !quick) return;
      const h = this.pickAt(x, y);
      if (!h) return;
      if (h.kind === 'disc') this.o.onOpenAlbum(this.orbit.recs[h.j]);
      else if (h.kind === 'star') {
        if (h.i !== this.focus) this.o.onSelect(h.i, this.focus >= 0 ? this.p.linksOf[this.focus].find(k => otherEnd(this.p.links[k], this.focus) === h.i) ?? -1 : -1);
      } else this.o.onSelect(otherEnd(this.p.links[h.k], this.focus), h.k);
    });
    on('wheel', () => this.touched(), { passive: true });
  }

  private hideTip() {
    this.tip.hidden = true;
  }

  private showTip(x: number, y: number, html: string) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    const tx = Math.min(this.W - w - 8, x + 14);
    const ty = y + 18 + h > this.H - 16 ? y - h - 12 : y + 18;
    this.tip.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  private project(v: THREE.Vector3) {
    const p = v.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const z = -p.z;
    if (z <= 1) return null;
    p.applyMatrix4(this.camera.projectionMatrix);
    return { x: (p.x * 0.5 + 0.5) * this.W, y: (-p.y * 0.5 + 0.5) * this.H, z };
  }

  /**
   * Stars nearer the camera than the focused artist that cover it, or its
   * orbiting records, shrink out of the way as the focus fades in, so the
   * focus is never hidden (or its hover taken) by a dimmed star in front.
   */
  private updateClear(f: number) {
    const clear = this.clearAttr.array as Float32Array;
    const i0 = this.focus;
    if (i0 < 0 || f < 0.001) {
      if (this.clearing) {
        clear.fill(1);
        this.clearAttr.needsUpdate = true;
        this.clearing = false;
      }
      return;
    }
    this.clearing = true;
    const fp = this.project(this.P(i0));
    if (!fp) return;
    const o = this.orbit;
    const zone = this.pxRadius(Math.max(this.p.size[i0] * 1.15, o.artist === i0 ? o.outer + o.disc : 0), fp.z);
    const v = new THREE.Vector3();
    for (let i = 0; i < this.p.n; i++) {
      let c = 1;
      if (i !== i0 && !this.p.hidden[i]) {
        v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(this.camera.matrixWorldInverse);
        const z = -v.z;
        if (z > 1 && z < fp.z) {
          v.applyMatrix4(this.camera.projectionMatrix);
          const r = this.pxRadius(this.p.size[i], z);
          const d = Math.hypot((v.x * 0.5 + 0.5) * this.W - fp.x, (-v.y * 0.5 + 0.5) * this.H - fp.y);
          // 0 with its centre inside the zone, 1 once its edge is clear of it
          const t = Math.min(1, Math.max(0, (d - zone) / Math.max(r, 1)));
          c = 1 - f * (1 - t * t * (3 - 2 * t));
        }
      }
      clear[i] = c;
    }
    this.clearAttr.needsUpdate = true;
  }
  private clearing = false;

  private pxRadius(worldR: number, z: number) {
    return (worldR * this.camera.projectionMatrix.elements[5] * this.H * 0.5) / z;
  }

  private pickStar(mx: number, my: number) {
    let best = -1;
    let bestZ = Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.p.n; i++) {
      const c = (this.clearAttr.array as Float32Array)[i];
      if (this.p.hidden[i] || c < 0.3) continue;
      v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]).applyMatrix4(this.camera.matrixWorldInverse);
      const z = -v.z;
      if (z <= 1) continue;
      v.applyMatrix4(this.camera.projectionMatrix);
      const dx = (v.x * 0.5 + 0.5) * this.W - mx;
      const dy = (-v.y * 0.5 + 0.5) * this.H - my;
      const r = Math.max(this.pxRadius(this.p.size[i] * c, z), MIN_PX) + 5;
      if (dx * dx + dy * dy < r * r && z < bestZ) {
        best = i;
        bestZ = z;
      }
    }
    return best;
  }

  private discScreen() {
    const out: { x: number; y: number; r: number; z: number }[] = [];
    const ap = this.discMat.uniforms.uAppear.value as number;
    for (let j = 0; j < this.orbit.recs.length; j++) {
      const s = this.project(new THREE.Vector3(this.discPos[j * 3], this.discPos[j * 3 + 1], this.discPos[j * 3 + 2]));
      if (s) out.push({ ...s, r: this.pxRadius(this.orbit.disc * ap, s.z) });
      else out.push({ x: -1e4, y: -1e4, r: 0, z: Infinity });
    }
    return out;
  }

  private pickDisc(mx: number, my: number) {
    let best = -1;
    let bestZ = Infinity;
    this.discScreen().forEach((s, j) => {
      const dx = s.x - mx;
      const dy = s.y - my;
      if (dx * dx + dy * dy < (s.r + 2) ** 2 && s.z < bestZ) {
        best = j;
        bestZ = s.z;
      }
    });
    return best;
  }

  private pickTrail(mx: number, my: number) {
    if (this.focus < 0) return -1;
    let best = -1;
    let bestD = 7;
    const pt = new THREE.Vector3();
    for (const k of this.p.linksOf[this.focus]) {
      const [a, c, b] = this.linkCtrl(k);
      let prev: { x: number; y: number } | null = null;
      for (let s = 0; s <= SEG; s++) {
        const sc = this.project(bez(a, c, b, s / SEG, pt));
        if (sc && prev) {
          const vx = sc.x - prev.x;
          const vy = sc.y - prev.y;
          const l2 = vx * vx + vy * vy || 1;
          const t = THREE.MathUtils.clamp(((mx - prev.x) * vx + (my - prev.y) * vy) / l2, 0, 1);
          const dd = Math.hypot(prev.x + vx * t - mx, prev.y + vy * t - my);
          if (dd < bestD) {
            bestD = dd;
            best = k;
          }
        }
        prev = sc;
      }
    }
    return best;
  }

  private pickAt(x: number, y: number): Hit | null {
    const j = this.pickDisc(x, y);
    if (j >= 0) return { kind: 'disc', j };
    const i = this.pickStar(x, y);
    if (i >= 0) return { kind: 'star', i };
    const k = this.pickTrail(x, y);
    if (k >= 0) return { kind: 'trail', k };
    return null;
  }

  private describeHit(h: Hit) {
    const d = this.d;
    if (h.kind === 'disc') {
      const al = d.albums[this.orbit.recs[h.j]];
      const bits = [al.y ? String(al.y) : null, al.vc ? `${al.vc} vinyl` : null].filter(Boolean) as string[];
      return `<b>${esc(al.t)}</b><span>${bits.map(esc).join(' · ')}</span>`;
    }
    if (h.kind === 'star') {
      const a = d.artists[h.i];
      const n = this.p.linksOf[h.i].length;
      return `<b>${esc(a.name)}</b><span>${plural(a.records.length, 'record')} · ${esc(d.families[this.p.fam[h.i]].name)}${n ? ` · ${plural(n, 'connection')}` : ''}</span>`;
    }
    const other = otherEnd(this.p.links[h.k], this.focus);
    const why = reasonLines(d, this.p.links[h.k].why, this.focus, other, 1)[0] ?? '';
    return `<b>To ${esc(d.artists[other].name)}</b><span>${esc(why)}</span>`;
  }

  // ---- frame ------------------------------------------------------------------------------

  private resize() {
    const host = this.o.canvas.parentElement ?? this.o.canvas;
    this.W = Math.max(1, host.clientWidth);
    this.H = Math.max(1, host.clientHeight);
    this.renderer.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    this.shared.uRes.value.set(this.W, this.H);
    this.fatMat.resolution.set(this.W, this.H);
    this.dustMat.uniforms.uScale.value = this.camera.projectionMatrix.elements[5] * this.H * 0.5;
    this.offX = this.offY = -1;
    this.measureFamilyLabels();
  }

  private curX = 0;
  private curY = 0;
  private stepOffset(dt: number) {
    const tx = this.focus >= 0 ? this.insets.right / 2 : 0;
    const ty = this.focus >= 0 ? this.insets.bottom / 2 : 0;
    const k = this.rm ? 1 : Math.min(1, dt * 5);
    const nx = this.curX + (tx - this.curX) * k;
    const ny = this.curY + (ty - this.curY) * k;
    if (Math.abs(nx - this.offX) > 0.05 || Math.abs(ny - this.offY) > 0.05) {
      this.curX = this.offX = nx;
      this.curY = this.offY = ny;
      if (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.1) this.camera.clearViewOffset();
      else this.camera.setViewOffset(this.W, this.H, nx, ny, this.W, this.H);
    }
  }

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    const lerp = (rate: number) => Math.min(1, raw * rate);
    const now = performance.now();
    if (!this.rm) this.time += dt;
    this.shared.uTime.value = this.time;
    const f = this.shared.uFocus;
    f.value = this.rm ? this.focusTarget : f.value + (this.focusTarget - f.value) * lerp(4);
    this.sky.lerp(this.skyTarget, this.rm ? 1 : lerp(1.2));
    this.renderer.setClearColor(this.sky, 1);
    if (this.focus >= 0) {
      this.fatMat.opacity += (0.95 - this.fatMat.opacity) * lerp(3);
      const ap = this.discMat.uniforms.uAppear;
      if (!this.flight || (now - this.flight.start) / this.flight.duration > 0.65) ap.value += (1 - ap.value) * lerp(3.5);
      if (this.rm && !this.flight) ap.value = 1;
    }
    this.stepFlight(now);
    this.controls.autoRotate = !this.rm && !this.flight && now - this.lastInput > 7000;
    if (!this.flight) this.controls.update();
    this.stepOffset(raw);
    this.camera.updateMatrixWorld();
    this.updateOrbit(this.time);
    this.updateClear(f.value);
    const dim = this.dimAttr.array as Float32Array;
    const clear = this.clearAttr.array as Float32Array;
    const spin = this.discMat.uniforms.uSpin.value as number;
    this.hiRes.update(
      { camera: this.camera, W: this.W, H: this.H, dim: i => dim[i] * f.value, clear: i => clear[i], dt: raw, reducedMotion: this.rm },
      this.orbit.artist >= 0
        ? {
            albums: this.orbit.recs,
            positions: this.discPos,
            radius: this.orbit.disc * (this.discMat.uniforms.uAppear.value as number),
            rotation: j => -this.time * spin + ((j * 0.618) % 1) * 6.2831,
          }
        : null,
    );
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    if (this.hoverReq) {
      const { x, y } = this.hoverReq;
      this.hoverReq = null;
      const h = this.flight ? null : this.pickAt(x, y);
      this.o.canvas.style.cursor = h ? 'pointer' : '';
      if (h) this.showTip(x, y, this.describeHit(h));
      else this.hideTip();
    }
  };

  private place(el: HTMLElement, s: { x: number; y: number } | null, dy = 0) {
    if (!s || s.x < -200 || s.x > this.W + 200 || s.y < -100 || s.y > this.H + 100) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + dy).toFixed(1)}px) translate(-50%, -50%)`;
  }

  private updateLabels() {
    const cam = this.camera.position;
    const focused = this.focus >= 0;

    // family names: fade when close, and never on top of each other (bigger families win)
    const shots = this.famEls.map((_, k) => this.project(this.famLabelAt[k]));
    const order = this.famEls.map((_, k) => k).sort((a, b) => this.p.famCount[b] - this.p.famCount[a]);
    const clear = clearOfEachOther(order.map(k => (shots[k] ? { x: shots[k]!.x, y: shots[k]!.y, ...this.famSize[k] } : { x: -1e5 - k * 1e3, y: -1e5, w: 0, h: 0 })));
    order.forEach((k, n) => {
      const el = this.famEls[k];
      const dist = cam.distanceTo(this.famC[k]);
      let o = THREE.MathUtils.clamp((dist - this.famSpread[k] * 0.9) / (this.famSpread[k] * 1.2), 0, 1);
      if (focused) o *= 0.3;
      if (!clear[n]) o = 0;
      el.style.opacity = o.toFixed(2);
      el.style.pointerEvents = o > 0.2 ? 'auto' : 'none';
      el.tabIndex = o > 0.2 ? 0 : -1;
      this.place(el, shots[k]);
    });
    if (!focused) return;

    // the room left for labels, clear of the panel
    const box: Box = { l: 12, t: 64, r: this.W - 12 - this.insets.right, b: this.H - 16 - this.insets.bottom };
    // a title block across the whole width (phones): the top edge is its bottom
    if (this.insets.hudRight >= box.r - 40) box.t = Math.max(box.t, this.insets.hudBottom);
    const centre = this.project(this.orbit.centre);
    // the record rings on screen: linked artists' names stay off them
    const ds = this.discScreen().filter(s => s.z < Infinity);
    const ring = centre
      ? ds.reduce(
          (b, s) => ({ l: Math.min(b.l, s.x - s.r), r: Math.max(b.r, s.x + s.r), t: Math.min(b.t, s.y - s.r), b: Math.max(b.b, s.y + s.r) }),
          { l: centre.x, r: centre.x, t: centre.y, b: centre.y },
        )
      : null;
    if (this.meEl) {
      const r = centre ? Math.max(this.pxRadius(this.p.size[this.focus], centre.z), MIN_PX) : 0;
      const below = ring && centre ? Math.max(r + 14, ring.b - centre.y + 12) : r + 14;
      this.place(this.meEl, centre, below);
    }
    const fv = this.orbit.centre.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const fc = centre ?? { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
    const pinned: (Pinned & { el: HTMLElement })[] = [];
    for (const el of this.nearEls) {
      const i = Number(el.dataset.i);
      const s = this.project(this.P(i));
      if (s && s.x > box.l && s.x < box.r && s.y > box.t && s.y < box.b) {
        el.classList.remove('is-edge');
        const r = Math.max(this.pxRadius(this.p.size[i], s.z), MIN_PX);
        const y = s.y + r + 11;
        const overRing = ring && s.x > ring.l - 20 && s.x < ring.r + 20 && y > ring.t - 8 && y < ring.b + 8;
        const underHud = s.x - el.offsetWidth / 2 < this.insets.hudRight && y - 10 < this.insets.hudBottom;
        if (overRing || underHud) el.style.visibility = 'hidden';
        else this.place(el, s, r + 11);
        continue;
      }
      // off screen: pin to the edge, pointing the way
      const cv = this.P(i).applyMatrix4(this.camera.matrixWorldInverse);
      const e = edgePoint(fc.x, fc.y, cv.x - fv.x, -(cv.y - fv.y), box);
      el.classList.add('is-edge');
      (el.firstChild as HTMLElement).style.transform = `rotate(${Math.atan2(-(cv.y - fv.y), cv.x - fv.x).toFixed(3)}rad)`;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // keep clear of the title and search: slide down the left edge, or along the top
      if (e.x - w / 2 < this.insets.hudRight && e.y - h / 2 < this.insets.hudBottom) {
        if (e.side === 'T' && this.insets.hudRight + w / 2 + 8 < box.r) e.x = this.insets.hudRight + w / 2 + 8;
        else {
          e.y = this.insets.hudBottom + h / 2 + 6;
          e.side = 'L';
        }
      }
      pinned.push({ el, x: e.x, y: e.y, w, h, side: e.side });
    }
    spreadPinned(pinned, box);
    for (const e of pinned) {
      if (e.hidden) e.el.style.visibility = 'hidden';
      else this.place(e.el, e);
    }
  }
}

function bez(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}
