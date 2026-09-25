import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  title: ReactNode;
  /** Small mono note after the title, e.g. "184 added in 2026". */
  note?: ReactNode;
  link?: { to: string; label: string };
  as?: 'h1' | 'h2' | 'h3';
  size?: 'lg' | 'md' | 'sm';
  className?: string;
  children?: ReactNode;
}

/** Plain, big section title — no taglines. Optional note and "see all" link. */
export function SectionHeading({ title, note, link, as: Tag = 'h2', size = 'md', className, children }: SectionHeadingProps) {
  const fontSize =
    size === 'lg' ? 'text-[44px] md:text-[64px] lg:text-[96px]' : size === 'sm' ? 'text-[26px] md:text-[32px]' : 'text-[34px] md:text-[48px] lg:text-[56px]';
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-6 gap-y-2', className)}>
      <Tag className={cn('t-disp m-0', fontSize)}>{title}</Tag>
      {note && <span className="t-mono flex-1 text-[13px] text-[color:var(--cream-dim)]">{note}</span>}
      {!note && <span className="flex-1" />}
      {children}
      {link && (
        <Link to={link.to} className="inline-flex items-center gap-2 font-bold hover:underline">
          {link.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
