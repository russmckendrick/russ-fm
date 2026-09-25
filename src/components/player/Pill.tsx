import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PillLinkProps {
  to: string;
  children: ReactNode;
  /** Filled pill: pass the fill colour and its text colour. */
  solid?: { background: string; color: string };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show an arrow (internal) or an out-arrow (external). Defaults by link type. */
  arrow?: boolean;
}

const isExternal = (to: string) => /^https?:\/\//.test(to);

/** Rounded pill link. Outline by default (inherits currentColor), solid when `solid` is set. */
export function PillLink({ to, children, solid, size = 'md', className, arrow = true }: PillLinkProps) {
  const external = isExternal(to);
  const cls = cn('pill', solid && 'pill-solid', size === 'lg' && 'pill-lg', size === 'sm' && 'pill-sm', className);
  const style = solid ? { background: solid.background, color: solid.color } : undefined;
  const icon = arrow ? (external ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />) : null;

  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {children}
        {icon}
      </a>
    );
  }
  return (
    <Link to={to} className={cls} style={style}>
      {children}
      {icon}
    </Link>
  );
}
