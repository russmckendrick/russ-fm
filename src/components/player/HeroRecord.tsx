import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ScrobbleScene } from '@/hooks/useScrobbleScene';
import { Sleeve } from './Sleeve';
import { Vinyl } from './Vinyl';
import { Sticker } from './Sticker';

interface HeroRecordProps {
  src: string;
  srcSet?: string;
  alt: string;
  /** Vinyl centre-label colour. */
  labelColour: string;
  labelText?: string;
  /** Sleeve image printed on the centre label (zoomed to fill the circle). */
  labelCover?: string;
  /** How far the disc sits out of the sleeve, in % of its width. */
  discOut?: number;
  spinning?: boolean;
  fast?: boolean;
  sticker?: { date: string; background: string; color: string; label?: string };
  /** Show the sticker below `md` too (phones get the small one). */
  stickerOnMobile?: boolean;
  /** Show the disc below `md` too; off leaves just the sleeve on phones (it still shows while scrobbling). */
  discOnMobile?: boolean;
  /**
   * Scrobble scene (from useScrobbleScene): the disc slides out, hovers over
   * the cover with a ring of one segment per track, then slides home.
   */
  scene?: ScrobbleScene;
  /** Colour of the lit track segments. */
  ringColour?: string;
  eager?: boolean;
  className?: string;
}

const SCROBBLED_STICKER = { background: 'var(--cream)', color: '#0e0d0c' };

/**
 * The cover-as-hero object: a big sleeve with the record half out to the
 * right, shrink-wrap shine and an optional shop sticker.
 */
export function HeroRecord({
  src,
  srcSet,
  alt,
  labelColour,
  labelText,
  labelCover,
  discOut = 15,
  spinning = true,
  fast = false,
  sticker,
  stickerOnMobile = true,
  discOnMobile = true,
  scene,
  ringColour,
  eager = true,
  className,
}: HeroRecordProps) {
  const phase = scene?.phase ?? 'idle';
  const inScene = phase !== 'idle';

  return (
    <div
      className={cn('hero-record relative aspect-square w-full', className)}
      data-scene={phase}
      style={ringColour ? ({ '--ring': ringColour } as CSSProperties) : undefined}
    >
      <div
        className={cn('hero-disc', !discOnMobile && !inScene && 'max-md:hidden')}
        style={inScene ? undefined : { transform: `translateX(${discOut}%)` }}
      >
        <div className="hero-disc-bob">
          <Vinyl label={labelColour} cover={labelCover} text={labelText} spin={spinning} fast={fast || inScene} className="inset-0" />
          {scene && scene.total > 0 && <ScrobbleRing done={scene.done} total={scene.total} playing={phase === 'play'} />}
        </div>
      </div>
      <Sleeve
        src={src}
        srcSet={srcSet}
        sizes="(min-width: 1024px) 780px, 90vw"
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        shrinkwrap
        className="h-full w-full"
      />
      {sticker && (
        <>
          <HeroSticker sticker={sticker} scene={scene} size="lg" className="-right-12 -top-6 hidden md:flex" />
          {stickerOnMobile && <HeroSticker sticker={sticker} scene={scene} size="sm" className="-right-2 -top-5 md:hidden" />}
        </>
      )}
    </div>
  );
}

/**
 * The shop sticker. After a scrobble it swaps to a cream "Scrobbled" one,
 * which later crossfades back to "Added".
 */
function HeroSticker({
  sticker,
  scene,
  size,
  className,
}: {
  sticker: NonNullable<HeroRecordProps['sticker']>;
  scene?: ScrobbleScene;
  size: 'lg' | 'sm';
  className: string;
}) {
  const stamp = scene?.stamp ?? 'added';
  const showScrobbled = !!scene?.stampedAt && (stamp === 'scrobbled' || stamp === 'returning');
  return (
    <>
      {stamp !== 'scrobbled' && (
        <Sticker
          key="added"
          {...sticker}
          size={size}
          className={cn(className, (stamp === 'returning' || stamp === 'returned') && 'sticker-return')}
        />
      )}
      {showScrobbled && (
        <Sticker
          key="scrobbled"
          date={scene!.stampedAt!}
          label="Scrobbled"
          footer={`${scene!.successful} tracks`}
          {...SCROBBLED_STICKER}
          size={size}
          className={cn(className, stamp === 'returning' ? 'sticker-leave' : 'sticker-now')}
        />
      )}
    </>
  );
}

/** One arc per track round the rim; played tracks light up, the current one pulses. */
function ScrobbleRing({ done, total, playing }: { done: number; total: number; playing: boolean }) {
  const span = 360 / total;
  const gap = Math.min(1.6, span / 6);
  const r = 47;
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };

  return (
    <svg className="scrobble-ring" viewBox="0 0 100 100" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const start = -90 + i * span + gap;
        const end = -90 + (i + 1) * span - gap;
        const state = i < done ? 'on' : i === done && playing ? 'now' : 'off';
        return (
          <path
            key={i}
            className="scrobble-seg"
            data-state={state}
            d={`M ${point(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}`}
          />
        );
      })}
    </svg>
  );
}
