import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

export interface CrateRecord {
  uri_release: string;
  release_name: string;
  year: string;
}

interface CrateProps {
  records: CrateRecord[];
  index: number;
  onChange: (index: number) => void;
  /** Name printed on the crate's label slot and divider tab, e.g. "BOWIE, DAVID". */
  label: string;
  tab: string;
}

/** How many records behind the front one stay visible. */
const DEPTH = 12;

/**
 * A record crate you flip through. The front record stands up, the ones
 * behind lean back with their top edges showing, the last two flipped past
 * fold forward over the lip. Scroll, click or use the arrow keys to flip.
 */
export function Crate({ records, index, onChange, label, tab }: CrateProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(420);
  const last = useRef(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize(Math.round(Math.min(420, entry.contentRect.width * 0.62)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (k: number) => onChange(Math.max(0, Math.min(records.length - 1, k)));

  const onWheel = (e: WheelEvent) => {
    const now = Date.now();
    if (now - last.current < 220 || Math.abs(e.deltaY) < 4) return;
    last.current = now;
    go(index + (e.deltaY > 0 ? 1 : -1));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(index - 1);
    }
  };

  const s = size;
  const lean = 10;
  const stepY = s * 0.026;
  const stepZ = s * 0.057;
  const stageH = s * 1.62;
  const bottom = s * 0.36;
  const left = `calc(50% - ${s / 2}px)`;

  return (
    <div ref={wrap} className="w-full">
      <div
        className="relative mx-auto w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-current"
        style={{ height: stageH, maxWidth: s * 1.7 }}
        onWheel={onWheel}
        onKeyDown={onKey}
        tabIndex={0}
        role="group"
        aria-roledescription="record crate"
        aria-label={`${records.length} records. Use the arrow keys to flip.`}
      >
        {/* Crate interior shadow */}
        <div
          className="absolute bg-black/20"
          style={{ left: `calc(50% - ${s * 0.62}px)`, width: s * 1.24, bottom, height: s * 0.9, clipPath: 'polygon(6% 0,94% 0,100% 100%,0 100%)' }}
          aria-hidden
        />
        <div className="absolute inset-0" style={{ perspective: s * 2.6, perspectiveOrigin: '50% -30%', transformStyle: 'preserve-3d' }}>
          {/* Divider card with the artist tab */}
          <div
            aria-hidden
            className="absolute rounded-sm bg-[#d8d2c4] text-[color:var(--ground)] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]"
            style={{
              left: `calc(50% - ${s * 0.45}px)`,
              width: s * 0.9,
              height: s * 1.12,
              bottom,
              transformOrigin: '50% 100%',
              transform: `translate3d(0, ${-(DEPTH + 1) * stepY}px, ${-(DEPTH + 1) * stepZ}px) rotateX(${lean}deg)`,
            }}
          >
            <span className="t-mono absolute left-6 flex h-10 items-center rounded-t-md bg-[#d8d2c4] px-4 text-[13px] font-bold" style={{ top: -38 }}>
              {tab}
            </span>
          </div>

          {records.map((r, k) => {
            const o = k - index;
            if (o < -3 || o > DEPTH + 1) return null;
            const tilt = (((k * 37) % 7) - 3) * 0.35;
            let transform: string;
            let opacity = 1;
            let shade = 0;
            if (o < -2) {
              transform = `translate3d(0, 30px, 90px) rotateX(-80deg)`;
              opacity = 0;
            } else if (o < 0) {
              transform = `translate3d(0, ${-o * 6}px, ${-o * 16}px) rotateX(${-58 - -o * 8}deg)`;
              shade = 0.35 + -o * 0.15;
            } else if (o === 0) {
              transform = `translate3d(0,0,0) rotateX(${lean - 4}deg)`;
            } else if (o <= DEPTH) {
              transform = `translate3d(0, ${-o * stepY}px, ${-o * stepZ}px) rotateX(${lean}deg) rotateZ(${tilt}deg)`;
              shade = Math.min(0.62, 0.12 + o * 0.045);
            } else {
              transform = `translate3d(0, ${-DEPTH * stepY}px, ${-DEPTH * stepZ}px) rotateX(${lean}deg)`;
              opacity = 0;
            }
            const interactive = o >= 0 && o <= DEPTH;
            return (
              <button
                key={r.uri_release}
                type="button"
                tabIndex={-1}
                aria-hidden={!interactive}
                onClick={() => go(o === 0 ? k + 1 : k)}
                className={cn('group absolute origin-bottom transition-[transform,opacity] duration-[800ms] ease-[cubic-bezier(.2,.8,.2,1)]', !interactive && 'pointer-events-none')}
                style={{ left, bottom, width: s, height: s, transform, opacity, zIndex: 100 - Math.abs(o) }}
              >
                <span
                  className={cn(
                    'absolute inset-0 bg-[#111] shadow-[0_-2px_0_rgba(255,255,255,.14)_inset,0_-26px_34px_-18px_rgba(0,0,0,.55)] transition-transform duration-300',
                    o > 0 && 'group-hover:-translate-y-10',
                  )}
                >
                  <img
                    src={getAlbumImageFromData(r.uri_release, Math.abs(o) <= 1 ? 'hi-res' : 'medium')}
                    alt=""
                    loading={Math.abs(o) <= 4 ? 'eager' : 'lazy'}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black transition-opacity duration-500" style={{ opacity: shade }} />
                  <span className="absolute inset-x-0 top-0 h-[3px] bg-white/30" />
                </span>
              </button>
            );
          })}
        </div>

        {/* Crate front */}
        <div
          className="absolute flex flex-col items-center justify-center gap-4 rounded-b-xl rounded-t bg-[#211d19] text-[#cfc8bc] shadow-[0_34px_50px_-24px_rgba(0,0,0,.7),inset_0_3px_0_rgba(255,255,255,.1),inset_0_-8px_0_rgba(0,0,0,.25)]"
          style={{ left: `calc(50% - ${s * 0.72}px)`, width: s * 1.44, bottom: s * 0.06, height: s * 0.42, zIndex: 200 }}
        >
          <span className="absolute -left-2.5 -right-2.5 -top-2 h-3.5 rounded bg-[#2b2621] shadow-[0_2px_0_rgba(0,0,0,.35)]" aria-hidden />
          <span className="h-[18%] w-[34%] rounded-full bg-[#0c0b0a] shadow-[inset_0_4px_8px_rgba(0,0,0,.8),0_1px_0_rgba(255,255,255,.08)]" aria-hidden />
          <span className="t-mono flex items-center gap-3 rounded-sm bg-[#f1ece2] px-3.5 py-2 text-[11px] text-[#0e0d0c] shadow-[inset_0_0_0_2px_#9d968a] md:text-[12px]">
            <span className="font-bold tracking-[.08em]">{label}</span>
            <span>
              {String(index + 1).padStart(2, '0')} / {records.length}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
