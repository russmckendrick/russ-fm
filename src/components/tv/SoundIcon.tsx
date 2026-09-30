import { cn } from '@/lib/utils';

interface SoundIconProps {
  /** Muted shows the speaker crossed out; otherwise it has sound waves. */
  muted: boolean;
  className?: string;
}

/**
 * The TV's sound icon: a solid speaker (it reads at 16px, where an outline
 * one turns to mush) with two waves when the sound is on, or a cross when it
 * is off. It shows the current state; the button's label says what a press does.
 */
export function SoundIcon({ muted, className }: SoundIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" aria-hidden>
      <path
        d="M3.5 9.25h3.25L11.25 5v14l-4.5-4.25H3.5a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      ) : (
        <>
          <path d="M14.75 9.25a3.9 3.9 0 0 1 0 5.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          <path d="M17.6 6.4a7.9 7.9 0 0 1 0 11.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
