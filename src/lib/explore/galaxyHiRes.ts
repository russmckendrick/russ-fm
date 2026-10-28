/**
 * Sharp close-ups for The Galaxy. The instanced pass draws every star from
 * the 64px avatar atlas; when a star is big on screen (the focused artist, its
 * neighbours, anything flown close to) this draws its `medium` photo over it
 * from a small pool of billboards, fading in once loaded. The focused artist's
 * orbiting discs get the same for their sleeve labels.
 *
 * Textures load through one queue (a few at a time, biggest on screen first)
 * and live in LRU caches that dispose what is no longer drawn. A failed load
 * (no CORS on this origin, a missing file) just leaves the atlas cell showing.
 */
import * as THREE from 'three';
import { artistPhotoUrl, sleeveUrl } from './data';
import { closeUps, cropWindow } from './galaxyLayout';
import type { ExploreData } from './types';

const HI_VS = /* glsl */ `
uniform vec3 uCentre; uniform float uRadius; uniform float uLift;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(uCentre, 1.0);
  vec2 q = position.xy * 2.0;
  mv.xy += q * uRadius;
  mv.z += uLift;
  vUv = q;
  gl_Position = projectionMatrix * mv;
}`;

/** Same look as the atlas star (ring in the glow colour, dimmed toward the sky), from the photo's avatar square. */
const STAR_FS = /* glsl */ `
uniform sampler2D uTex; uniform vec4 uWin; uniform vec3 uCol; uniform vec3 uBg; uniform float uDim; uniform float uFade;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  vec2 t = vUv * 0.5 + 0.5; t.y = 1.0 - t.y;
  vec3 c = texture2D(uTex, uWin.xy + t * uWin.zw).rgb;
  c = mix(c, uCol, smoothstep(0.84, 0.93, r) * 0.9);
  c = mix(c, uBg, uDim * 0.82);
  gl_FragColor = vec4(c, uFade);
}`;

/** The centre label of an orbiting disc (radius = the disc's label), turning with it. */
const LABEL_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uRot; uniform float uFade;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0 || r < 0.1125) discard;
  float cs = cos(uRot), sn = sin(uRot);
  vec2 q = mat2(cs, -sn, sn, cs) * vUv;
  vec2 t = clamp(q * 0.47 + 0.5, 0.0, 1.0); t.y = 1.0 - t.y;
  vec3 c = texture2D(uTex, t).rgb * (1.0 - 0.3 * smoothstep(0.925, 1.0, r));
  gl_FragColor = vec4(c, uFade);
}`;

interface Entry {
  tex: THREE.Texture | null;
  state: 'loading' | 'ready' | 'failed';
  used: number;
}

/** Loads a few textures at a time, the most wanted first. */
class TextureQueue {
  private loader = new THREE.TextureLoader();
  private active = 0;
  private waiting = new Map<string, { prio: number; done: (t: THREE.Texture | null) => void }>();
  private disposed = false;
  private max: number;
  constructor(max: number) {
    this.max = max;
    this.loader.setCrossOrigin('anonymous');
  }

  request(url: string, prio: number, done: (t: THREE.Texture | null) => void) {
    const w = this.waiting.get(url);
    if (w) w.prio = Math.max(w.prio, prio);
    else this.waiting.set(url, { prio, done });
    this.pump();
  }

  /** Raise or drop a waiting request's priority (not started yet). */
  bump(url: string, prio: number) {
    const w = this.waiting.get(url);
    if (w) w.prio = prio;
  }

  private pump() {
    while (!this.disposed && this.active < this.max && this.waiting.size) {
      let best: string | null = null;
      let bestPrio = -Infinity;
      for (const [url, w] of this.waiting) {
        if (w.prio > bestPrio) {
          best = url;
          bestPrio = w.prio;
        }
      }
      const url = best!;
      const { done } = this.waiting.get(url)!;
      this.waiting.delete(url);
      this.active++;
      const finish = (t: THREE.Texture | null) => {
        this.active--;
        if (this.disposed) t?.dispose();
        else done(t);
        this.pump();
      };
      this.loader.load(
        url,
        t => {
          t.flipY = false;
          t.colorSpace = THREE.NoColorSpace;
          t.anisotropy = 4;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.needsUpdate = true;
          finish(t);
        },
        undefined,
        () => finish(null),
      );
    }
  }

  dispose() {
    this.disposed = true;
    this.waiting.clear();
  }
}

/** Textures keyed by id, least recently used disposed past `cap` (never one drawn this frame). */
class TextureCache {
  private map = new Map<number, Entry>();
  private cap: number;
  private queue: TextureQueue;
  constructor(cap: number, queue: TextureQueue) {
    this.cap = cap;
    this.queue = queue;
  }

  get(id: number, url: string, prio: number, frame: number): Entry {
    let e = this.map.get(id);
    if (!e) {
      const entry: Entry = { tex: null, state: 'loading', used: frame };
      e = entry;
      this.map.set(id, entry);
      this.queue.request(url, prio, t => {
        if (!this.map.has(id)) {
          t?.dispose();
          return;
        }
        entry.tex = t;
        entry.state = t ? 'ready' : 'failed';
      });
    } else if (e.state === 'loading') this.queue.bump(url, prio);
    e.used = frame;
    return e;
  }

  /** Drop the least recently used ready textures beyond the cap. */
  trim(frame: number) {
    if (this.map.size <= this.cap) return;
    const old = [...this.map.entries()].filter(([, e]) => e.state !== 'loading' && e.used < frame).sort((a, b) => a[1].used - b[1].used);
    for (const [id, e] of old.slice(0, this.map.size - this.cap)) {
      e.tex?.dispose();
      this.map.delete(id);
    }
  }

  dispose() {
    for (const e of this.map.values()) e.tex?.dispose();
    this.map.clear();
  }
}

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** Star or album shown, -1 when free. */
  id: number;
  fade: number;
}

export interface HiResOptions {
  scene: THREE.Scene;
  data: ExploreData;
  positions: Float32Array;
  size: Float32Array;
  colour: Float32Array;
  hidden: Uint8Array;
  sky: THREE.Color;
  /** Smaller pools and a higher bar on phones. */
  small: boolean;
}

export interface StarFrame {
  camera: THREE.PerspectiveCamera;
  W: number;
  H: number;
  /** Per-star dim (0 lit, 1 dimmed) times the focus fade. */
  dim: (i: number) => number;
  /** Seconds since the last frame, for the fade in. */
  dt: number;
  reducedMotion: boolean;
}

export interface DiscFrame {
  /** Album index per disc, positions (x, y, z per disc), disc radius in world units and turn per disc. */
  albums: number[];
  positions: Float32Array;
  radius: number;
  rotation: (j: number) => number;
}

export class GalaxyHiRes {
  private o: HiResOptions;
  private queue = new TextureQueue(6);
  private photos: TextureCache;
  private sleeves: TextureCache;
  private stars: Slot[] = [];
  private labels: Slot[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);
  private frame = 0;
  private picks: number[] = [];
  private px: Float32Array;
  private threshold: number;
  private v = new THREE.Vector3();

  constructor(o: HiResOptions) {
    this.o = o;
    const pool = o.small ? 24 : 48;
    this.threshold = o.small ? 30 : 28;
    this.photos = new TextureCache(o.small ? 40 : 80, this.queue);
    this.sleeves = new TextureCache(o.small ? 36 : 64, this.queue);
    this.px = new Float32Array(o.hidden.length);
    for (let k = 0; k < pool; k++) {
      this.stars.push(
        this.slot(STAR_FS, 3.5, {
          uWin: { value: new THREE.Vector4(0, 0, 1, 1) },
          uCol: { value: new THREE.Color() },
          uBg: { value: o.sky },
          uDim: { value: 0 },
        }),
      );
    }
    for (let k = 0; k < (o.small ? 28 : 48); k++) this.labels.push(this.slot(LABEL_FS, 5.5, { uRot: { value: 0 } }));
  }

  private slot(fragmentShader: string, renderOrder: number, extra: Record<string, THREE.IUniform>): Slot {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCentre: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uLift: { value: 0.05 }, uTex: { value: null }, uFade: { value: 0 }, ...extra },
      vertexShader: HI_VS,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = renderOrder;
    this.o.scene.add(mesh);
    return { mesh, mat, id: -1, fade: 0 };
  }

  /** Call once a frame, after the camera moves and before rendering. */
  update(f: StarFrame, discs: DiscFrame | null) {
    this.frame++;
    const { camera, W, H } = f;
    const proj = camera.projectionMatrix.elements[5] * H * 0.5;
    const fadeStep = f.reducedMotion ? 1 : Math.min(1, f.dt * 4);

    // which stars are big enough: re-picked every few frames
    if (this.frame % 4 === 1) {
      const { positions: P, size, hidden } = this.o;
      const v = this.v;
      for (let i = 0; i < this.px.length; i++) {
        this.px[i] = 0;
        if (hidden[i]) continue;
        v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(camera.matrixWorldInverse);
        const z = -v.z;
        if (z <= 1) continue;
        const r = (size[i] * proj) / z;
        if (r < this.threshold) continue;
        v.applyMatrix4(camera.projectionMatrix);
        const sx = (v.x * 0.5 + 0.5) * W;
        const sy = (-v.y * 0.5 + 0.5) * H;
        if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
        this.px[i] = r;
      }
      this.picks = closeUps(this.px, this.threshold, this.stars.length);
    }

    // stars: keep slots on stars still picked, give free slots to new ones once their photo is in
    const want = new Set(this.picks);
    for (const s of this.stars) if (s.id >= 0 && !want.has(s.id)) this.free(s);
    const shown = new Set(this.stars.filter(s => s.id >= 0).map(s => s.id));
    for (const i of this.picks) {
      const a = this.o.data.artists[i];
      const e = this.photos.get(i, artistPhotoUrl(a, 'medium'), this.px[i], this.frame);
      if (e.state !== 'ready' || shown.has(i)) continue;
      const s = this.stars.find(x => x.id < 0);
      if (!s) break;
      const img = e.tex!.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img?.height ? img.width / img.height : 1;
      s.id = i;
      s.fade = 0;
      s.mat.uniforms.uTex.value = e.tex;
      (s.mat.uniforms.uWin.value as THREE.Vector4).set(...cropWindow(a.crop, aspect));
      const c = this.o.colour;
      (s.mat.uniforms.uCol.value as THREE.Color).setRGB(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
      (s.mat.uniforms.uCentre.value as THREE.Vector3).set(this.o.positions[i * 3], this.o.positions[i * 3 + 1], this.o.positions[i * 3 + 2]);
      s.mat.uniforms.uRadius.value = this.o.size[i];
      s.mat.uniforms.uLift.value = 0.02 + this.o.size[i] * 0.01;
      s.mesh.visible = true;
    }
    for (const s of this.stars) {
      if (s.id < 0) continue;
      s.fade += (1 - s.fade) * fadeStep;
      s.mat.uniforms.uFade.value = s.fade;
      s.mat.uniforms.uDim.value = f.dim(s.id);
    }

    // disc labels for the focused artist's records
    const albums = discs?.albums ?? [];
    for (let j = 0; j < this.labels.length; j++) {
      const s = this.labels[j];
      const album = j < albums.length ? albums[j] : -1;
      if (album < 0 || !discs) {
        if (s.id >= 0) this.free(s);
        continue;
      }
      if (s.id !== album) {
        this.free(s);
        s.id = album;
      }
      const P = discs.positions;
      const centre = s.mat.uniforms.uCentre.value as THREE.Vector3;
      centre.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
      const radius = discs.radius * 0.4;
      const z = -this.v.copy(centre).applyMatrix4(camera.matrixWorldInverse).z;
      const labelPx = z > 1 ? (radius * proj) / z : 0;
      // too small on screen for the atlas cell to look soft: leave it be
      if (labelPx < 10 && !s.mesh.visible) continue;
      const e = this.sleeves.get(album, sleeveUrl(this.o.data.albums[album], 'medium'), 1000 + labelPx, this.frame);
      if (e.state !== 'ready') continue;
      s.mat.uniforms.uTex.value = e.tex;
      s.mat.uniforms.uRadius.value = radius;
      s.mat.uniforms.uLift.value = 0.02 + radius * 0.01;
      s.mat.uniforms.uRot.value = discs.rotation(j);
      s.fade += (1 - s.fade) * fadeStep;
      s.mat.uniforms.uFade.value = s.fade;
      s.mesh.visible = radius > 0.01;
    }

    this.photos.trim(this.frame);
    this.sleeves.trim(this.frame);
  }

  private free(s: Slot) {
    s.id = -1;
    s.fade = 0;
    s.mesh.visible = false;
    s.mat.uniforms.uTex.value = null;
  }

  dispose() {
    this.queue.dispose();
    for (const s of [...this.stars, ...this.labels]) {
      this.o.scene.remove(s.mesh);
      s.mat.dispose();
    }
    this.geo.dispose();
    this.photos.dispose();
    this.sleeves.dispose();
  }
}
