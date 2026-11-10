import type { CSSProperties } from 'react';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

interface RunDividerProps {
  /** A letter, a month, a decade (src/lib/runs.ts). */
  label: string;
  /** Small under the label: the year of a month, where a decade ends. */
  year?: string;
  count: number;
  /** Extra classes on the grid cell (e.g. `col-start-1` so the divider opens a row). */
  className?: string;
  /** What `count` counts, singular and plural. */
  unit?: [string, string];
  /**
   * Up to three records from the run (their `uri_release`), filed behind the
   * card with their tops showing, as in the home page's genre bins. They
   * rise a little on hover. /albums passes them; the records may also be on
   * the shelf beside it.
   */
  sleeves?: string[];
}

/**
 * A rack divider leading each run in a grid (a letter in A–Z, a month in
 * Latest added, a decade by year): a card as wide as a tile's picture and as
 * tall as the whole tile, with a tab on top, the label large and the run's
 * count below, on scuffed card stock (`.run-divider-card` in player.css).
 * /artists and /albums file their grids with it.
 */
export function RunDivider({ label, year, count, unit = ['artist', 'artists'], sleeves, className }: RunDividerProps) {
  const countLabel = `${count.toLocaleString('en-GB')} ${count === 1 ? unit[0] : unit[1]}`;
  const filed = (sleeves ?? []).slice(0, 3);
  return (
    <div className={cn('flex min-w-0 flex-col p-2', filed.length ? 'run-divider-filed pt-[22%]' : 'pt-5', className)}>
      <div className="relative min-h-full flex-1 [container-type:inline-size]">
        {filed.length > 0 && (
          <span className="run-divider-sleeves" aria-hidden>
            {filed.map((uri, i) => (
              <img key={uri} src={getAlbumImageFromData(uri, 'medium')} alt="" loading="lazy" decoding="async" onError={handleImageError} style={{ '--i': i } as CSSProperties} />
            ))}
          </span>
        )}
        <span aria-hidden className="run-divider-tab absolute -top-3 left-[12%] z-[1] h-6 w-2/5 rounded-t-xl" />
        <div className="run-divider-card absolute inset-0 z-[1] flex flex-col justify-between rounded-2xl p-[9cqw] text-[color:var(--ground)]">
          <h2 className={cn('t-disp m-0 leading-[0.8]', label.length === 1 ? 'text-[78cqw]' : label.length <= 3 ? 'text-[31cqw]' : 'text-[25cqw]')}>
            {label}
            {year && <span className="mt-[4cqw] block text-[20cqw] opacity-60">{year}</span>}
          </h2>
          <span className="t-mono text-[11px] font-bold uppercase md:text-[12px]">{countLabel}</span>
        </div>
      </div>
    </div>
  );
}
