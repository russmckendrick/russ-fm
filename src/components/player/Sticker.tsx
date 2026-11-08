import { cn } from '@/lib/utils';

interface StickerProps {
  /** ISO date (or anything Date can parse). */
  date: string;
  label?: string;
  /** Bottom line; defaults to the year. */
  footer?: string;
  /** The dark of the record (its ground): small print, and the date when `color` is too pale. */
  background: string;
  /** The record's colour (its flood): the date, printed big. */
  color: string;
  size?: 'lg' | 'sm';
  className?: string;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * A price-gun label on the sleeve's shrink-wrap: "ADDED / 8 NOV 26" printed
 * in mono on a small white label with the gun's notched ends, a little
 * crooked (`.sticker` in player.css). Callers place it inside the sleeve's
 * top-right corner. `footer` (the "Scrobbled" one's track count) joins the
 * top line; `background` and `color` are kept for callers but not printed.
 */
export function Sticker({ date, label = 'Added', footer, size = 'lg', className }: StickerProps) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const printed = `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  const lg = size === 'lg';
  return (
    <div
      className={cn('sticker t-mono', lg ? 'sticker-lg' : 'sticker-sm', className)}
      aria-label={`${label} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${footer ? `, ${footer}` : ''}`}
      role="img"
    >
      <span className="sticker-top">{footer ? `${label} · ${footer}` : label}</span>
      <span className="sticker-price">{printed}</span>
    </div>
  );
}
