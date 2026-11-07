import { useId } from 'react';
import { labelNames, titleLines } from '@/lib/releaseLabel';

interface ReleaseLabelProps {
  /** The record companies, as Discogs lists them; the first is arced over the top. */
  labels: string[];
  artist: string;
  title: string;
  /** Arced under the bottom: the format line (Vinyl · Oxblood · 2 discs · 4 sides). */
  format?: string;
  /** Printed below the spindle hole, key on the left and value on the right. */
  facts: Array<[string, string]>;
  /** The label's paper: the sleeve's flood colour. */
  paper: string;
  /** The ink on it. */
  ink: string;
}

// Rough glyph widths, in em, to tell when a line needs squeezing to fit.
const MONO_EM = 0.6;
const COND_EM = 0.42;
const DISP_EM = 0.62;
const MAX_FACTS = 5;

/** `textLength` to squeeze a line into `max` units when it would run over; otherwise none. */
const fit = (text: string, size: number, em: number, spacing: number, max: number) => {
  const width = text.length * (size * em + spacing);
  return width > max ? { textLength: max, lengthAdjust: 'spacingAndGlyphs' as const } : {};
};

/** The width free across the label's middle at a line whose glyphs reach up to `top` (below the top arc). */
const room = (top: number, bottom: number) => {
  const y = Math.max(Math.abs(top), Math.abs(bottom));
  return 2 * Math.sqrt(Math.max(0, 66 * 66 - y * y)) - 8;
};

/**
 * The album page's release details, printed on a record's centre label: the record
 * company arced over the top, artist and title above the spindle hole, the facts below
 * it, and the format arced under the bottom. Long lines are squeezed to fit, not cut.
 * The SVG is decoration; the same details are in a visually hidden list.
 */
export function ReleaseLabel({ labels, artist, title, format, facts, paper, ink }: ReleaseLabelProps) {
  const id = useId().replace(/:/g, '');
  const names = labelNames(labels);
  const label = names[0];
  const lines = titleLines(title.toUpperCase());
  // The title's last line sits just above the hole; the artist heads the stack.
  const lineY = (i: number) => -20 - (lines.length - 1 - i) * 9.5;
  const artistY = lineY(0) - 13;
  const shown = facts.slice(0, MAX_FACTS);
  // The facts sit under the hole, spaced to fill the room above the bottom arc.
  const step = shown.length > 4 ? 10 : 11.5;
  const top = 16;
  const mono = { fontFamily: 'var(--font-mono)', fontWeight: 700 };

  return (
    <div className="release-label">
      <svg viewBox="-100 -100 200 200" className="block h-auto w-full max-w-[340px]" aria-hidden>
        <defs>
          <radialGradient id={`${id}-paper`} cx="0.42" cy="0.36" r="0.75">
            <stop offset="0" stopColor={ink} stopOpacity="0.1" />
            <stop offset="1" stopColor={ink} stopOpacity="0" />
          </radialGradient>
          <path id={`${id}-top`} d="M -76 0 A 76 76 0 0 1 76 0" />
          <path id={`${id}-bottom`} d="M -84 0 A 84 84 0 0 0 84 0" />
        </defs>
        <circle r="99" fill={paper} />
        <circle r="99" fill={`url(#${id}-paper)`} />
        <circle r="98.5" fill="none" stroke="#000" strokeOpacity="0.25" />
        <circle r="92" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="0.8" />
        <circle r="62" fill="none" stroke={ink} strokeOpacity="0.16" strokeWidth="0.6" />

        {label && (
          <text fill={ink} fontSize="9" letterSpacing="2.4" style={mono}>
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle" {...fit(label.toUpperCase(), 9, MONO_EM, 2.4, 200)}>
              {label.toUpperCase()}
            </textPath>
          </text>
        )}
        {format && (
          <text fill={ink} fillOpacity="0.8" fontSize="6.4" letterSpacing="1.2" style={mono}>
            <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle" {...fit(format.toUpperCase(), 6.4, MONO_EM, 1.2, 215)}>
              {format.toUpperCase()}
            </textPath>
          </text>
        )}

        <text
          y={artistY}
          textAnchor="middle"
          fill={ink}
          fontSize="15"
          style={{ fontFamily: 'var(--font-display)', fontStretch: '66%', fontWeight: 900 }}
          {...fit(artist.toUpperCase(), 15, COND_EM, 0, Math.min(124, room(artistY - 11, artistY)))}
        >
          {artist.toUpperCase()}
        </text>
        {lines.map((line, i) => (
          <text
            key={i}
            y={lineY(i)}
            textAnchor="middle"
            fill={ink}
            fillOpacity="0.9"
            fontSize="8.5"
            style={{ fontFamily: 'var(--font-display)', fontStretch: '100%', fontWeight: 800 }}
            {...fit(line, 8.5, DISP_EM, 0, Math.min(128, room(lineY(i) - 6.5, lineY(i))))}
          >
            {line}
          </text>
        ))}

        <circle r="4.5" fill="var(--ground)" />

        {shown.map(([k, v], i) => {
          const y = top + i * step;
          // The room across the label at this height, less a margin.
          const half = Math.sqrt(Math.max(0, 74 * 74 - (y + 2) * (y + 2))) - 4;
          const key = k.toUpperCase();
          const keyWidth = Math.min(key.length * 5.6 * MONO_EM + key.length * 0.6, half);
          return (
            <g key={k}>
              <text x={-half} y={y} fill={ink} fillOpacity="0.6" fontSize="5.6" letterSpacing="0.6" style={mono}>
                {key}
              </text>
              <text x={half} y={y} textAnchor="end" fill={ink} fontSize="6.6" style={mono} {...fit(v.toUpperCase(), 6.6, MONO_EM, 0, 2 * half - keyWidth - 6)}>
                {v.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <dl className="sr-only">
        {names.length > 0 && (
          <>
            <dt>Label</dt>
            <dd>{names.join(', ')}</dd>
          </>
        )}
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {format && (
          <>
            <dt>Format</dt>
            <dd>{format}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
