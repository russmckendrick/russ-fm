import { cn } from '@/lib/utils';

interface StickerProps {
  /** ISO date (or anything Date can parse). */
  date: string;
  label?: string;
  /** Bottom line; defaults to the year. */
  footer?: string;
  background: string;
  color: string;
  size?: 'lg' | 'sm';
  className?: string;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Round shop sticker slapped on the sleeve: "Added 25 SEP 2026". */
export function Sticker({ date, label = 'Added', footer, background, color, size = 'lg', className }: StickerProps) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const lg = size === 'lg';
  return (
    <div
      className={cn('sticker', lg ? 'h-[128px] w-[128px]' : 'h-[92px] w-[92px]', className)}
      style={{ background, color }}
      aria-label={`${label} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
      role="img"
    >
      <span className="t-mono font-bold" style={{ fontSize: lg ? 11 : 9, letterSpacing: '0.12em' }}>
        {label.toUpperCase()}
      </span>
      <span className="t-cond" style={{ fontSize: lg ? 40 : 28, lineHeight: 0.9 }}>
        {dayMonth}
      </span>
      <span className="t-mono font-bold" style={{ fontSize: lg ? 11 : 9 }}>
        {footer ?? d.getFullYear()}
      </span>
    </div>
  );
}
