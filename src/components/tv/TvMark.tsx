import { useState } from 'react';

interface TvMarkProps {
  size: number;
  /** Sleeve on the screen (the page's cover), if there is one. */
  cover?: string | null;
  /** Screen colour without a cover (or while it loads). */
  screen: string;
}

/**
 * The logo on the TV pages: a little CRT in the header's text colour with
 * the current sleeve on its screen, in place of the spinning record.
 */
export function TvMark({ size, cover, screen }: TvMarkProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = cover && failed !== cover;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 44 44" width={size} height={size} fill="none" className="absolute inset-0">
        <path d="M15 3.5 22 10.5 29 3.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="1.5" y="10.5" width="41" height="31" rx="7" fill="currentColor" />
        <circle cx="36.5" cy="19" r="2.1" fill={screen} />
        <circle cx="36.5" cy="26.5" r="2.1" fill={screen} />
        <rect x="33.5" y="32" width="6" height="2.4" rx="1.2" fill={screen} />
      </svg>
      <span
        className="absolute overflow-hidden"
        style={{
          left: `${(5.5 / 44) * 100}%`,
          top: `${(14.5 / 44) * 100}%`,
          width: `${(25 / 44) * 100}%`,
          height: `${(23 / 44) * 100}%`,
          borderRadius: '22% / 26%',
          background: screen,
        }}
      >
        {show && (
          <img
            key={cover}
            src={cover}
            alt=""
            className="tv-mark-screen h-full w-full object-cover"
            onError={() => setFailed(cover)}
          />
        )}
      </span>
    </span>
  );
}
