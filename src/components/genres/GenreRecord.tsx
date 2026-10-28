import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Shuffle } from '@phosphor-icons/react';
import { PillLink } from '@/components/player';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { GenreFamily, GenreFamilyKey, TermCount } from '@/lib/genreFamilies';
import { colourSortKey, NEUTRAL_FLOOD } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

/**
 * The text and lists that go with the genre record on /genres: what the
 * record is showing (everything, one family, or one lit genre) and the
 * families listed like a record's sides.
 */

type ColourMap = Record<string, AlbumColorPalette> | null;

const nf = new Intl.NumberFormat('en-GB');

function formatYears(start: number | null, end: number | null): string {
  if (start && end) return start === end ? String(start) : `${start}–${end}`;
  return start ? `Since ${start}` : end ? `To ${end}` : 'Undated';
}

interface DetailShellProps {
  kicker: ReactNode;
  title: string;
  children?: ReactNode;
}

function DetailShell({ kicker, title, children }: DetailShellProps) {
  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="h-[1.5px] bg-[color:var(--cream-rule)]" aria-hidden />
      <div className="t-mono text-[12px] uppercase text-[color:var(--cream-dim)]">{kicker}</div>
      <h2 className="t-cond m-0 break-words text-[64px] leading-[.84] md:text-[96px] xl:text-[116px]">{title}</h2>
      {children}
    </div>
  );
}

/** Style buttons that light a genre on the record. */
function TermButtons({ terms, onLight, more }: { terms: TermCount[]; onLight: (name: string) => void; more?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {terms.map(term => (
        <button
          key={term.name}
          type="button"
          onClick={() => onLight(term.name)}
          className="pill pill-sm"
          style={{ borderColor: 'var(--cream-rule)' }}
        >
          {term.name}
          <span className="t-mono text-[12px] font-normal text-[color:var(--cream-dim)]">{nf.format(term.count)}</span>
        </button>
      ))}
      {!!more && (
        <span className="t-mono inline-flex min-h-[40px] items-center px-2 text-[12px] uppercase text-[color:var(--cream-dim)]">
          +{more} more
        </span>
      )}
    </div>
  );
}

function ArtistLine({ artists }: { artists: TermCount[] }) {
  if (!artists.length) return null;
  return (
    <p className="m-0 max-w-[620px] text-[17px] leading-relaxed">
      <span className="t-mono mr-2 text-[12px] uppercase text-[color:var(--cream-dim)]">Most collected</span>
      {artists.map((artist, i) => (
        <span key={artist.name}>
          {i > 0 && ' · '}
          {artist.name} <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{artist.count}</span>
        </span>
      ))}
    </p>
  );
}

function ActionButton({ onClick, children, quiet = false }: { onClick: () => void; children: ReactNode; quiet?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('pill', quiet && 'border-transparent underline underline-offset-4')}
      style={quiet ? undefined : { borderColor: 'var(--cream-rule)' }}
    >
      {children}
    </button>
  );
}

export function AllDetail({
  total,
  artistCount,
  yearStart,
  yearEnd,
  topTerms,
  onLight,
  onShuffle,
}: {
  total: number;
  artistCount: number;
  yearStart: number | null;
  yearEnd: number | null;
  topTerms: TermCount[];
  onLight: (name: string) => void;
  onShuffle: () => void;
}) {
  return (
    <DetailShell
      kicker={`All genres · ${nf.format(artistCount)} artists · ${formatYears(yearStart, yearEnd)}`}
      title={`${nf.format(total)} records`}
    >
      <TermButtons terms={topTerms} onLight={onLight} />
      <p className="t-mono m-0 text-[12px] uppercase text-[color:var(--cream-dim)]">Pick a slice, or point at a tile for its record</p>
      <div className="flex flex-wrap gap-2.5">
        <ActionButton onClick={onShuffle}>
          <Shuffle className="h-[18px] w-[18px]" weight="bold" aria-hidden />
          Shuffle
        </ActionButton>
      </div>
    </DetailShell>
  );
}

export function FamilyDetail({
  family,
  onLight,
  onShuffle,
  onClear,
}: {
  family: GenreFamily;
  onLight: (name: string) => void;
  onShuffle: () => void;
  onClear: () => void;
}) {
  const shown = family.styles.slice(0, 7);
  return (
    <DetailShell
      kicker={`${family.code} · ${nf.format(family.albums.length)} records · ${nf.format(family.artistCount)} artists · ${formatYears(family.yearStart, family.yearEnd)}`}
      title={family.name}
    >
      <TermButtons terms={shown} onLight={onLight} more={Math.max(0, family.styles.length - shown.length)} />
      <ArtistLine artists={family.artists.slice(0, 5)} />
      <div className="flex flex-wrap gap-2.5">
        <ActionButton onClick={onShuffle}>
          <Shuffle className="h-[18px] w-[18px]" weight="bold" aria-hidden />
          Shuffle these
        </ActionButton>
        <ActionButton onClick={onClear} quiet>
          All genres
        </ActionButton>
      </div>
    </DetailShell>
  );
}

export function LitDetail({
  name,
  path,
  count,
  artistCount,
  yearStart,
  yearEnd,
  spread,
  ink,
  flood,
  onShuffle,
  onClear,
}: {
  name: string;
  path: string;
  count: number;
  artistCount: number;
  yearStart: number | null;
  yearEnd: number | null;
  /** Lit records per family, most first. */
  spread: Array<{ family: GenreFamily; count: number }>;
  ink: string;
  flood: string;
  onShuffle: () => void;
  onClear: () => void;
}) {
  const top = spread.slice(0, 4);
  const rest = spread.slice(4).reduce((sum, s) => sum + s.count, 0);
  return (
    <DetailShell
      kicker={`Lit on the record · ${nf.format(count)} records · ${nf.format(artistCount)} artists · ${formatYears(yearStart, yearEnd)}`}
      title={name}
    >
      <p className="m-0 max-w-[620px] text-[17px] leading-relaxed">
        <span className="t-mono mr-2 text-[12px] uppercase text-[color:var(--cream-dim)]">Where it sits</span>
        {top.map((s, i) => (
          <span key={s.family.key}>
            {i > 0 && ' · '}
            {s.family.name} <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{nf.format(s.count)}</span>
          </span>
        ))}
        {rest > 0 && (
          <span>
            {' · '}elsewhere <span className="t-mono text-[12px] text-[color:var(--cream-dim)]">{nf.format(rest)}</span>
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <PillLink to={path} solid={{ background: ink, color: flood }}>
          {name} records
        </PillLink>
        <ActionButton onClick={onShuffle}>
          <Shuffle className="h-[18px] w-[18px]" weight="bold" aria-hidden />
          Shuffle
        </ActionButton>
        <ActionButton onClick={onClear} quiet>
          All genres
        </ActionButton>
      </div>
    </DetailShell>
  );
}

/** The families listed like a record's sides, each with a bar of its sleeve colours. */
export function FamilyList({
  families,
  selected,
  colorMap,
  onSelect,
}: {
  families: GenreFamily[];
  selected: GenreFamilyKey | null;
  colorMap: ColourMap;
  onSelect: (key: GenreFamilyKey | null) => void;
}) {
  const max = Math.max(1, ...families.map(f => f.albums.length));
  const sides = [
    { label: 'Side A', families: families.filter(f => f.code.startsWith('A')) },
    { label: 'Side B', families: families.filter(f => f.code.startsWith('B')) },
  ];
  return (
    <section aria-labelledby="genre-families-title" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="genre-families-title" className="t-disp m-0 text-[26px] md:text-[32px]">Families</h2>
        <span className="t-mono text-[12px] uppercase text-[color:var(--cream-dim)]">Records · colours</span>
      </div>
      {sides.map(side => (
        <div key={side.label}>
          <div className="t-mono px-3 pb-1 pt-4 text-[12px] uppercase text-[color:var(--cream-dim)]">{side.label}</div>
          <ul className="flex flex-col">
            {side.families.map(family => {
              const isSelected = family.key === selected;
              return (
                <li key={family.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : family.key)}
                    aria-pressed={isSelected}
                    className={cn(
                      'grid min-h-[48px] w-full grid-cols-[36px_minmax(0,1fr)_52px] items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2 text-left transition-colors sm:grid-cols-[40px_minmax(0,1fr)_52px_minmax(0,1.4fr)]',
                      isSelected ? 'bg-[color:var(--ground-3)]' : 'hover:bg-[color:var(--ground-2)]',
                    )}
                  >
                    <span className="t-mono text-[12px] font-bold text-[color:var(--cream-dim)]">{family.code}</span>
                    <span className={cn('truncate text-[17px]', isSelected ? 'font-bold' : 'font-semibold')}>{family.name}</span>
                    <span className="t-mono text-right text-[12px] text-[color:var(--cream-dim)]">{nf.format(family.albums.length)}</span>
                    <ColourBarcode
                      albums={family.albums}
                      colorMap={colorMap}
                      share={family.albums.length / max}
                      className="col-start-2 col-end-4 sm:col-auto"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

const BARCODE_WIDTH = 600;
const BARCODE_HEIGHT = 14;

/** A family's sleeves as stripes sorted by colour, as long as its share of the biggest family. */
function ColourBarcode({ albums, colorMap, share, className }: { albums: Album[]; colorMap: ColourMap; share: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colours = useMemo(
    () =>
      [...albums]
        .sort((a, b) => colourSortKey(colorMap?.[a.uri_release]) - colourSortKey(colorMap?.[b.uri_release]))
        .map(a => colorMap?.[a.uri_release]?.flood ?? NEUTRAL_FLOOD),
    [albums, colorMap],
  );

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BARCODE_WIDTH, BARCODE_HEIGHT);
    const width = (BARCODE_WIDTH * share) / Math.max(1, colours.length);
    colours.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(i * width, 0, width + 0.5, BARCODE_HEIGHT);
    });
  }, [colours, share]);

  return <canvas ref={ref} width={BARCODE_WIDTH} height={BARCODE_HEIGHT} className={cn('block h-3.5 w-full', className)} aria-hidden />;
}
