import { cn } from '@/lib/utils';
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
  /** How far the disc sits out of the sleeve, in % of its width. */
  discOut?: number;
  spinning?: boolean;
  fast?: boolean;
  sticker?: { date: string; background: string; color: string; label?: string };
  /** Show the sticker below `md` too (phones get the small one). */
  stickerOnMobile?: boolean;
  eager?: boolean;
  className?: string;
}

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
  discOut = 15,
  spinning = true,
  fast = false,
  sticker,
  stickerOnMobile = true,
  eager = true,
  className,
}: HeroRecordProps) {
  return (
    <div className={cn('relative aspect-square w-full', className)}>
      <Vinyl
        label={labelColour}
        text={labelText}
        spin={spinning}
        fast={fast}
        className="left-[2%] top-[2%] h-[96%] w-[96%] transition-transform duration-1000 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: `translateX(${discOut}%)` }}
      />
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
          <Sticker {...sticker} size="lg" className="-right-12 -top-6 hidden md:flex" />
          {stickerOnMobile && <Sticker {...sticker} size="sm" className="-right-2 -top-5 md:hidden" />}
        </>
      )}
    </div>
  );
}
