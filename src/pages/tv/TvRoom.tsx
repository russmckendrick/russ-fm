import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getTvRoomUrl } from '@/lib/image-utils';
import { TV_ROOM_ASPECT, type TvRoom as Room } from '@/lib/tv';
import { cn } from '@/lib/utils';

interface TvRoomProps {
  room: Room;
  /** The room takes this colour (the sleeve of the video on screen). */
  tint: string;
  /**
   * Overlays for the screen (scanlines, channel number). The picture itself is
   * the site-wide TV layer, laid under this slot and the photo; see TvProvider.
   */
  screen: ReactNode;
  /** The screen element, for the TV layer to line up with. */
  slotRef?: (el: HTMLDivElement | null) => void;
  className?: string;
}

interface Geometry {
  img: { left: number; top: number; width: number; height: number };
  screen: { left: number; top: number; width: number; height: number };
}

/**
 * Size the room photo so its TV screen is a sensible size for the box, centred
 * a little above the middle, while the photo still covers the whole box.
 */
function layout(room: Room, w: number, h: number): Geometry {
  const s = room.screen;
  const target = Math.min(Math.max(w * 0.27, 250), 620, h * 0.5 * ((s.width / s.height) * TV_ROOM_ASPECT));
  const width = Math.max(target / (s.width / 100), w, h * TV_ROOM_ASPECT);
  const height = width / TV_ROOM_ASPECT;
  const cx = ((s.left + s.width / 2) / 100) * width;
  const cy = ((s.top + s.height / 2) / 100) * height;
  const left = Math.min(0, Math.max(w - width, w / 2 - cx));
  const top = Math.min(0, Math.max(h - height, h * 0.47 - cy));
  // The player overlaps the bezel a little so no room shows through at the edges.
  const bleed = 4;
  return {
    img: { left, top, width, height },
    screen: {
      left: left + (s.left / 100) * width - bleed,
      top: top + (s.top / 100) * height - bleed,
      width: (s.width / 100) * width + bleed * 2,
      height: (s.height / 100) * height + bleed * 2,
    },
  };
}

/**
 * A TV room with the video playing on its set. The room photos have the TV
 * screen cut out, and the site-wide TV layer (z-index 1) sits under the photo
 * (z-index 2), so the CRT's curved corners and bezel stay real. The room box
 * has no background of its own for the same reason. A masked colour layer tints the room (never
 * the screen) with the current sleeve's colour.
 */
export function TvRoom({ room, tint, screen, slotRef, className }: TvRoomProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = size ? layout(room, size.w, size.h) : null;
  const src = getTvRoomUrl(room.id, 'hi-res');
  const srcSet = `${getTvRoomUrl(room.id, 'medium')} 1536w, ${src} 3072w`;
  const imgBox = g ? { left: g.img.left, top: g.img.top, width: g.img.width, height: g.img.height } : undefined;
  const mask = `url(${src})`;

  return (
    <div ref={box} className={cn('relative overflow-hidden', className)}>
      {/* The screen stays mounted before the first measure, so the player inside it can attach. */}
      <div
        ref={slotRef}
        className="tv-screen-slot"
        style={
          (g
            ? {
                left: g.screen.left,
                top: g.screen.top,
                width: g.screen.width,
                height: g.screen.height,
                '--sw': `${g.screen.width}px`,
                '--sh': `${g.screen.height}px`,
              }
            : { visibility: 'hidden' }) as CSSProperties
        }
      >
        {screen}
      </div>
      {g && (
        <>
          <img
            src={src}
            srcSet={srcSet}
            sizes={`${Math.round(g.img.width)}px`}
            alt=""
            className="pointer-events-none absolute z-[2] max-w-none select-none"
            style={imgBox}
            decoding="async"
          />
          <div
            className="tv-room-tint"
            style={{ ...imgBox, background: tint, WebkitMaskImage: mask, maskImage: mask }}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
