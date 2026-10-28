import { useEffect, useRef, useState, type RefObject } from 'react';
import { GalaxyScene, type Insets } from '@/lib/explore/galaxyScene';
import type { GalaxyPrep } from '@/lib/explore/galaxyLayout';
import type { ExploreData } from '@/lib/explore/types';
import './galaxy.css';

export interface GalaxyHandle {
  flyHome(): void;
  flyToFamily(family: number): void;
}

export interface GalaxyCanvasProps {
  data: ExploreData;
  prep: GalaxyPrep;
  positions: Float32Array;
  /** The focused artist, or null. */
  focus: number | null;
  /** The link travelled to reach `focus` (index into prep.links), or -1. */
  link: number;
  reducedMotion: boolean;
  insets: Insets;
  /** Dark swatch to tint the sky with, or null. */
  ground: string | null;
  onSelect: (artist: number) => void;
  onOpenAlbum: (album: number) => void;
  onFamily: (family: number) => void;
  onInteract: () => void;
  onReady?: () => void;
  handle: RefObject<GalaxyHandle | null>;
}

/**
 * The WebGL map. Lazy-loaded by the page so Three.js is only fetched on
 * /explore. Creates the scene once and passes focus, insets and motion
 * settings through as they change.
 */
export default function GalaxyCanvas(props: GalaxyCanvasProps) {
  const { data, prep, positions, focus, link, reducedMotion, insets, ground, handle } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GalaxyScene | null>(null);
  const cb = useRef(props);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    cb.current = props;
  });

  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    let scene: GalaxyScene;
    try {
      scene = new GalaxyScene({
        canvas: canvasRef.current,
        overlay: overlayRef.current,
        data,
        prep,
        positions,
        reducedMotion: cb.current.reducedMotion,
        onSelect: artist => cb.current.onSelect(artist),
        onOpenAlbum: album => cb.current.onOpenAlbum(album),
        onFamily: family => cb.current.onFamily(family),
        onInteract: () => cb.current.onInteract(),
      });
    } catch (err) {
      console.error('The Galaxy could not start WebGL:', err);
      setFailed(true);
      cb.current.onReady?.();
      return;
    }
    sceneRef.current = scene;
    handle.current = { flyHome: () => scene.flyHome(), flyToFamily: k => scene.flyToFamily(k) };
    cb.current.onReady?.();
    return () => {
      scene.dispose();
      sceneRef.current = null;
      handle.current = null;
    };
  }, [data, prep, positions, handle]);

  useEffect(() => {
    sceneRef.current?.setFocus(focus, { link });
  }, [focus, link]);
  useEffect(() => sceneRef.current?.setInsets(insets), [insets]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);
  useEffect(() => sceneRef.current?.setGround(ground), [ground]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
        <p className="max-w-[420px] text-[15px] text-[color:var(--cream-dim)]">
          The map needs WebGL, which this browser has turned off. Search for an artist to see their details and connections.
        </p>
      </div>
    );
  }
  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none outline-none"
        aria-label="A 3D map of every artist in the collection, grouped by genre family. Use the search box or the connection lists to move between artists."
      />
      <div ref={overlayRef} className="gx-overlay" />
    </>
  );
}
