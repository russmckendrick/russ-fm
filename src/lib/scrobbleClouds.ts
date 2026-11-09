import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The album room's scrobble clouds (src/components/album/ScrobbleSky.tsx): each
 * track lifts off the record as a small lit cumulus with its name on it, turns
 * as it drifts up, takes a tick when it's counted, and evaporates puff by puff.
 * A bigger cloud carries the result at the end. Loaded lazily: it pulls in three.
 *
 * World units are the canvas's CSS pixels: a perspective camera is placed so
 * the z = 0 plane maps 1:1 onto the canvas, origin at its centre, y up.
 */

export interface CloudLabel {
  title: string;
  /** Small mono text before the title (the track's position). */
  kicker?: string;
  /** A mono second line under the title (the result cloud's "to Last.fm"). */
  sub?: string;
  /** Starts with the tick showing (the result cloud). */
  ticked?: boolean;
}

export interface CloudHandle {
  /** Fill the tick: the track has been counted. */
  tick(): void;
}

export interface CloudSky {
  /** Size the canvas: its CSS box. */
  resize(width: number, height: number): void;
  /** Where clouds lift off (the record), in the canvas's CSS px. */
  setOrigin(x: number, y: number): void;
  /** Clouds are gone before they reach this line (the bottom of the header), in CSS px from the top. */
  setCeiling(y: number): void;
  /** The room's colour, which lights the clouds from the upper right. */
  setTint(css: string): void;
  /** A track cloud. */
  lift(label: CloudLabel): CloudHandle;
  /** The result cloud: bigger, slower, hangs before it goes. */
  confirm(label: CloudLabel): void;
  /** Hurry every cloud away (the scrobble failed or the page moved on). */
  evaporate(): void;
  dispose(): void;
}

/** How long a track cloud takes to rise and go, and the result cloud. */
export const CLOUD_DRIFT_MS = 6000;
const CONFIRM_DRIFT_MS = 7500;
/** Evaporating early (evaporate()) takes this long. */
const HURRY_MS = 900;
const FOV = 28;
const INK = '#2a1214';
const LASTFM_RED = '#d51007';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2);
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** A unit sphere with a few octaves of lumps, so a puff isn't a ball. */
function lumpySphere(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const a = 2.1 + seed * 0.7;
  const b = 3.3 + seed * 0.4;
  const c = 5.7 + seed;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      0.06 * Math.sin(a * v.x + seed) * Math.sin(a * v.y + 1.3) * Math.sin(a * v.z + 2.1) +
      0.035 * Math.sin(b * v.x + 4) * Math.sin(b * v.y + seed) * Math.sin(b * v.z) +
      0.02 * Math.sin(c * v.x) * Math.sin(c * v.y + 2) * Math.sin(c * v.z + seed);
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The label: text drawn on a canvas, shown on a plane floating in front of the puffs. */
function drawLabel(label: CloudLabel, big: boolean) {
  const dpr = 3;
  const fs = big ? 30 : 22;
  const display = cssVar('--font-display', 'system-ui, sans-serif');
  const mono = cssVar('--font-mono', 'ui-monospace, monospace');
  const titleFont = `700 ${fs}px ${display}`;
  const kickerFont = `700 ${fs * 0.68}px ${mono}`;
  const subFont = `700 ${fs * 0.5}px ${mono}`;

  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d')!;
  const measure = (font: string, text: string) => ((cx.font = font), cx.measureText(text).width);
  const kickerW = label.kicker ? measure(kickerFont, label.kicker) + fs * 0.5 : 0;
  const textW = Math.max(measure(titleFont, label.title), label.sub ? measure(subFont, label.sub) : 0);
  const tick = fs * 1.15;
  const gap = fs * 0.5;
  const w = Math.ceil(kickerW + textW + gap + tick + 8);
  const h = Math.ceil((label.sub ? fs * 1.95 : fs * 1.3) + 8);
  cv.width = w * dpr;
  cv.height = h * dpr;
  cx.scale(dpr, dpr);

  const draw = (ticked: boolean) => {
    cx.clearRect(0, 0, w, h);
    cx.textBaseline = 'middle';
    const mid = h / 2;
    const titleY = label.sub ? 4 + fs * 0.62 : mid + 1;
    if (label.kicker) {
      cx.font = kickerFont;
      cx.fillStyle = 'rgba(42, 18, 20, 0.5)';
      cx.fillText(label.kicker, 2, titleY);
    }
    cx.font = titleFont;
    cx.fillStyle = INK;
    cx.fillText(label.title, kickerW + 2, titleY);
    if (label.sub) {
      cx.font = subFont;
      cx.fillStyle = 'rgba(42, 18, 20, 0.6)';
      cx.fillText(label.sub, kickerW + 2, titleY + fs * 0.95);
    }
    // An empty ring until the track is counted, then a red disc with a check.
    const r = tick / 2;
    const tx = w - r - 3;
    cx.beginPath();
    cx.arc(tx, mid, r - 1, 0, Math.PI * 2);
    if (ticked) {
      cx.fillStyle = LASTFM_RED;
      cx.fill();
      cx.strokeStyle = '#fff';
      cx.lineWidth = fs * 0.12;
      cx.lineCap = 'round';
      cx.lineJoin = 'round';
      cx.beginPath();
      cx.moveTo(tx - r * 0.42, mid + r * 0.02);
      cx.lineTo(tx - r * 0.1, mid + r * 0.34);
      cx.lineTo(tx + r * 0.45, mid - r * 0.3);
      cx.stroke();
    } else {
      cx.strokeStyle = 'rgba(42, 18, 20, 0.25)';
      cx.lineWidth = 1.5;
      cx.stroke();
    }
  };
  draw(!!label.ticked);
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    aspect: w / h,
    redraw(ticked: boolean) {
      draw(ticked);
      texture.needsUpdate = true;
    },
  };
}

interface Puff {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  /** When it starts to evaporate, 0 (first) to 1. */
  delay: number;
  phase: number;
}

interface Cloud {
  /** The puffs' size, in px. */
  R: number;
  root: THREE.Group;
  body: THREE.Group;
  puffs: Puff[];
  mat: THREE.MeshPhysicalMaterial;
  labelMat: THREE.MeshBasicMaterial;
  label: ReturnType<typeof drawLabel>;
  born: number;
  dur: number;
  /** Progress (0–1) from which it evaporates. */
  fadeFrom: number;
  /** The result cloud rises to a point and hangs there. */
  hang: boolean;
  /** When evaporate() hurried it away. */
  hurried: number | null;
  start: THREE.Vector3;
  rise: number;
  sway: number;
  spin: number;
  wobble: number;
}

export function createCloudSky(canvas: HTMLCanvasElement): CloudSky {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.35;
  // Warm key from the upper left, the room's colour from the upper right, a dark warm bounce from below.
  scene.add(new THREE.HemisphereLight(0xfff1e8, 0x4a1010, 0.9));
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(-0.6, 1, 0.9);
  scene.add(key);
  const lamp = new THREE.PointLight(0xff5a3c, 3.5, 0, 0);
  scene.add(lamp);
  const under = new THREE.DirectionalLight(0xff3a2a, 0.7);
  under.position.set(0.2, -1, 0.4);
  scene.add(under);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  const puffGeometries = [0, 1, 2, 3].map(lumpySphere);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const clouds: Cloud[] = [];
  let width = 1;
  let height = 1;
  const origin = new THREE.Vector2(0.5, 0.5);
  let ceiling = 0;
  let side = 1;
  let puffSeed = 0;
  let frame = 0;
  let disposed = false;

  const toWorld = (x: number, y: number, z = 0) => new THREE.Vector3(x - width / 2, height / 2 - y, z);
  /**
   * How far a cloud can rise and still be gone below the ceiling: its top
   * reaches about 2.3 R over its centre, plus its growth and the drift towards
   * the camera, and a little air.
   */
  const maxRise = (R: number) => Math.max(R * 2, origin.y - ceiling - R * 2.8 - 16);

  function build(label: CloudLabel, big: boolean): Cloud {
    const drawn = drawLabel(label, big);
    // Text height on screen follows the room's width, within reason.
    const textH = Math.min(Math.max(width * (big ? 0.022 : 0.015), big ? 22 : 15), big ? 40 : 26) * (label.sub ? 1.5 : 1);
    const textW = textH * drawn.aspect;
    const R = textH * (big ? 0.85 : 1);
    const span = textW + R * 0.6;

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf6ece6,
      roughness: 0.95,
      metalness: 0,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffe6dc),
      sheenRoughness: 0.6,
      transparent: true,
    });
    const puffs: Puff[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, delay: number) => {
      const mesh = new THREE.Mesh(puffGeometries[puffSeed++ % puffGeometries.length], mat);
      mesh.position.set(x, y, z);
      // Only round puffs turn freely; a stretched one would streak off diagonally.
      if (Math.abs(sx - sy) / sx < 0.15) mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      body.add(mesh);
      puffs.push({ mesh, base: new THREE.Vector3(sx, sy, sz), delay, phase: rand(0, 6) });
    };
    // A flat-bottomed base, a row of puffs along the label, big billows on top,
    // a crown, and fill behind so it reads round as it turns.
    add(0, -R * 0.3, 0, span * 0.5, R * 0.55, R * 0.85, 0.5);
    const n = Math.max(3, Math.round(span / (R * 1.15)));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = R * rand(0.78, 1) * (1 - 0.5 * Math.abs(t - 0.5));
      add((t - 0.5) * span, rand(-0.1, 0.1) * R, R * rand(0.15, 0.35), r, r * 0.92, r, Math.abs(t - 0.5));
    }
    const m = Math.max(2, n - 1);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      const r = R * rand(1.05, 1.35) * (1 - 0.7 * Math.abs(t - 0.5));
      add((t - 0.5) * span * 0.8 + rand(-0.1, 0.1) * R, R * rand(0.55, 0.85), -R * rand(0.1, 0.4), r, r, r, 0.15 + Math.abs(t - 0.5) * 0.6);
    }
    add(rand(-0.15, 0.15) * span, R * 1.35, -R * 0.45, R * 0.95, R * 0.9, R * 0.95, 0);
    for (let i = 0; i < 3; i++) add(rand(-0.4, 0.4) * span, rand(0, 0.5) * R, -R * rand(0.7, 1), R, R, R, 0.3);

    // The label always draws over its own puffs.
    const labelMat = new THREE.MeshBasicMaterial({ map: drawn.texture, transparent: true, depthTest: false, toneMapped: false });
    const plane = new THREE.Mesh(planeGeometry, labelMat);
    plane.scale.set(textW, textH, 1);
    plane.position.set(0, R * 0.05, R * 1.6);
    plane.renderOrder = 10;
    root.add(plane);
    scene.add(root);

    side = -side;
    return {
      R,
      root,
      body,
      puffs,
      mat,
      labelMat,
      label: drawn,
      born: performance.now(),
      dur: CLOUD_DRIFT_MS,
      fadeFrom: 0.5,
      hang: false,
      hurried: null,
      start: toWorld(origin.x + rand(-0.03, 0.03) * width, origin.y),
      rise: Math.min(height * rand(0.42, 0.5), maxRise(R)),
      sway: width * rand(0.025, 0.045) * side,
      spin: rand(0.35, 0.6) * side,
      wobble: rand(0, 6),
    };
  }

  function remove(c: Cloud) {
    scene.remove(c.root);
    c.mat.dispose();
    c.labelMat.dispose();
    c.label.texture.dispose();
    clouds.splice(clouds.indexOf(c), 1);
  }

  function render(now: number) {
    frame = 0;
    if (disposed) return;
    for (const c of [...clouds]) {
      const p = Math.min(1, (now - c.born) / c.dur);
      // Off the record and slowing near the top (gently, so they don't pile up under the header); the result cloud flattens out and hangs.
      const rp = c.hang ? (p < 0.35 ? easeOutCubic(p / 0.35) * 0.7 : 0.7 + 0.3 * smooth(0.35, 1, p)) : 1 - Math.pow(1 - p, 2);
      c.root.position.set(c.start.x + c.sway * Math.sin(p * Math.PI * 1.1), c.start.y + c.rise * rp, c.start.z + 90 * p);
      const pop = easeOutBack(Math.min(1, p / 0.12));
      c.root.scale.setScalar(Math.max(0.001, 0.25 + 0.75 * pop) * (1 + 0.08 * p));
      c.body.rotation.y = c.spin * Math.sin(p * Math.PI) + 0.15 * Math.sin(now / 1300 + c.wobble);
      c.body.rotation.x = 0.12 + 0.05 * Math.sin(now / 1700 + c.wobble);
      c.body.rotation.z = 0.04 * Math.sin(now / 1100 + c.wobble * 2);
      // Evaporate: each puff shrinks away on its own clock, the edges first.
      const hurry = c.hurried === null ? 0 : Math.min(1, (now - c.hurried) / HURRY_MS);
      const ev = Math.max(smooth(c.fadeFrom, 1, p), hurry);
      for (const puff of c.puffs) {
        const gone = smooth(puff.delay * 0.45, puff.delay * 0.45 + 0.55, ev);
        const breathe = 1 + 0.035 * Math.sin(now / 600 + puff.phase);
        puff.mesh.scale.copy(puff.base).multiplyScalar(breathe * (1 - gone * 0.85));
      }
      const fadeIn = smooth(0, 0.08, p);
      c.mat.opacity = fadeIn * (1 - smooth(0.25, 1, ev));
      c.labelMat.opacity = fadeIn * (1 - smooth(0, 0.6, ev));
      if (p >= 1 || hurry >= 1) remove(c);
    }
    renderer.render(scene, camera);
    // Draw only while there are clouds; the last frame above cleared the canvas.
    if (clouds.length) frame = requestAnimationFrame(render);
  }

  const wake = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };

  return {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(0, 0, height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
      camera.updateProjectionMatrix();
      lamp.position.copy(toWorld(width * 0.88, height * 0.08, 200));
      wake();
    },
    setOrigin(x, y) {
      origin.set(x, y);
    },
    setCeiling(y) {
      ceiling = y;
    },
    setTint(css) {
      const colour = new THREE.Color();
      try {
        colour.setStyle(css);
      } catch {
        return;
      }
      // Lift a dark flood so it still reads as light on the clouds.
      const hsl = { h: 0, s: 0, l: 0 };
      colour.getHSL(hsl);
      lamp.color.setHSL(hsl.h, Math.max(hsl.s, 0.5), Math.max(hsl.l, 0.6));
    },
    lift(label) {
      const c = build(label, false);
      clouds.push(c);
      wake();
      return { tick: () => c.label.redraw(true) };
    },
    confirm(label) {
      const c = build({ ...label, ticked: true }, true);
      Object.assign(c, {
        dur: CONFIRM_DRIFT_MS,
        fadeFrom: 0.62,
        hang: true,
        start: toWorld(origin.x, origin.y),
        rise: Math.min(height * 0.3, maxRise(c.R)),
        sway: width * 0.01,
        spin: 0.25,
      });
      clouds.push(c);
      wake();
    },
    evaporate() {
      const now = performance.now();
      for (const c of clouds) c.hurried ??= now;
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      for (const c of [...clouds]) remove(c);
      puffGeometries.forEach(g => g.dispose());
      planeGeometry.dispose();
      env.dispose();
      renderer.dispose();
    },
  };
}
