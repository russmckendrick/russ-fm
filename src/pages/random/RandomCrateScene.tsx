import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, Shuffle } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

interface RandomCrateSceneProps {
  albums: Album[];
  targetCount?: number;
}

interface CrateRecord {
  id: string;
  title: string;
  artist: string;
  albumHref: string;
  artistHref: string;
  imageUrl: string;
  details: string[];
  year: string;
}

interface ActiveView {
  record: CrateRecord;
  index: number;
  total: number;
}

interface SleeveMaterials {
  coverMaterial: THREE.MeshStandardMaterial;
  backMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.MeshStandardMaterial;
}

interface Sleeve {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.Material[]>;
  record: CrateRecord;
  materials: SleeveMaterials;
  placeholder: THREE.CanvasTexture;
  coverTexture: THREE.Texture | null;
  jitter: {
    x: number;
    y: number;
    rz: number;
    ry: number;
  };
}

interface CrateApi {
  flip: (direction: -1 | 1) => void;
  loadRecords: (shuffleAgain?: boolean) => void;
  shuffleRecords: () => void;
  toggleInspect: () => void;
}

interface SceneTheme {
  background: string;
  skyLight: string;
  keyLight: string;
  groundLight: string;
  highlight: string;
  shadowColor: string;
  shadowOpacity: number;
  exposure: number;
  hemiIntensity: number;
  keyIntensity: number;
  rimIntensity: number;
  isDark: boolean;
}

const DEFAULT_TARGET_COUNT = 25;
const SLEEVE_SIZE = 1.54;
const controlClassName =
  'relative grid h-12 min-w-0 place-items-center bg-paper/0 text-ink transition-[background-color,color,opacity,transform] duration-150 hover:bg-ink hover:text-paper focus-visible:z-[1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-px disabled:pointer-events-none disabled:opacity-35 sm:h-11 sm:w-11';

export default function RandomCrateScene({
  albums,
  targetCount = DEFAULT_TARGET_COUNT,
}: RandomCrateSceneProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<CrateApi | null>(null);
  const albumsRef = useRef(albums);
  const targetCountRef = useRef(targetCount);
  const [activeView, setActiveView] = useState<ActiveView | null>(null);
  const [statusText, setStatusText] = useState('Building crate');
  const [statusVisible, setStatusVisible] = useState(true);
  const [inspectActive, setInspectActive] = useState(false);

  useEffect(() => {
    albumsRef.current = albums;
    targetCountRef.current = targetCount;
    apiRef.current?.loadRecords(false);
  }, [albums, targetCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let disposed = false;
    let animationFrame = 0;
    let sleeves: Sleeve[] = [];
    let activeIndex = 0;
    let loadedTextures = 0;
    let loadGeneration = 0;
    let isLoadingRecords = false;
    let inspectOpen = false;
    let isDraggingSleeve = false;
    let isSelectingSleeve = false;
    let dragStartY = 0;
    let dragStartX = 0;
    let dragStartTime = 0;
    let dragTiltTarget = 0;
    let dragSlideTarget = 0;
    let sleevePull = 0;
    let sleeveSlide = 0;
    let inspectProgress = 0;
    let wheelAccumulator = 0;
    let wheelReadyAt = 0;

    const statusTimers = new Set<number>();
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.set(0, 2.95, 5.35);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4.55;
    controls.maxDistance = 6.8;
    controls.minPolarAngle = 0.48;
    controls.maxPolarAngle = 1.15;
    controls.minAzimuthAngle = -0.38;
    controls.maxAzimuthAngle = 0.38;
    controls.target.set(0, 0.94, -0.18);

    const rig = new THREE.Group();
    rig.rotation.y = -0.04;
    scene.add(rig);

    const recordLayer = new THREE.Group();
    rig.add(recordLayer);

    const crateLayer = new THREE.Group();
    rig.add(crateLayer);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    const sleeveGeometry = new THREE.BoxGeometry(SLEEVE_SIZE, SLEEVE_SIZE, 0.035);
    const lighting = buildLighting(scene);

    buildCrate(crateLayer, renderer.capabilities.getMaxAnisotropy());
    applyTheme();
    resize();
    loadRecords(false);
    animate();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);

    apiRef.current = {
      flip,
      loadRecords,
      shuffleRecords: () => loadRecords(true),
      toggleInspect,
    };

    function loadRecords(shuffleAgain = false) {
      loadGeneration += 1;
      const generation = loadGeneration;
      isLoadingRecords = true;
      loadedTextures = 0;
      activeIndex = 0;
      setInspectState(false);
      clearStatusTimers();
      setCrateStatus(shuffleAgain ? 'Shuffling collection' : 'Loading crate');

      const records = chooseRecords(albumsRef.current, targetCountRef.current);
      disposeSleeves();

      if (records.length === 0) {
        setActiveSafely(null);
        setCrateStatus('No records loaded');
        isLoadingRecords = false;
        return;
      }

      setCrateStatus(`Loading covers 0 / ${records.length}`);
      records.forEach((record, index) => {
        const sleeve = createSleeve(record, index);
        sleeves.push(sleeve);
        recordLayer.add(sleeve.group);
      });

      updateOverlay();
      sleeves.forEach((sleeve) => loadCoverTexture(sleeve, generation));
      isLoadingRecords = false;
    }

    function chooseRecords(collection: Album[], count: number): CrateRecord[] {
      return shuffle(
        collection
          .map(normalizeAlbum)
          .filter((record): record is CrateRecord => Boolean(record)),
      ).slice(0, Math.max(1, count));
    }

    function createSleeve(record: CrateRecord, index: number): Sleeve {
      const placeholder = makePlaceholderTexture(record, index, renderer.capabilities.getMaxAnisotropy());
      const coverMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: placeholder,
        roughness: 0.6,
        metalness: 0.02,
      });
      const backMaterial = new THREE.MeshStandardMaterial({
        color: 0x8e826f,
        map: placeholder,
        roughness: 0.78,
      });
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08 + (index % 8) * 0.015, 0.24, 0.72),
        roughness: 0.82,
      });

      const mesh = new THREE.Mesh(sleeveGeometry, [
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        coverMaterial,
        backMaterial,
      ]);
      mesh.position.y = SLEEVE_SIZE / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const group = new THREE.Group();
      group.add(mesh);
      group.position.set(0, 0.23, 0.7 - index * 0.045);
      group.rotation.x = 0.02;
      group.userData.index = index;

      return {
        group,
        mesh,
        record,
        materials: { coverMaterial, backMaterial, edgeMaterial },
        placeholder,
        coverTexture: null,
        jitter: {
          x: Math.sin(index * 2.23) * 0.018,
          y: Math.cos(index * 1.71) * 0.01,
          rz: Math.sin(index * 1.37) * 0.018,
          ry: Math.cos(index * 0.91) * 0.014,
        },
      };
    }

    function loadCoverTexture(sleeve: Sleeve, generation: number) {
      if (!sleeve.record.imageUrl) {
        markCoverLoaded(generation);
        return;
      }

      textureLoader.load(
        sleeve.record.imageUrl,
        (texture) => {
          if (generation !== loadGeneration || disposed) {
            texture.dispose();
            return;
          }

          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;

          sleeve.coverTexture = texture;
          sleeve.materials.coverMaterial.map = texture;
          sleeve.materials.coverMaterial.color.set(0xffffff);
          sleeve.materials.coverMaterial.needsUpdate = true;
          sleeve.materials.backMaterial.map = texture;
          sleeve.materials.backMaterial.color.set(0x756d63);
          sleeve.materials.backMaterial.needsUpdate = true;
          markCoverLoaded(generation);
        },
        undefined,
        () => markCoverLoaded(generation),
      );
    }

    function markCoverLoaded(generation: number) {
      if (generation !== loadGeneration || disposed) return;
      loadedTextures += 1;
      setCrateStatus(`Loading covers ${loadedTextures} / ${sleeves.length}`);

      if (loadedTextures >= sleeves.length) {
        scheduleStatusTimer(() => {
          if (generation === loadGeneration) {
            setStatusVisibleSafely(false);
          }
        }, 850);
      }
    }

    function flip(direction: -1 | 1) {
      if (!sleeves.length || isLoadingRecords) return;
      setInspectState(false);
      activeIndex = (activeIndex + direction + sleeves.length) % sleeves.length;
      updateOverlay();
    }

    function toggleInspect() {
      if (!sleeves.length || isLoadingRecords) return;
      setInspectState(!inspectOpen);
    }

    function setInspectState(nextState: boolean) {
      inspectOpen = nextState;
      if (!disposed) setInspectActive(nextState);
    }

    function getActiveSleeve(): Sleeve | null {
      return sleeves[activeIndex] ?? null;
    }

    function rankFor(index: number): number {
      if (!sleeves.length) return 0;
      return (index - activeIndex + sleeves.length) % sleeves.length;
    }

    function getTarget(sleeve: Sleeve, index: number) {
      const rank = rankFor(index);
      const packRank = Math.max(1, rank);
      const rankEase = Math.min(packRank, 16);
      const target = {
        x: sleeve.jitter.x,
        y: 0.23 + sleeve.jitter.y,
        z: 0.59 - rankEase * 0.046,
        rx: 0.012 + Math.sin(index * 1.7) * 0.012,
        ry: sleeve.jitter.ry,
        rz: sleeve.jitter.rz,
        scale: 1,
        quaternion: null as THREE.Quaternion | null,
      };

      if (rank === 0) {
        const liftProgress = THREE.MathUtils.smoothstep(inspectProgress, 0, 0.44);
        const pullProgress = THREE.MathUtils.smoothstep(inspectProgress, 0.38, 1);
        const cameraTarget = getCameraInspectTarget();
        const liftedTarget = new THREE.Vector3(
          0,
          THREE.MathUtils.lerp(0.28, 0.8, liftProgress),
          0.88 + sleeveSlide,
        );
        const baseQuaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.18 + sleevePull, 0, 0),
        );

        target.x = 0;
        target.x = THREE.MathUtils.lerp(liftedTarget.x, cameraTarget.position.x, pullProgress);
        target.y = THREE.MathUtils.lerp(liftedTarget.y, cameraTarget.position.y, pullProgress);
        target.z = THREE.MathUtils.lerp(liftedTarget.z, cameraTarget.position.z, pullProgress);
        target.rx = 0.18 + sleevePull;
        target.ry = 0;
        target.rz = 0;
        target.scale = THREE.MathUtils.lerp(1.01, cameraTarget.scale, pullProgress);
        target.quaternion =
          pullProgress > 0.001
            ? baseQuaternion.slerp(cameraTarget.quaternion, pullProgress)
            : null;
      } else if (rank === 1) {
        target.z = 0.52;
        target.rx = 0.04;
        target.scale = 1.005;
      } else if (rank > 18) {
        target.z = -0.35 - (rank - 18) * 0.026;
        target.rx = -0.012;
      }

      if (inspectProgress > 0.02 && rank !== 0) {
        target.z -= inspectProgress * 0.08;
        target.rx -= inspectProgress * 0.025;
      }

      return target;
    }

    function getCameraInspectTarget() {
      const stageRect = stage.getBoundingClientRect();
      const isMobile = stageRect.width < 720;
      const stageAspect = Math.max(0.1, stageRect.width / Math.max(stageRect.height, 1));
      const scale = isMobile ? 1 : 1.12;
      const fovRadians = THREE.MathUtils.degToRad(camera.fov);
      const viewDistance = isMobile
        ? (SLEEVE_SIZE * scale) / (2 * Math.tan(fovRadians / 2) * stageAspect * 0.99)
        : (SLEEVE_SIZE * scale) / (2 * Math.tan(fovRadians / 2) * 0.78);
      const distance = THREE.MathUtils.clamp(
        viewDistance,
        isMobile ? 3.8 : 2.85,
        isMobile ? 5.35 : 3.55,
      );
      const position = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const cameraUp = new THREE.Vector3();
      const parentQuaternion = new THREE.Quaternion();
      const quaternion = new THREE.Quaternion();
      const coverCenterOffset = new THREE.Vector3(0, (SLEEVE_SIZE / 2) * scale, 0);

      camera.getWorldDirection(direction);
      cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      position.copy(camera.position).addScaledVector(direction, distance);
      position.addScaledVector(cameraUp, isMobile ? 0.42 : 0.16);
      recordLayer.worldToLocal(position);

      recordLayer.getWorldQuaternion(parentQuaternion);
      quaternion.copy(parentQuaternion).invert().multiply(camera.quaternion);
      position.sub(coverCenterOffset.applyQuaternion(quaternion));

      return { position, quaternion, scale };
    }

    function updateOverlay() {
      const active = getActiveSleeve();
      if (!active) {
        setActiveSafely(null);
        return;
      }

      setActiveSafely({
        record: active.record,
        index: activeIndex,
        total: sleeves.length,
      });
    }

    function setPointerFromEvent(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function raycastSleeve(event: PointerEvent): Sleeve | null {
      if (!sleeves.length) return null;
      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        sleeves.map((sleeve) => sleeve.mesh),
        false,
      )[0];

      return hit ? sleeves.find((sleeve) => sleeve.mesh === hit.object) ?? null : null;
    }

    function handleWheel(event: WheelEvent) {
      if (isLoadingRecords) return;
      event.preventDefault();
      wheelAccumulator += event.deltaY;
      const now = performance.now();
      if (Math.abs(wheelAccumulator) > 54 && now > wheelReadyAt) {
        flip(wheelAccumulator > 0 ? 1 : -1);
        wheelAccumulator = 0;
        wheelReadyAt = now + 330;
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const active = getActiveSleeve();
      if (isLoadingRecords || !active) return;

      const hitSleeve = raycastSleeve(event);
      if (!hitSleeve) return;

      const hitIndex = sleeves.indexOf(hitSleeve);
      if (hitIndex !== activeIndex) {
        isSelectingSleeve = true;
        setInspectState(false);
        activeIndex = hitIndex;
        updateOverlay();
        controls.enabled = false;
        canvas.style.cursor = 'grab';
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      isDraggingSleeve = true;
      setInspectState(false);
      dragStartY = event.clientY;
      dragStartX = event.clientX;
      dragStartTime = performance.now();
      dragTiltTarget = 0;
      dragSlideTarget = 0;
      controls.enabled = false;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      if (isSelectingSleeve) return;

      if (isDraggingSleeve) {
        const dy = event.clientY - dragStartY;
        dragTiltTarget = THREE.MathUtils.clamp(dy * 0.0046, -0.12, 0.46);
        dragSlideTarget = THREE.MathUtils.clamp(dy * 0.0035, -0.08, 0.42);
        return;
      }

      const hoveringRecord = raycastSleeve(event);
      canvas.style.cursor = hoveringRecord ? 'grab' : 'default';
    }

    function handlePointerUp(event: PointerEvent) {
      if (isSelectingSleeve) {
        endPointerSelection(event);
        return;
      }

      if (!isDraggingSleeve) return;

      const moved = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
      const elapsed = performance.now() - dragStartTime;
      if (moved < 8 && elapsed < 360) {
        toggleInspect();
      }

      endPointerDrag(event);
    }

    function handlePointerCancel(event: PointerEvent) {
      if (isSelectingSleeve) {
        endPointerSelection(event);
        return;
      }

      endPointerDrag(event);
    }

    function endPointerSelection(event: PointerEvent) {
      isSelectingSleeve = false;
      controls.enabled = true;
      canvas.style.cursor = 'default';
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function endPointerDrag(event: PointerEvent) {
      isDraggingSleeve = false;
      dragTiltTarget = 0;
      dragSlideTarget = 0;
      controls.enabled = true;
      canvas.style.cursor = 'default';
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isLoadingRecords || isInteractiveTarget(event.target)) return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        flip(1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        flip(-1);
      } else if (event.key === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        toggleInspect();
      } else if (event.key === 'Escape' && inspectOpen) {
        setInspectState(false);
      }
    }

    function animate() {
      if (disposed) return;
      animationFrame = window.requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      const spring = prefersReducedMotion.matches ? 100 : 8.5;
      const activeSpring = prefersReducedMotion.matches ? 100 : 10.5;

      sleevePull = THREE.MathUtils.damp(sleevePull, dragTiltTarget, isDraggingSleeve ? 24 : 8, dt);
      sleeveSlide = THREE.MathUtils.damp(sleeveSlide, dragSlideTarget, isDraggingSleeve ? 20 : 8, dt);
      inspectProgress = THREE.MathUtils.damp(inspectProgress, inspectOpen ? 1 : 0, 7.5, dt);

      sleeves.forEach((sleeve, index) => {
        const target = getTarget(sleeve, index);
        const rank = rankFor(index);
        const lambda = rank === 0 || rank === 1 ? activeSpring : spring;
        const isHeldInForeground = rank === 0 && inspectProgress > 0.55;

        setSleeveForeground(sleeve, isHeldInForeground);

        sleeve.group.position.x = THREE.MathUtils.damp(sleeve.group.position.x, target.x, lambda, dt);
        sleeve.group.position.y = THREE.MathUtils.damp(sleeve.group.position.y, target.y, lambda, dt);
        sleeve.group.position.z = THREE.MathUtils.damp(sleeve.group.position.z, target.z, lambda, dt);
        if (target.quaternion) {
          sleeve.group.quaternion.slerp(target.quaternion, 1 - Math.exp(-lambda * dt));
        } else {
          sleeve.group.rotation.x = THREE.MathUtils.damp(sleeve.group.rotation.x, target.rx, lambda, dt);
          sleeve.group.rotation.y = THREE.MathUtils.damp(sleeve.group.rotation.y, target.ry, lambda, dt);
          sleeve.group.rotation.z = THREE.MathUtils.damp(sleeve.group.rotation.z, target.rz, lambda, dt);
        }

        const scale = THREE.MathUtils.damp(sleeve.group.scale.x, target.scale, lambda, dt);
        sleeve.group.scale.setScalar(scale);
      });

      controls.update();
      renderer.render(scene, camera);
    }

    function setSleeveForeground(sleeve: Sleeve, foreground: boolean) {
      sleeve.mesh.renderOrder = foreground ? 20 : 0;
      sleeve.mesh.castShadow = !foreground;
      sleeve.mesh.receiveShadow = !foreground;

      Object.values(sleeve.materials).forEach((material) => {
        material.depthTest = true;
        material.depthWrite = true;
        material.needsUpdate = true;
      });
    }

    function resize() {
      if (disposed) return;
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const isMobile = width < 720;
      const isTallMobile = isMobile && height / width > 1.45;
      const frame = isTallMobile
        ? {
            fov: 39,
            cameraY: 2.35,
            cameraZ: 7.25,
            minDistance: 6.45,
            maxDistance: 8.25,
            targetY: 0.48,
            targetZ: -0.08,
          }
        : isMobile
          ? {
              fov: 41,
              cameraY: 2.55,
              cameraZ: 6.75,
              minDistance: 5.65,
              maxDistance: 7.65,
              targetY: 0.58,
              targetZ: -0.12,
            }
          : {
              fov: 39,
              cameraY: 2.75,
              cameraZ: 5.9,
              minDistance: 4.85,
              maxDistance: 7.05,
              targetY: 0.7,
              targetZ: -0.12,
            };

      camera.fov = frame.fov;
      camera.position.set(0, frame.cameraY, frame.cameraZ);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      controls.minDistance = frame.minDistance;
      controls.maxDistance = frame.maxDistance;
      controls.target.set(0, frame.targetY, frame.targetZ);

      renderer.setSize(width, height, false);
    }

    function applyTheme() {
      const theme = readSceneTheme();
      const background = new THREE.Color(theme.background);
      scene.background = background;
      scene.fog = new THREE.Fog(background, theme.isDark ? 5.8 : 6, theme.isDark ? 11 : 12);
      renderer.setClearColor(background, 1);
      renderer.toneMappingExposure = theme.exposure;
      lighting.hemi.color.set(theme.skyLight);
      lighting.hemi.groundColor.set(theme.groundLight);
      lighting.hemi.intensity = theme.hemiIntensity;
      lighting.key.color.set(theme.keyLight);
      lighting.key.intensity = theme.keyIntensity;
      lighting.rim.color.set(theme.highlight);
      lighting.rim.intensity = theme.rimIntensity;
      lighting.floorMaterial.color.set(theme.shadowColor);
      lighting.floorMaterial.opacity = theme.shadowOpacity;
      lighting.floorMaterial.needsUpdate = true;
    }

    function setCrateStatus(message: string) {
      if (disposed) return;
      setStatusText(message);
      setStatusVisible(true);
    }

    function setStatusVisibleSafely(visible: boolean) {
      if (!disposed) setStatusVisible(visible);
    }

    function setActiveSafely(nextActiveView: ActiveView | null) {
      if (!disposed) setActiveView(nextActiveView);
    }

    function scheduleStatusTimer(callback: () => void, delay: number) {
      const timer = window.setTimeout(() => {
        statusTimers.delete(timer);
        callback();
      }, delay);
      statusTimers.add(timer);
    }

    function clearStatusTimers() {
      statusTimers.forEach((timer) => window.clearTimeout(timer));
      statusTimers.clear();
    }

    function disposeSleeves() {
      sleeves.forEach((sleeve) => {
        recordLayer.remove(sleeve.group);
        sleeve.placeholder.dispose();
        sleeve.coverTexture?.dispose();
        Object.values(sleeve.materials).forEach((material) => material.dispose());
      });
      sleeves = [];
    }

    return () => {
      disposed = true;
      loadGeneration += 1;
      apiRef.current = null;
      window.cancelAnimationFrame(animationFrame);
      clearStatusTimers();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      controls.dispose();
      disposeSleeves();
      sleeveGeometry.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      canvas.style.cursor = '';
    };
  }, []);

  const activeRecord = activeView?.record ?? null;
  const detailLine = activeRecord?.details.slice(0, 4).join(' / ') || 'russ.fm collection';
  const titleStyle = useMemo(
    () => getPanelTitleStyle(activeRecord?.title ?? 'Vinyl Record Crate'),
    [activeRecord?.title],
  );

  return (
    <section
      ref={stageRef}
      className="relative isolate min-h-[calc(100dvh-5rem)] overflow-hidden border-b border-rule bg-paper font-grot text-ink"
      aria-label="3D vinyl record crate"
      aria-busy={statusVisible}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 block h-full w-full touch-none outline-none"
        aria-label="Interactive record crate"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.42] mix-blend-multiply dark:opacity-[0.16] dark:mix-blend-screen"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in oklab, var(--paper-warm) 40%, transparent), transparent 62%), repeating-linear-gradient(0deg, color-mix(in oklab, var(--ink) 4%, transparent) 0, color-mix(in oklab, var(--ink) 4%, transparent) 1px, transparent 1px, transparent 7px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] opacity-80 dark:opacity-35 bg-[radial-gradient(ellipse_at_center,transparent_42%,color-mix(in_oklab,var(--ink)_18%,transparent)_100%),linear-gradient(180deg,transparent_56%,color-mix(in_oklab,var(--ink)_10%,transparent)_100%)]"
      />

      <p className="sr-only" aria-live="polite">
        {activeRecord
          ? `Random crate record selected: ${activeRecord.title} by ${activeRecord.artist}.`
          : 'Random crate is loading records.'}
      </p>

      <div
        role="status"
        className={cn(
          'absolute left-4 top-4 z-20 max-w-[min(380px,calc(100vw-126px))] border border-rule bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3 shadow-[0_12px_32px_-24px_rgba(14,13,11,0.5)] backdrop-blur-xl transition-[opacity,transform] duration-200 md:left-8 md:top-8 rounded-[8px]',
          statusVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
        )}
      >
        {statusText}
      </div>

      <div className="absolute right-4 top-4 z-20 min-w-20 border border-rule bg-paper px-3 py-2 text-center font-mono text-[12px] font-bold leading-none text-ink shadow-[0_12px_32px_-22px_rgba(14,13,11,0.6)] md:right-8 md:top-8 rounded-[8px]">
        {activeView ? `${activeView.index + 1} / ${activeView.total}` : '0 / 0'}
      </div>

      <section
        className="absolute bottom-[92px] left-4 right-4 z-20 border border-rule bg-paper p-4 shadow-[0_20px_54px_-34px_rgba(14,13,11,0.55)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-auto sm:w-[min(440px,calc(100vw-4rem))] sm:p-[18px] rounded-[8px]"
        aria-live="polite"
      >
        <p className="mb-2 max-w-full truncate font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
          {activeRecord ? (
            <Link
              to={activeRecord.artistHref}
              className="transition-colors hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              {activeRecord.artist}
            </Link>
          ) : (
            'Loading collection'
          )}
        </p>
        <h1
          className="font-display uppercase leading-[0.98] text-ink"
          style={titleStyle}
        >
          {activeRecord ? (
            <Link
              to={activeRecord.albumHref}
              className="transition-colors hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              {activeRecord.title}
            </Link>
          ) : (
            'Vinyl Record Crate'
          )}
        </h1>
        <p className="mt-3 max-w-[52ch] font-mono text-[12px] font-semibold leading-[1.45] text-ink-3">
          {detailLine}
        </p>
      </section>

      <nav
        className="absolute bottom-4 left-5 right-5 z-20 mx-auto grid max-w-[380px] grid-cols-5 divide-x divide-rule overflow-hidden border border-rule bg-paper/95 shadow-[0_18px_38px_-32px_rgba(14,13,11,0.55)] backdrop-blur-xl sm:bottom-8 sm:left-auto sm:right-8 sm:mx-0 sm:max-w-none"
        aria-label="Record crate controls"
      >
        <ControlButton label="Previous record" onClick={() => apiRef.current?.flip(-1)} disabled={!activeView}>
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </ControlButton>
        <ControlButton
          label={inspectActive ? 'Return record' : 'Inspect record'}
          onClick={() => apiRef.current?.toggleInspect()}
          active={inspectActive}
          disabled={!activeView}
        >
          <Maximize2 className="h-5 w-5" aria-hidden />
        </ControlButton>
        <ControlButton label="Next record" onClick={() => apiRef.current?.flip(1)} disabled={!activeView}>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </ControlButton>
        <ControlButton label="Shuffle records" onClick={() => apiRef.current?.shuffleRecords()} disabled={!activeView}>
          <Shuffle className="h-5 w-5" aria-hidden />
        </ControlButton>
        {activeRecord ? (
          <Link
            to={activeRecord.albumHref}
            aria-label="Open record"
            title="Open record"
            className={controlClassName}
          >
            <span className="sr-only">Open record</span>
            <ExternalLink className="h-5 w-5" aria-hidden />
          </Link>
        ) : (
          <span className={cn(controlClassName, 'pointer-events-none opacity-35')} aria-hidden>
            <ExternalLink className="h-5 w-5" />
          </span>
        )}
      </nav>
    </section>
  );
}

function ControlButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={active || undefined}
      onClick={onClick}
      className={cn(
        controlClassName,
        active &&
          'bg-ink text-paper after:absolute after:bottom-0 after:left-3 after:right-3 after:h-px after:bg-hl hover:bg-hl hover:text-paper',
      )}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

function buildLighting(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight(0xfff7e6, 0x5f665f, 2.2);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff1d4, 3.8);
  key.position.set(-3.8, 5.3, 4.1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -4;
  scene.add(key);

  const rim = new THREE.PointLight(0xc7dcff, 1.55, 8);
  rim.position.set(3.5, 2.2, -2.4);
  scene.add(rim);

  const floorMaterial = new THREE.ShadowMaterial({ color: 0x2f2b25, opacity: 0.24 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  scene.add(floor);

  return { hemi, key, rim, floorMaterial };
}

function buildCrate(crateLayer: THREE.Group, maxAnisotropy: number) {
  const woodTexture = makeWoodTexture(maxAnisotropy);
  const wood = new THREE.MeshStandardMaterial({
    color: 0xb37742,
    map: woodTexture,
    roughness: 0.74,
    metalness: 0.02,
  });
  const endWood = wood.clone();
  endWood.color.set(0xae7041);
  const wornEdge = new THREE.MeshStandardMaterial({
    color: 0xd0a06d,
    roughness: 0.82,
  });

  const outerW = 2.08;
  const innerD = 2.22;
  const outerD = 2.62;
  const wall = 0.18;
  const baseH = 0.18;
  const wallH = 0.72;
  const wallY = baseH + wallH / 2;

  addBoard(outerW, baseH, outerD, 0, baseH / 2, 0, wood, 0.035);
  addSlattedFront(outerW, wall, outerD / 2 - wall / 2, wood);
  addBoard(outerW, wallH, wall, 0, wallY, -outerD / 2 + wall / 2, wood, 0.035);

  const leftEnd = makeEndPanel(innerD, wallH, wall, endWood);
  leftEnd.position.set(-outerW / 2 + wall / 2, baseH, 0);
  crateLayer.add(leftEnd);

  const rightEnd = makeEndPanel(innerD, wallH, wall, endWood);
  rightEnd.position.set(outerW / 2 - wall / 2, baseH, 0);
  crateLayer.add(rightEnd);

  const capGeometryX = new RoundedBoxGeometry(outerW + 0.04, 0.052, 0.105, 3, 0.022);
  const capGeometryZ = new RoundedBoxGeometry(0.105, 0.052, outerD, 3, 0.022);
  const topY = baseH + wallH + 0.027;
  [
    new THREE.Vector3(0, topY, outerD / 2 - 0.075),
    new THREE.Vector3(0, topY, -outerD / 2 + 0.075),
  ].forEach((position) => {
    const cap = new THREE.Mesh(capGeometryX, wornEdge);
    cap.position.copy(position);
    cap.castShadow = true;
    cap.receiveShadow = true;
    crateLayer.add(cap);
  });
  [
    new THREE.Vector3(-outerW / 2 + 0.075, topY, 0),
    new THREE.Vector3(outerW / 2 - 0.075, topY, 0),
  ].forEach((position) => {
    const cap = new THREE.Mesh(capGeometryZ, wornEdge);
    cap.position.copy(position);
    cap.castShadow = true;
    cap.receiveShadow = true;
    crateLayer.add(cap);
  });

  const postGeometry = new RoundedBoxGeometry(0.18, wallH + 0.1, 0.18, 4, 0.035);
  const postMaterial = wood.clone();
  postMaterial.color.set(0x9a6137);
  const postY = baseH + wallH / 2 + 0.02;
  [
    [-outerW / 2 + 0.09, postY, -outerD / 2 + 0.09],
    [-outerW / 2 + 0.09, postY, outerD / 2 - 0.09],
    [outerW / 2 - 0.09, postY, -outerD / 2 + 0.09],
    [outerW / 2 - 0.09, postY, outerD / 2 - 0.09],
  ].forEach(([x, y, z]) => addMesh(postGeometry, postMaterial, x, y, z));

  function addBoard(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    radius: number,
  ) {
    const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
    addMesh(geometry, material, x, y, z);
  }

  function addSlattedFront(
    width: number,
    depth: number,
    z: number,
    material: THREE.MeshStandardMaterial,
  ) {
    const slatHeights = [0.1, 0.105, 0.1];
    const slatCenters = [baseH + 0.09, baseH + 0.36, baseH + 0.64];

    slatHeights.forEach((slatHeight, index) => {
      const slatMaterial = material.clone();
      slatMaterial.color.offsetHSL(0, index === 1 ? -0.04 : 0.02, index === 1 ? -0.05 : 0.02);
      addBoard(width, slatHeight, depth, 0, slatCenters[index], z, slatMaterial, 0.026);
    });
  }

  function addMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    crateLayer.add(mesh);
    return mesh;
  }
}

function makeEndPanel(width: number, height: number, thickness: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  const half = width / 2;
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, height);
  shape.lineTo(-half, height);
  shape.lineTo(-half, 0);

  const handle = new THREE.Path();
  handle.absellipse(0, height * 0.52, 0.39, 0.13, 0, Math.PI * 2, true);
  shape.holes.push(handle);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.018,
    bevelThickness: 0.018,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateY(Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeWoodTexture(maxAnisotropy: number) {
  const size = 512;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext('2d');

  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#8f5732');
    gradient.addColorStop(0.35, '#c0844c');
    gradient.addColorStop(0.62, '#a5683c');
    gradient.addColorStop(1, '#d29a61');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.globalAlpha = 0.28;
    for (let y = 0; y < size; y += 5) {
      const wave = Math.sin(y * 0.045) * 18 + Math.sin(y * 0.013) * 26;
      ctx.strokeStyle = y % 20 === 0 ? '#5f371f' : '#f0c084';
      ctx.lineWidth = y % 20 === 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y + wave * 0.08);
      for (let x = 0; x <= size; x += 24) {
        ctx.lineTo(x, y + Math.sin((x + y) * 0.035) * 5 + wave * 0.05);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.strokeStyle = '#55321d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        16 + Math.random() * 16,
        6 + Math.random() * 8,
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.2);
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function makePlaceholderTexture(record: CrateRecord, index: number, maxAnisotropy: number) {
  const size = 512;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext('2d');
  const hue = (index * 37) % 360;

  if (ctx) {
    ctx.fillStyle = `hsl(${hue}, 29%, 38%)`;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `hsl(${(hue + 54) % 360}, 38%, 74%)`;
    ctx.fillRect(0, size * 0.56, size, size * 0.44);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = -size; i < size * 1.5; i += 34) {
      ctx.fillRect(i, 0, 10, size);
    }
    ctx.fillStyle = 'rgba(22,19,16,0.22)';
    ctx.fillRect(36, 36, size - 72, size - 72);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(46, 46, size - 92, size - 92);
    ctx.fillStyle = '#fff7e7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 62px Archivo, sans-serif';
    ctx.fillText(initials(record.artist), size / 2, size / 2 - 26);
    ctx.font = '700 24px Archivo, sans-serif';
    ctx.fillText(truncate(record.title, 24), size / 2, size / 2 + 42);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function normalizeAlbum(album: Album): CrateRecord | null {
  if (!album.uri_release || !album.release_name || !album.release_artist) return null;

  const cleanGenres = getCleanGenresFromArray(album.genre_names ?? [], album.release_artist).slice(0, 2);
  const styles = (album.styles ?? []).filter(Boolean).slice(0, 2);
  const labels = (album.labels ?? []).filter(Boolean).slice(0, 1);
  const year = formatYear(album.date_release_year);
  const country = album.country ?? '';
  const details = [year, ...cleanGenres, ...styles, ...labels, country].filter(Boolean);

  return {
    id: album.uri_release,
    title: album.release_name,
    artist: album.release_artist,
    albumHref: `/album/${getAlbumPath(album.uri_release)}`,
    artistHref: album.artists?.[0]?.uri_artist ?? album.uri_artist,
    imageUrl: getAlbumImageFromData(album.uri_release, 'medium'),
    details,
    year,
  };
}

function readSceneTheme(): SceneTheme {
  const styles = window.getComputedStyle(document.documentElement);
  const readToken = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const isDark = document.documentElement.classList.contains('dark');

  if (isDark) {
    return {
      background: readToken('--paper-3', '#1d1b16'),
      skyLight: readToken('--stage-ink', '#f7f2e8'),
      keyLight: readToken('--stage-ink', '#f7f2e8'),
      groundLight: readToken('--stage-3', '#1a1713'),
      highlight: readToken('--hl', '#e23b1e'),
      shadowColor: readToken('--stage', '#080807'),
      shadowOpacity: 0.42,
      exposure: 1.2,
      hemiIntensity: 2.9,
      keyIntensity: 4.9,
      rimIntensity: 2.1,
      isDark,
    };
  }

  return {
    background: readToken('--paper-2', '#ebe6db'),
    skyLight: readToken('--paper-warm', '#faf7ef'),
    keyLight: readToken('--paper-warm', '#faf7ef'),
    groundLight: readToken('--ink-dim', '#8a8377'),
    highlight: readToken('--hl', '#e23b1e'),
    shadowColor: readToken('--ink', '#0e0d0b'),
    shadowOpacity: 0.24,
    exposure: 1.06,
    hemiIntensity: 2.2,
    keyIntensity: 3.8,
    rimIntensity: 1.55,
    isDark,
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest('a, button, input, textarea, select, [contenteditable="true"]'))
    : false;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(object.material);
    }
  });
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function disposeMaterial(material: THREE.Material) {
  const mappedMaterial = material as THREE.Material & {
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
  };

  mappedMaterial.map?.dispose();
  mappedMaterial.alphaMap?.dispose();
  mappedMaterial.normalMap?.dispose();
  mappedMaterial.roughnessMap?.dispose();
  mappedMaterial.metalnessMap?.dispose();
  material.dispose();
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getAlbumPath(uriRelease: string): string {
  return uriRelease.replace('/album/', '').replace('/', '');
}

function formatYear(value: string | undefined): string {
  if (!value) return '';
  return value.match(/\d{4}/)?.[0] ?? '';
}

function getPanelTitleStyle(title: string): CSSProperties {
  const words = title.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charCount = title.length;

  let maxPx = 42;
  let preferredVw = 3.2;

  if (longestWord >= 18 || charCount >= 46) {
    maxPx = 27;
    preferredVw = 2.4;
  } else if (longestWord >= 13 || charCount >= 34) {
    maxPx = 32;
    preferredVw = 2.7;
  } else if (longestWord >= 11 || charCount >= 24) {
    maxPx = 36;
    preferredVw = 3;
  }

  return {
    fontSize: `clamp(24px, ${preferredVw}vw, ${maxPx}px)`,
  };
}
