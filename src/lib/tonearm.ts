import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ReleaseRoom } from '@/lib/releaseRooms';

/**
 * The release room's tonearm, drawn in 3D over a room photo that has only the
 * arm's base (src/components/album/RoomArm.tsx). Loaded lazily: it pulls in three.
 *
 * World units are the photo's pixels at Codex's 1536 × 1024. The origin is the
 * spindle on the record's surface, y up. An orthographic camera tilted down by
 * asin(ry / rx) turns the record's circle into the photo's ellipse, so the arm
 * lines up with the photo without any per-room tuning beyond the pivot.
 *
 * The model is built to the prog-art deck's proportions and scaled to each
 * room by the pivot-to-spindle distance.
 */

const PW = 1536;
const PH = 1024;
/** prog-art's pivot-to-spindle distance (top-down), which the model is built for. */
const REACH = 236.4;
/** The pillar top's height above the record surface, in model units; puts the stylus at 0. */
const PILLAR_H = 16;
const MAX_PITCH = 0.085;
/** How far the cue holds the arm up while it rests (0–1 of a full lift). */
export const REST_LIFT = 0.3;

export interface ArmPose {
  /** Turn about the pillar, radians. */
  yaw: number;
  /** Cue lift, 0 (down) to 1 (up). */
  lift: number;
}

/** The canvas's box in % of the photo. */
export interface ArmRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Tonearm {
  region: ArmRegion;
  /** The stylus on the lead-in. */
  play: ArmPose;
  /** Parked on the arm rest. */
  rest: ArmPose;
  /** Size the canvas: its CSS width in px. */
  resize(cssWidth: number): void;
  draw(pose: ArmPose): void;
  dispose(): void;
}

// ---------- textures, drawn on canvases ----------
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Brushed metal: fine streaks running one way (seeded, so every visit looks the same). */
function brushed(base: string, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTexture(512, g => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * 512;
      const a = rnd() * 0.09;
      g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.lineWidth = rnd() * 1.4 + 0.2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (rnd() - 0.5) * 4, 512);
      g.stroke();
    }
  });
}

/** Knurling for the counterweight's grip. */
function knurl() {
  return canvasTexture(256, g => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    g.lineWidth = 3;
    g.strokeStyle = '#2a2a2a';
    for (let i = -256; i < 512; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 256, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(i, 256);
      g.lineTo(i + 256, 0);
      g.stroke();
    }
  });
}

// ---------- the arm ----------
function buildArm() {
  const tubeTex = brushed('#8a8a8a', 7);
  tubeTex.rotation = Math.PI / 2;
  tubeTex.repeat.set(1, 6);
  const knurlTex = knurl();
  knurlTex.repeat.set(10, 2);
  const alu = new THREE.MeshPhysicalMaterial({ color: 0xdcd3c6, metalness: 1, roughness: 0.22, envMapIntensity: 0.85, roughnessMap: tubeTex, anisotropy: 0.7, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  const satin = new THREE.MeshPhysicalMaterial({ color: 0xbdb5aa, metalness: 1, roughness: 0.38, envMapIntensity: 0.8, roughnessMap: brushed('#a0a0a0', 11) });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe4ddd2, metalness: 1, roughness: 0.12, envMapIntensity: 0.95 });
  const knurled = new THREE.MeshPhysicalMaterial({ color: 0xcbc3b8, metalness: 1, roughness: 0.32, envMapIntensity: 0.8, bumpMap: knurlTex, bumpScale: 1.2 });
  const anodised = new THREE.MeshPhysicalMaterial({ color: 0x1c1a19, metalness: 0.7, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0e, metalness: 0, roughness: 0.28, clearcoat: 0.6 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xd7a84f, metalness: 1, roughness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  const along = (geo: THREE.BufferGeometry) => geo.rotateZ(Math.PI / 2); // a cylinder along x
  const across = (geo: THREE.BufferGeometry) => geo.rotateX(Math.PI / 2); // a cylinder along z
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    return o;
  };

  // yaw turns about the pillar; pitch is the cue lifting the arm about the gimbal.
  const yaw = new THREE.Group();
  const pitch = at(new THREE.Group(), 0, 9, 0);
  yaw.add(pitch);

  yaw.add(at(mesh(new THREE.CylinderGeometry(13, 14, 7, 48), satin), 0, 0.5, 0));
  const ring = at(mesh(new THREE.TorusGeometry(13, 1, 10, 48), chrome), 0, 4, 0);
  ring.rotation.x = Math.PI / 2;
  yaw.add(ring);
  for (const z of [-9.5, 9.5]) {
    const side = Math.sign(z);
    yaw.add(at(mesh(new THREE.BoxGeometry(16, 15, 3), satin), 0, 9, z));
    yaw.add(at(mesh(across(new THREE.CylinderGeometry(4.2, 4.2, 2.4, 32)), chrome), 0, 9, z + side * 2.6));
    yaw.add(at(mesh(across(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 6)), anodised), 0, 9, z + side * 4.1));
  }
  yaw.add(at(mesh(new THREE.BoxGeometry(16, 3, 22), satin), 0, 17.5, 0));
  yaw.add(at(mesh(new THREE.CylinderGeometry(5, 5, 3, 32), chrome), 0, 20.5, 0));

  // The S-shaped tube: out from the pivot, a long bow outward, then back in so
  // the headshell meets the record at its offset angle.
  const path = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(4, 0, 0),
      new THREE.Vector3(40, 0, 0.5),
      new THREE.Vector3(95, 0, -6),
      new THREE.Vector3(150, 0, -13),
      new THREE.Vector3(185, 0, -9),
      new THREE.Vector3(205, 0, 1),
      new THREE.Vector3(216, 0, 7),
    ],
    false,
    'centripetal',
  );
  pitch.add(mesh(new THREE.TubeGeometry(path, 160, 4, 28), alu));
  pitch.add(mesh(across(new THREE.CylinderGeometry(6, 6, 14, 32)), satin));
  // Rear stub and counterweight.
  pitch.add(at(mesh(along(new THREE.CylinderGeometry(3.2, 3.2, 40, 24)), chrome), -24, 0, 0));
  pitch.add(at(mesh(along(new THREE.CylinderGeometry(15, 15, 22, 64)), knurled), -44, 0, 0));
  pitch.add(at(mesh(along(new THREE.CylinderGeometry(13.5, 15, 3, 64)), chrome), -56.5, 0, 0));
  pitch.add(at(mesh(along(new THREE.CylinderGeometry(15, 13.5, 3, 64)), chrome), -31.5, 0, 0));
  pitch.add(at(mesh(along(new THREE.CylinderGeometry(9, 9, 4, 48)), anodised), -28, 0, 0));

  // Headshell, cartridge and stylus, following the end of the tube.
  const end = path.getPoint(1);
  const dir = path.getTangent(1);
  const shell = new THREE.Group();
  shell.position.copy(end);
  shell.rotation.y = -Math.atan2(dir.z, dir.x);
  pitch.add(shell);
  shell.add(at(mesh(along(new THREE.CylinderGeometry(5, 4.4, 10, 32)), satin), -2, 0, 0));
  shell.add(at(mesh(along(new THREE.CylinderGeometry(4.2, 3.6, 10, 24)), anodised), 3, -1, 0));
  shell.add(at(mesh(new THREE.BoxGeometry(54, 2.6, 21), anodised), 30, -5.5, 0));
  for (const z of [-5, 5]) {
    shell.add(at(mesh(new THREE.BoxGeometry(18, 0.6, 2.4), plastic), 30, -4.1, z));
    shell.add(at(mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 16), gold), 27, -3.8, z));
  }
  const fingerLift = new THREE.CatmullRomCurve3([new THREE.Vector3(48, -5.5, -8), new THREE.Vector3(58, -4, -13), new THREE.Vector3(64, 1, -16)]);
  shell.add(mesh(new THREE.TubeGeometry(fingerLift, 20, 1.1, 10), chrome));
  shell.add(at(mesh(new THREE.BoxGeometry(24, 15, 15), plastic), 31, -14.5, 0));
  shell.add(at(mesh(new THREE.BoxGeometry(10, 4, 0.4), gold), 33, -13, 7.6));
  shell.add(at(mesh(new THREE.BoxGeometry(6, 5, 9), plastic), 44, -19.5, 0));
  const cantilever = at(mesh(along(new THREE.CylinderGeometry(0.35, 0.5, 7, 8)), gold), 47, -23, 0);
  cantilever.rotation.z = -0.5;
  shell.add(cantilever);
  const tip = at(new THREE.Object3D(), 50, -25, 0);
  shell.add(tip);
  [0xc0392b, 0x2e8b57, 0x2c5aa0, 0xeeeeee].forEach((colour, i) => {
    const z = -4.5 + i * 3;
    const lead = new THREE.CatmullRomCurve3([new THREE.Vector3(8, -6.5, z * 0.6), new THREE.Vector3(13, -12, z * 1.1), new THREE.Vector3(19, -15, z * 0.8)]);
    shell.add(mesh(new THREE.TubeGeometry(lead, 12, 0.55, 6), new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.35, clearcoat: 0.8 })));
  });

  return { yaw, pitch, tip, path, satin, chrome, rubber };
}

/** Throws when WebGL is unavailable. */
export function createTonearm(canvas: HTMLCanvasElement, room: Pick<ReleaseRoom, 'record' | 'arm'>): Tonearm {
  const pivotPct = room.arm;
  if (!pivotPct) throw new Error('room has no arm pivot');
  const rec = room.record;
  const sx = (rec.x / 100) * PW;
  const sy = (rec.y / 100) * PH;
  const R = (rec.rx / 100) * PW;
  const elev = Math.asin(Math.min(0.95, ((rec.ry / 100) * PH) / R));
  const pivot = { x: (pivotPct.x / 100) * PW, y: (pivotPct.y / 100) * PH };

  // The pillar top in the world: its screen position fixes x, and z once its
  // height is known; its height scales with the model, which scales with the reach.
  let scale = 1;
  let pz = 0;
  const px = pivot.x - sx;
  for (let i = 0; i < 6; i++) {
    pz = (pivot.y - sy + PILLAR_H * scale * Math.cos(elev)) / Math.sin(elev);
    scale = Math.hypot(px, pz) / REACH;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // A neutral studio for reflections, so the metal reads as steel; the room's warmth comes from the lights.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = env;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x2a1508, 0.35));
  const key = new THREE.DirectionalLight(0xffd9b0, 1.8);
  key.position.set(-260 * scale, 520 * scale, 300 * scale);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const reach = 420 * scale;
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 3000 * scale });
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a50, 1.3);
  rim.position.set(500 * scale, 260 * scale, -400 * scale);
  scene.add(rim);

  // Shadow catchers: the record, and the plinth round it. They only darken; the photo gives the colour.
  const plinthY = -17 * scale;
  const recordShadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.02, 96), new THREE.ShadowMaterial({ opacity: 0.5 }));
  recordShadow.rotation.x = -Math.PI / 2;
  recordShadow.position.y = 0.2;
  recordShadow.receiveShadow = true;
  const plinthShadow = new THREE.Mesh(new THREE.RingGeometry(R * 1.12, R * 2.2, 96), new THREE.ShadowMaterial({ opacity: 0.42 }));
  plinthShadow.rotation.x = -Math.PI / 2;
  plinthShadow.position.y = plinthY;
  plinthShadow.receiveShadow = true;
  scene.add(recordShadow, plinthShadow);

  const arm = buildArm();
  arm.yaw.scale.setScalar(scale);
  arm.yaw.position.set(px, PILLAR_H * scale, pz);
  scene.add(arm.yaw);

  const pose = (p: ArmPose) => {
    arm.yaw.rotation.y = p.yaw;
    arm.pitch.rotation.z = p.lift * MAX_PITCH;
    arm.yaw.updateMatrixWorld(true);
  };
  // The yaw that puts the stylus at radius rho (fraction of the record) on the front of the record.
  const yawAt = (rho: number) => {
    let lo = Math.PI;
    let hi = Math.PI + 1.4;
    const v = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      pose({ yaw: mid, lift: 0 });
      arm.tip.getWorldPosition(v);
      if (Math.hypot(v.x, v.z) < rho * R) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const play: ArmPose = { yaw: yawAt(0.93), lift: 0 };
  const rest: ArmPose = { yaw: play.yaw + 0.5, lift: REST_LIFT };

  // The arm rest: a post with a rubber cradle where the parked arm lowers onto the tube.
  pose(rest);
  const cradleAt = arm.pitch.localToWorld(arm.path.getPoint(0.62).clone());
  const top = cradleAt.y - 3.6 * scale;
  const postH = top - plinthY - 4 * scale;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(2.4 * scale, 3.2 * scale, postH, 24), arm.satin);
  post.position.set(cradleAt.x, plinthY + postH / 2, cradleAt.z);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(7 * scale, 8 * scale, 3 * scale, 32), arm.chrome);
  foot.position.set(cradleAt.x, plinthY + 1.5 * scale, cradleAt.z);
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(5 * scale, 4 * scale, 12 * scale), arm.rubber);
  cradle.position.set(cradleAt.x, top - 2 * scale, cradleAt.z);
  cradle.rotation.y = rest.yaw;
  for (const m of [post, foot, cradle]) m.castShadow = true;
  scene.add(post, foot, cradle);

  // The centre spindle, poking up through the label: a real one is ~7 mm across
  // and stands ~13 mm proud of a 302 mm record. Polished steel, with a rounded tip.
  const spR = R * 0.024;
  const spH = R * 0.085;
  const spindle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(spR, spR, spH - spR, 32), arm.chrome);
  shaft.position.y = (spH - spR) / 2;
  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(spR, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), arm.chrome);
  tipCap.scale.y = 0.9;
  tipCap.position.y = spH - spR;
  for (const m of [shaft, tipCap]) m.castShadow = true;
  spindle.add(shaft, tipCap);
  scene.add(spindle);

  // The canvas covers the deck: the record's right-hand part, the arm's sweep and the rest.
  const left = Math.max(0, sx - R * 0.35);
  const right = Math.min(PW, pivot.x + 110 * scale);
  const topPx = Math.max(0, Math.min(pivot.y - 90 * scale, sy - spH * Math.cos(elev) - 10));
  const bottom = Math.min(PH, sy + R * Math.sin(elev) + 120 * scale);
  const camera = new THREE.OrthographicCamera(left - sx, right - sx, sy - topPx, sy - bottom, 1, 10000);
  camera.position.set(0, Math.sin(elev) * 4000, Math.cos(elev) * 4000);
  camera.lookAt(0, 0, 0);
  const region: ArmRegion = {
    left: (left / PW) * 100,
    top: (topPx / PH) * 100,
    width: ((right - left) / PW) * 100,
    height: ((bottom - topPx) / PH) * 100,
  };

  let last: ArmPose = rest;
  return {
    region,
    play,
    rest,
    resize(cssWidth) {
      const cssHeight = cssWidth * ((bottom - topPx) / (right - left));
      // Capped: a big hero on a 2x screen would otherwise be a very large canvas.
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 2400 / Math.max(1, cssWidth));
      renderer.setPixelRatio(ratio);
      renderer.setSize(cssWidth, cssHeight, false);
      this.draw(last);
    },
    draw(p) {
      last = p;
      pose(p);
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
            m.dispose();
          }
        }
      });
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
