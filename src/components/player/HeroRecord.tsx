import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ScrobbleScene } from '@/hooks/useScrobbleScene';
import type { VinylLook } from '@/lib/vinylLook';
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
  /**
   * The pressing's colour for each disc, in order; black without any. The first is the
   * front record (the one that scrobbles); a set's other discs are tucked behind it, each
   * pulled out a little further than the one in front, up to `discOut` for the last.
   */
  looks?: Array<VinylLook | null>;
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

/** More discs than this are not drawn; a big box would fan out across the page. */
const MAX_DISCS = 4;

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
  looks,
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
  const discs = looks?.length ? looks.slice(0, MAX_DISCS) : [null];
  // The last disc sits at `discOut`, so the fan reaches no further than a single record would.
  const step = [0, 6, 4.5, 3.5][discs.length - 1];
  const shiftOf = (k: number) => Math.max(0, discOut - (discs.length - 1 - k) * step);
  // On hover the CSS sets --pull and every disc slides out a little more, the deeper ones
  // further, so the fan opens as it goes.
  const lean = (k: number) => (discs.length > 1 ? 0.5 + 0.5 * (k / (discs.length - 1)) : 1);
  const offset = (k: number) => `translateX(calc(${shiftOf(k)}% + var(--pull, 0%) * ${lean(k)}))`;

  return (
    <div
      className={cn('hero-record relative aspect-square w-full', className)}
      data-scene={phase}
      style={ringColour ? ({ '--ring': ringColour } as CSSProperties) : undefined}
    >
      {/* The rest of the set, deepest first so each sits over the one behind it. */}
      {discs
        .map((look, k) => ({ look, k }))
        .slice(1)
        .reverse()
        .map(({ look, k }) => (
          <div
            key={k}
            className={cn('hero-disc hero-disc-extra', !discOnMobile && 'max-md:hidden')}
            style={{ transform: offset(k), zIndex: 0 }}
          >
            <Vinyl label={labelColour} look={look} spin={spinning} className="inset-0" />
          </div>
        ))}
      <div
        className={cn('hero-disc', !discOnMobile && !inScene && 'max-md:hidden')}
        style={inScene ? undefined : { transform: offset(0) }}
      >
        <div className="hero-disc-bob">
          <Vinyl label={labelColour} cover={labelCover} look={discs[0]} text={labelText} spin={spinning} fast={fast || inScene} className="inset-0" />
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
