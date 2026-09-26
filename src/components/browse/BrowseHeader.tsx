import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sleeve } from '@/components/player';
import { getAlbumImageFromData } from '@/lib/image-utils';
import type { Flood } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';
import { heroTitleStyle } from './facetSleeves';

export type BrowseSection = 'genres' | 'labels' | 'decades' | 'countries';

const SECTIONS: Array<{ key: BrowseSection; label: string; to: string }> = [
  { key: 'genres', label: 'Genres', to: '/genres' },
  { key: 'labels', label: 'Labels', to: '/labels' },
  { key: 'decades', label: 'Decades', to: '/decades' },
  { key: 'countries', label: 'Countries', to: '/countries' },
];

interface BrowseHeaderProps {
  title: string;
  /** Dim mono note beside the title, usually the count. */
  note?: ReactNode;
  /** Highlights the matching browse pill. `null` shows the pills with none active. */
  current?: BrowseSection | null;
  /** Hide the section pills entirely. */
  hidePills?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Header for browse pages: a big `t-disp` title with the count in dim type
 * beside it, then pills for switching between the browse sections.
 */
export function BrowseHeader({ title, note, current = null, hidePills = false, className, children }: BrowseHeaderProps) {
  return (
    <header className={cn('mb-10 md:mb-14', className)}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <h1 className="t-disp m-0 break-words text-[48px] md:text-[80px] lg:text-[112px]">{title}</h1>
        {note && <span className="t-mono text-[14px] text-[color:var(--cream-dim)] md:text-[16px]">{note}</span>}
      </div>
      {!hidePills && (
        <nav aria-label="Browse by" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(section => {
            const active = section.key === current;
            return (
              <Link
                key={section.key}
                to={section.to}
                aria-current={active ? 'page' : undefined}
                className={cn('pill pill-sm', active && 'pill-solid')}
                style={active ? { background: 'var(--cream)', color: 'var(--ground)' } : { color: 'var(--cream)', borderColor: 'var(--cream-rule)' }}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </header>
  );
}

type FanAlbum = Pick<Album, 'uri_release' | 'release_name' | 'release_artist'>;

/** Where each sleeve sits: centre first, then alternating left/right. */
const FAN_SLOTS = [0, -1, 1, -2, 2];

interface FacetFanProps {
  /** Lead sleeve first; up to five are shown. */
  albums: FanAlbum[];
  /** Each sleeve links to its album page (don't use inside another link). */
  linked?: boolean;
  /** Load the lead sleeve at hi-res (heroes). */
  large?: boolean;
  className?: string;
}

/**
 * A fan of sleeves, lead record in front. Spreads a little further when the
 * surrounding `.group` is hovered. Images are decorative: linked sleeves carry
 * an aria-label, and unlinked fans sit inside a labelled card.
 */
export function FacetFan({ albums, linked = false, large = false, className }: FacetFanProps) {
  const shown = albums.slice(0, FAN_SLOTS.length);
  if (!shown.length) return null;
  const spread = shown.length > 1 ? 1 : 0;

  return (
    <div className={cn('relative aspect-[5/4] w-full', className)}>
      {shown
        .map((album, i) => ({ album, i, slot: FAN_SLOTS[i] * spread }))
        .sort((a, b) => Math.abs(b.slot) - Math.abs(a.slot))
        .map(({ album, i, slot }) => {
          const style = {
            '--x': `${slot * 16}%`,
            '--x2': `${slot * 22}%`,
            '--r': `${slot * 6}deg`,
            '--r2': `${slot * 9}deg`,
            '--y': `${Math.abs(slot) * 4}%`,
            zIndex: 10 - Math.abs(slot),
          } as CSSProperties;
          const title = album.release_name.trim();
          const src = getAlbumImageFromData(album.uri_release, large && i === 0 ? 'hi-res' : 'medium');
          const cls =
            'absolute left-[20%] top-[6%] block w-[60%] origin-bottom [transform:translateX(var(--x))_translateY(var(--y))_rotate(var(--r))] motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)] group-hover:[transform:translateX(var(--x2))_translateY(var(--y))_rotate(var(--r2))]';
          const sleeve = (
            <Sleeve
              src={src}
              alt=""
              loading={large && i === 0 ? 'eager' : 'lazy'}
              shrinkwrap={i === 0}
              className="aspect-square w-full"
            />
          );
          return linked ? (
            <Link
              key={album.uri_release}
              to={album.uri_release}
              className={cn(cls, 'focus-visible:z-20')}
              style={style}
              aria-label={`${title} by ${album.release_artist}`}
            >
              {sleeve}
            </Link>
          ) : (
            <div key={album.uri_release} className={cls} style={style}>
              {sleeve}
            </div>
          );
        })}
    </div>
  );
}

interface FacetCardProps {
  to: string;
  title: string;
  /** Mono line, e.g. "412 records". */
  meta?: ReactNode;
  flood: Flood;
  albums: FanAlbum[];
  className?: string;
  /** Title size: `lg` for the four browse sections, `md` for facet values. */
  size?: 'lg' | 'md';
}

/** A facet as a colour card: the representative sleeve's flood with a fan of covers. */
export function FacetCard({ to, title, meta, flood, albums, className, size = 'md' }: FacetCardProps) {
  const { condensed } = heroTitleStyle(title);
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl p-5 transition-transform duration-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0 md:p-6',
        className,
      )}
      style={{ background: flood.flood, color: flood.ink }}
    >
      <FacetFan albums={albums} className={size === 'lg' ? 'mx-auto max-w-[420px]' : 'mx-auto max-w-[320px]'} />
      <div className="mt-4 flex min-w-0 flex-col gap-2">
        <span
          className={cn(
            condensed ? 't-cond' : 't-disp',
            'break-words',
            size === 'lg' ? 'text-[40px] md:text-[56px]' : condensed ? 'text-[34px] md:text-[40px]' : 'text-[26px] md:text-[32px]',
          )}
        >
          {title}
        </span>
        {meta && (
          <span className="t-mono text-[12px] uppercase" style={{ color: flood.sub }}>
            {meta}
          </span>
        )}
      </div>
    </Link>
  );
}
