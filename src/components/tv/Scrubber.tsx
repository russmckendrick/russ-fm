import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDuration } from '@/lib/tv';
import { cn } from '@/lib/utils';

interface ScrubberProps {
  /** Seconds played. */
  elapsed: number;
  /** Length in seconds. */
  duration: number;
  onSeek: (seconds: number) => void;
  className?: string;
}

/**
 * The TV's progress line as a scrubber: a white line on a dark track along the
 * top edge of a bar. Click or drag anywhere on it (the hit area is taller than
 * the line) to jump; the line thickens and a knob shows on hover, and a time
 * bubble follows the drag. Keyboard: arrows ±5s, Page Up/Down ±30s, Home/End.
 */
export function Scrubber({ elapsed, duration, onSeek, className }: ScrubberProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const total = Math.max(1, duration);
  const value = Math.min(total, Math.max(0, drag ?? elapsed));
  const pct = (value / total) * 100;

  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total;
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(at(e.clientX));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(at(e.clientX));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const to = at(e.clientX);
    setDrag(null);
    onSeek(to);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[e.key];
    let to: number | null = step !== undefined ? value + step : null;
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = total - 1;
    if (to === null) return;
    e.preventDefault();
    onSeek(Math.min(total, Math.max(0, to)));
  };

  return (
    <div
      ref={ref}
      className={cn('tv-scrub', className)}
      data-drag={drag !== null ? '' : undefined}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${formatDuration(value)} of ${formatDuration(total)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={key}
    >
      <div className="tv-scrub-track">
        <div className="tv-scrub-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="tv-scrub-knob" style={{ left: `${pct}%` }} />
      {drag !== null && (
        <div className="tv-scrub-time t-mono" style={{ left: `${pct}%` }}>
          {formatDuration(value)}
        </div>
      )}
    </div>
  );
}
