import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { LabelCover } from '@/components/player';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { DISC, hitDisc, layoutDisc, type DiscHit } from '@/lib/genreDisc';
import type { GenreFamily, GenreFamilyKey } from '@/lib/genreFamilies';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { originalYear } from '@/lib/releaseYear';
import { NEUTRAL_FLOOD } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

type RGB = [number, number, number];

const VINYL: RGB = [13, 12, 12];
/** Disc diameter as a share of the box, leaving room for the slice markers. */
const DISC_SHARE = 0.842;
/** How far the selected slice is drawn out, in disc units. */
const PULL = 0.038;
/** How far other records fade towards the vinyl. */
const DIM = 0.82;
/** Slice markers sit just outside the rim. */
const MARKER_RADIUS = 0.465;

interface GenreDiscProps {
  families: GenreFamily[];
  colorMap: Record<string, AlbumColorPalette> | null;
  selected: GenreFamilyKey | null;
  /** Light only the records this returns true for (a genre picked from the lists). */
  lit: ((album: Album) => boolean) | null;
  labelCover: string | null;
  labelColour: string;
  onSelect: (key: GenreFamilyKey | null) => void;
  onOpen: (album: Album) => void;
  className?: string;
}

interface Hover extends DiscHit {
  x: number;
  y: number;
}

/**
 * The collection drawn as a record: one tile per album in its sleeve colour,
 * a slice per genre family, oldest records at the rim. Picking a slice pulls
 * it out and dims the rest; hovering a tile shows the record.
 */
export function GenreDisc({
  families,
  colorMap,
  selected,
  lit,
  labelCover,
  labelColour,
  onSelect,
  onOpen,
  className,
}: GenreDiscProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);

  const layout = useMemo(() => layoutDisc(families.map(f => f.albums.length)), [families]);
  const colours = useMemo(
    () => families.map(f => f.albums.map(a => hexToRgb(colorMap?.[a.uri_release]?.flood ?? NEUTRAL_FLOOD))),
    [families, colorMap],
  );
  const litFlags = useMemo(() => (lit ? families.map(f => f.albums.map(lit)) : null), [families, lit]);
  const selectedIndex = selected ? families.findIndex(f => f.key === selected) : -1;

  // Animated values chase their targets; the last lit flags are kept so the
  // records fade back in when a genre is cleared.
  const anim = useRef({ pull: [] as number[], dim: [] as number[], lit: 0, flags: null as boolean[][] | null });
  const frame = useRef<number | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  hoverRef.current = hover;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setBox(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const grooves = useMemo(() => (box ? drawGrooves(box) : null), [box]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !box || !grooves) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box, box);
    ctx.drawImage(grooves, 0, 0, box, box);

    const c = box / 2;
    const R = (box * DISC_SHARE) / 2;
    const { pull, dim, lit: litT, flags } = anim.current;
    const gap = layout.pitch * DISC.tileGap;
    const h = ((layout.pitch - gap) / 2) * R;
    const hovered = hoverRef.current;

    layout.slices.forEach((slice, i) => {
      const sx = c + Math.cos(slice.mid) * (pull[i] ?? 0) * PULL * R;
      const sy = c + Math.sin(slice.mid) * (pull[i] ?? 0) * PULL * R;
      const sliceDim = dim[i] ?? 0;
      for (const row of slice.rows) {
        const ga = gap / 2 / row.r;
        const rr = row.r * R;
        for (let j = 0; j < row.count; j++) {
          const index = row.first + j;
          const t0 = row.start + j * row.step + ga;
          const t1 = row.start + (j + 1) * row.step - ga;
          const unlit = flags && litT > 0 && !flags[i][index] ? litT : 0;
          ctx.fillStyle = mixToVinyl(colours[i][index], Math.max(sliceDim, unlit) * DIM);
          ctx.beginPath();
          ctx.arc(sx, sy, rr + h, t0, t1);
          ctx.arc(sx, sy, rr - h, t1, t0, true);
          ctx.closePath();
          ctx.fill();
          if (hovered && hovered.slice === i && hovered.index === index) {
            ctx.save();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#fbf7ef';
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    });
  }, [box, grooves, layout, colours]);

  const animate = useCallback(() => {
    if (frame.current !== null) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      const a = anim.current;
      const targetPull = layout.slices.map((_, i) => (i === selectedIndex ? 1 : 0));
      const targetDim = layout.slices.map((_, i) => (selectedIndex >= 0 && i !== selectedIndex ? 1 : 0));
      const targetLit = litFlags ? 1 : 0;
      let moving = false;
      const step = (from: number | undefined, to: number) => {
        const v = from ?? to;
        if (reduce || Math.abs(to - v) < 0.002) return to;
        moving = true;
        return v + (to - v) * 0.16;
      };
      a.pull = targetPull.map((t, i) => step(a.pull[i], t));
      a.dim = targetDim.map((t, i) => step(a.dim[i], t));
      a.lit = step(a.lit, targetLit);
      if (litFlags) a.flags = litFlags;
      else if (a.lit === 0) a.flags = null;
      draw();
      frame.current = moving ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  }, [draw, layout, litFlags, selectedIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);
  }, [box]);

  // Restart the loop whenever a target or the drawing changes.
  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    animate();
  }, [animate, hover]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const hitAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const R = (rect.width * DISC_SHARE) / 2;
    const ux = (x - rect.width / 2) / R;
    const uy = (y - rect.height / 2) / R;
    const hit = hitDisc(layout, ux, uy, selectedIndex >= 0 ? selectedIndex : null, PULL);
    return { x, y, hit, onLabel: Math.hypot(ux, uy) <= DISC.label };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') return;
    const { x, y, hit } = hitAt(event);
    setHover(hit ? { ...hit, x, y } : null);
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const { hit, onLabel } = hitAt(event);
    if (hit) {
      const family = families[hit.slice];
      if (family.key === selected) onOpen(family.albums[hit.index]);
      else onSelect(family.key);
    } else if (onLabel && selected) {
      onSelect(null);
    }
  };

  const hovered = hover ? families[hover.slice]?.albums[hover.index] : null;
  const labelSize = DISC.label * DISC_SHARE * 100;
  const total = families.reduce((sum, f) => sum + f.albums.length, 0);

  return (
    <div ref={boxRef} className={cn('relative aspect-square w-full select-none', className)} data-genre-disc>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`The collection drawn as a record: ${total} records, one tile each in its sleeve colour, in ${families.length} genre slices. Oldest at the rim, newest by the label.`}
        className="absolute inset-0 h-full w-full touch-manipulation"
        style={{ cursor: hover ? 'pointer' : 'default' }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={onPointerUp}
      />

      <div
        className="vinyl-label pointer-events-none"
        style={{
          left: `${50 - labelSize / 2}%`,
          top: `${50 - labelSize / 2}%`,
          width: `${labelSize}%`,
          height: `${labelSize}%`,
          background: labelColour,
        }}
        aria-hidden
      >
        {labelCover && <LabelCover src={labelCover} />}
      </div>

      {layout.slices.map((slice, i) => {
        const family = families[i];
        const isSelected = family.key === selected;
        return (
          <button
            key={family.key}
            type="button"
            onClick={() => onSelect(isSelected ? null : family.key)}
            aria-pressed={isSelected}
            aria-label={`${family.code} ${family.name}, ${family.albums.length} records`}
            title={family.name}
            className={cn(
              't-mono absolute hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[12px] font-bold transition-colors sm:flex',
              isSelected
                ? 'bg-[color:var(--cream)] text-[color:var(--ground)] ring-[3px] ring-[#0e0d0c]'
                : 'bg-[#0e0d0c] text-[#fbf7ef] hover:bg-[#2a2826]',
            )}
            style={{
              left: `${50 + MARKER_RADIUS * 100 * Math.cos(slice.mid)}%`,
              top: `${50 + MARKER_RADIUS * 100 * Math.sin(slice.mid)}%`,
            }}
          >
            {family.code}
          </button>
        );
      })}

      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-10 flex w-[248px] items-center gap-3 rounded-2xl bg-[#0e0d0c] p-2.5 text-[#fbf7ef] shadow-[0_18px_40px_-14px_rgba(0,0,0,.8)]"
          style={{
            left: hover.x > box - 280 ? hover.x - 264 : hover.x + 16,
            top: Math.min(hover.y + 16, box - 90),
          }}
        >
          <img
            src={getAlbumImageFromData(hovered.uri_release, 'medium')}
            alt=""
            onError={handleImageError}
            className="h-14 w-14 shrink-0 rounded-[3px] bg-[#1c1a18] object-cover"
          />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-snug">{hovered.release_name}</div>
            <div className="truncate text-[13px] text-[#a9a39a]">{hovered.release_artist}</div>
            <div className="t-mono mt-1 truncate text-[11px] uppercase text-[#a9a39a]">
              {[originalYear(hovered), families[hover.slice].name].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The vinyl itself: body, fine grooves and a lit lead-in edge, drawn once per size. */
function drawGrooves(box: number): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box * dpr);
  canvas.height = Math.round(box * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const c = box / 2;
  const R = (box * DISC_SHARE) / 2;
  ctx.fillStyle = `rgb(${VINYL.join(',')})`;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let r = R - 4; r > R * DISC.label; r -= 3) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, R - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [232, 226, 214];
}

function mixToVinyl([r, g, b]: RGB, amount: number): string {
  if (amount <= 0) return `rgb(${r},${g},${b})`;
  const m = (from: number, to: number) => Math.round(from + (to - from) * amount);
  return `rgb(${m(r, VINYL[0])},${m(g, VINYL[1])},${m(b, VINYL[2])})`;
}
