import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getIndexHeaderUrl } from '@/lib/image-utils';
import { indexRoom, type IndexRoomId } from '@/lib/indexHeaders';
import { cn } from '@/lib/utils';

interface IndexRoomProps {
  room: IndexRoomId;
  /** What shows through slot `i` (left to right), given the slot's size in px; null leaves it out. */
  renderSlot: (i: number, size: { width: number; height: number }) => ReactNode;
  /** Extra classes on each slot's box (e.g. `artist-poster`). */
  slotClassName?: string;
  /** What sits over the photo at slot `i` (a tag hung under a sleeve on /stats); boxed like the slot but not clipped. */
  renderOver?: (i: number) => ReactNode;
  /** The page's flood: a colour layer over the whole photo, slots too. */
  tint: string;
  /** Pixels at the top covered by the see-through header (its height by default); the row centres below them. */
  topInset?: number;
  className?: string;
}

/**
 * The /albums, /artists and /stats headers: a Codex photo with a row of slots cut out
 * of it (scripts/process-index-headers.py) — sleeves on a record-shop ledge,
 * posters on a fly-posting wall, record shelving on /stats — after the album room and the artist poster
 * wall. Under the photo sit whatever shows through each slot and the photo's
 * own light on them (the shade layer, multiplied). It shares the artist
 * wall's layer, shade, photo and tint styles (player.css).
 */
export function IndexRoom({ room, renderSlot, slotClassName, renderOver, tint, topInset, className }: IndexRoomProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // The photo shows once it has decoded, so the slots never show without it.
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const meta = indexRoom(room);
  const src = getIndexHeaderUrl(room, 'hi-res');
  const medium = getIndexHeaderUrl(room, 'medium');
  // Slots run 3px under the cut-out's edge so no seam of the ground shows.
  const bleed = 3;

  let g: { img: { left: number; top: number; width: number; height: number }; slots: CSSProperties[]; px: { width: number; height: number }[] } | null = null;
  if (size) {
    // The sticky header: 64px, 84px from md.
    const inset = topInset ?? (size.w >= 768 ? 84 : 64);
    // Cover the box (a little over), the row centred across and in what the header leaves.
    const width = Math.max(size.w, size.h * meta.aspect) * 1.02;
    const height = width / meta.aspect;
    const rowLeft = Math.min(...meta.slots.map(s => s.left)), rowRight = Math.max(...meta.slots.map(s => s.left + s.width));
    const rowTop = Math.min(...meta.slots.map(s => s.top)), rowBottom = Math.max(...meta.slots.map(s => s.top + s.height));
    const left = Math.min(0, Math.max(size.w - width, size.w / 2 - ((rowLeft + rowRight) / 200) * width));
    const top = Math.min(0, Math.max(size.h - height, inset + (size.h - inset) / 2 - ((rowTop + rowBottom) / 200) * height));
    const px = meta.slots.map(s => ({ width: (s.width / 100) * width + bleed * 2, height: (s.height / 100) * height + bleed * 2 }));
    g = {
      img: { left, top, width, height },
      px,
      slots: meta.slots.map((s, i) => ({
        left: left + (s.left / 100) * width - bleed,
        top: top + (s.top / 100) * height - bleed,
        width: px[i].width,
        height: px[i].height,
        '--u': `${px[i].width / 100}px`,
      }) as CSSProperties),
    };
  }

  return (
    <div ref={box} className={cn('artist-wall relative overflow-hidden', className)}>
      {g && (
        <div className={cn('artist-wall-layer', loaded && 'is-on')}>
          {g.slots.map((style, i) => {
            const slot = renderSlot(i, g.px[i]);
            return slot ? (
              <div key={i} className={cn('index-room-slot', slotClassName)} style={style}>
                {slot}
              </div>
            ) : null;
          })}
          <div className="artist-wall-shade" aria-hidden style={{ ...g.img, backgroundImage: `url(${getIndexHeaderUrl(room, 'shade')})` }} />
          <img
            src={src}
            srcSet={`${medium} 3072w, ${src} 4608w`}
            sizes={`${Math.round(g.img.width)}px`}
            alt=""
            className="artist-wall-photo"
            style={g.img}
            decoding="async"
            onLoad={e =>
              // Wait for the decode too: a big photo can be loaded but not yet painted.
              e.currentTarget
                .decode()
                .catch(() => {})
                .then(() => setLoaded(true))
            }
          />
          <div className="artist-wall-tint" aria-hidden style={{ ...g.img, background: tint }} />
          {renderOver &&
            g.slots.map((style, i) => {
              const over = renderOver(i);
              return over ? (
                <div key={i} className="index-room-over" style={style}>
                  {over}
                </div>
              ) : null;
            })}
        </div>
      )}
    </div>
  );
}
