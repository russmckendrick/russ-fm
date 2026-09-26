import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface YearSelectorProps {
  currentYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Year picker styled as a pill. A native <select> sits invisibly over the
 * pill so keyboard, screen reader and phone pickers all work as normal.
 */
export function YearSelector({ currentYear, availableYears, onYearChange, className, style }: YearSelectorProps) {
  const thisYear = new Date().getFullYear();
  return (
    <label
      className={cn(
        'pill relative cursor-pointer focus-within:ring-2 focus-within:ring-current focus-within:ring-offset-2 focus-within:ring-offset-transparent',
        className,
      )}
      style={style}
    >
      <span className="t-mono" aria-hidden>
        {currentYear}
        {currentYear === thisYear ? ' · YTD' : ''}
      </span>
      <ChevronDown className="h-4 w-4" aria-hidden />
      <select
        value={String(currentYear)}
        onChange={e => onYearChange(parseInt(e.target.value, 10))}
        aria-label="Choose a year"
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        style={{ colorScheme: 'dark' }}
      >
        {!availableYears.includes(currentYear) && <option value={currentYear}>{currentYear}</option>}
        {availableYears.map(year => (
          <option key={year} value={year}>
            {year}
            {year === thisYear ? ' (year to date)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
