import { cn } from '@/lib/utils';

interface RunDividerProps {
  /** A letter, a month, a decade (src/lib/runs.ts). */
  label: string;
  /** Small under the label: the year of a month, where a decade ends. */
  year?: string;
  count: number;
  /** What `count` counts, singular and plural. */
  unit?: [string, string];
}

/**
 * A rack divider leading each run in a grid (a letter in A–Z, a month in
 * Latest added, a decade by year): a card as wide as a tile's picture and as
 * tall as the whole tile, with a tab on top, the label large and the run's
 * count below. /artists and /albums file their grids with it.
 */
export function RunDivider({ label, year, count, unit = ['artist', 'artists'] }: RunDividerProps) {
  const countLabel = `${count.toLocaleString('en-GB')} ${count === 1 ? unit[0] : unit[1]}`;
  return (
    <div className="flex min-w-0 flex-col p-2 pt-5">
      <div className="relative min-h-full flex-1 [container-type:inline-size]">
        <span aria-hidden className="absolute -top-3 left-[12%] h-6 w-2/5 rounded-t-xl bg-[var(--cream)]" />
        <div className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-[var(--cream)] p-[9cqw] text-[color:var(--ground)]">
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
