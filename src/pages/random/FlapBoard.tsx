import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { YEAR_TILES, randomGlyph, type FlapLayout } from '@/lib/splitFlap';

interface FlapBoardProps {
  layout: FlapLayout;
  /** Every tile's final character, from `boardFor()`. */
  cells: string[];
  /** Called once the last tile has stopped. */
  onSettled: () => void;
  reducedMotion: boolean;
  tickMs: number;
  /** Colour of the year and genre letters (the record's glow). */
  accent: string;
  /** Colour of the row labels (the page's secondary ink). */
  labelColour: string;
  artist: string;
  artistHref: string;
  title: string;
  albumHref: string;
}

interface BoardState {
  chars: string[];
  moving: boolean[];
}

/**
 * Tiles flip to `cells`, cascading left to right and top to bottom. Tiles
 * that are blank before and after stay still, like a real departures board.
 */
function useFlaps(cells: string[], cols: number, tickMs: number, reducedMotion: boolean, onSettled: () => void) {
  // Every cell is a single code point, so the joined string round-trips.
  const key = cells.join('');
  const [board, setBoard] = useState<BoardState>(() => ({ chars: cells.map(() => ' '), moving: [] }));
  const charsRef = useRef(board.chars);
  const settledRef = useRef(onSettled);

  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    const goal = Array.from(key);
    const from = charsRef.current.length === goal.length ? charsRef.current : goal.map(() => ' ');
    const stopAt = goal.map((g, i) =>
      reducedMotion || (g === ' ' && from[i] === ' ')
        ? 0
        : 3 + (i % cols) + Math.floor(i / cols) * 2 + Math.floor(Math.random() * 4),
    );
    const last = Math.max(0, ...stopAt);
    let tick = 0;

    const id = window.setInterval(() => {
      tick += 1;
      const moving: boolean[] = [];
      const chars = goal.map((g, i) => {
        if (tick >= stopAt[i]) return g;
        moving[i] = true;
        return randomGlyph();
      });
      charsRef.current = chars;
      setBoard({ chars, moving });
      if (tick >= last) {
        window.clearInterval(id);
        settledRef.current();
      }
    }, reducedMotion ? 0 : tickMs);

    return () => window.clearInterval(id);
  }, [key, cols, tickMs, reducedMotion]);

  return board;
}

/** The Shuffle page's departures board: artist, title, then year and genre. */
export function FlapBoard({
  layout,
  cells,
  onSettled,
  reducedMotion,
  tickMs,
  accent,
  labelColour,
  artist,
  artistHref,
  title,
  albumHref,
}: FlapBoardProps) {
  const { cols, artistRows, titleRows } = layout;
  const { chars, moving } = useFlaps(cells, cols, tickMs, reducedMotion, onSettled);

  const rows = (fromRow: number, count: number, accentFrom = Infinity) =>
    Array.from({ length: count }, (_, r) => {
      const start = (fromRow + r) * cols;
      return (
        <div key={r} className="flap-row" aria-hidden>
          {chars.slice(start, start + cols).map((ch, c) => {
            const i = start + c;
            return (
              <span key={c} className={cn('flap', moving[i] && 'flap-moving')}>
                <span style={c >= accentFrom && !moving[i] ? { color: accent } : undefined}>{ch === ' ' ? '' : ch}</span>
              </span>
            );
          })}
        </div>
      );
    });

  const labelStyle: CSSProperties = { color: labelColour };

  return (
    <div className="flap-wrap" style={{ '--cols': cols } as CSSProperties}>
      <div className="flap-board">
        <BoardLabel style={labelStyle}>Artist</BoardLabel>
        <Link to={artistHref} aria-label={artist} className="flap-link">
          {rows(0, artistRows)}
        </Link>
        <BoardLabel style={labelStyle} className="mt-[calc(var(--flap-gap)*3)]">
          Title
        </BoardLabel>
        <Link to={albumHref} aria-label={title} className="flap-link">
          {rows(artistRows, titleRows)}
        </Link>
        <div className="mt-[calc(var(--flap-gap)*3)] flex">
          <BoardLabel style={{ ...labelStyle, width: `calc(100% / ${cols} * ${YEAR_TILES + 1})` }}>Year</BoardLabel>
          <BoardLabel style={labelStyle}>Genre</BoardLabel>
        </div>
        {rows(artistRows + titleRows, 1, 0)}
      </div>
    </div>
  );
}

function BoardLabel({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <span className={cn('t-kicker mb-1 block', className)} style={style} aria-hidden>
      {children}
    </span>
  );
}
