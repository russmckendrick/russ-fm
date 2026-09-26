import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { handleImageError } from '@/lib/image-utils';
import { edgeGradient, focusPosition, portraitLayout, type ArtistImageInfo, type PortraitLayout } from '@/lib/artistImage';

interface ArtistPortraitProps {
  src: string;
  alt: string;
  /** From useArtistImageInfo; without it the photo just fills the stage. */
  info: ArtistImageInfo | null | undefined;
  blend: 'multiply' | 'screen';
  /** Backdrop and flood far apart in lightness: give the right fade more room. */
  harsh: boolean;
  /**
   * The hero's text column; the photo is placed to end before it. An element
   * (from a callback ref), not a ref object: the column renders after the
   * portrait, so a ref object is still empty when the portrait first measures.
   */
  textEl: HTMLElement | null;
}

const DESKTOP = '(min-width: 1024px)';

/**
 * The artist hero portrait, printed into the flood in greyscale. On phones it
 * fills a 4:5 box, cropped round the faces. From lg it fills the flood's
 * height on a stage running from the page edge to past the text, placed by
 * portraitLayout(): the hero's photo column is sized to the photo
 * (portraitColumn), and the photo fades out over its right side and a short
 * lead-out past it, a soft gradient of its own edge colours as the <img>'s
 * background, which the filter, blend and fade treat like the photo.
 *
 * Masks sit on the <img>, never the stage: a mask on a wrapper
 * isolates it and stops the blend reaching the flood.
 */
export function ArtistPortrait({ src, alt, info, blend, harsh, textEl }: ArtistPortraitProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PortraitLayout | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const text = textEl;
    if (!stage || !text || !info) {
      setLayout(null);
      return;
    }
    const media = window.matchMedia(DESKTOP);
    const update = () => {
      if (!media.matches) {
        setLayout(null);
        return;
      }
      const s = stage.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      setLayout(portraitLayout(info, s.width, s.height, t.left - s.left, harsh));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    observer.observe(text);
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, [info, harsh, textEl]);

  const placed = layout && info ? placedStyle(layout, info) : { objectPosition: focusPosition(info) };

  return (
    <div ref={stageRef} className="artist-stage">
      <img
        src={src}
        alt={alt}
        onError={handleImageError}
        className="artist-portrait object-cover object-top grayscale contrast-[1.2]"
        data-placed={layout ? '' : undefined}
        style={{ mixBlendMode: blend, ...placed }}
      />
    </div>
  );
}

/**
 * The placed <img>: the photo held at its size at the left of the box
 * (object-fit: contain), and the box carried a short way past it by a
 * background gradient of the photo's own right-edge colours (edgeGradient: a
 * smoothed profile, so nothing touching the edge streaks).
 */
function placedStyle(layout: PortraitLayout, info: ArtistImageInfo): CSSProperties {
  return {
    '--stage-w': `${layout.stageWidth}px`,
    '--el-left': `${layout.left}px`,
    '--el-w': `${layout.width}px`,
    '--el-h': `${layout.stageHeight}px`,
    '--fade-from': `${layout.fadeFrom}px`,
    '--fade-to': `${layout.fadeTo}px`,
    objectFit: 'contain',
    objectPosition: '0 0',
    ...(layout.extendRight > 0
      ? {
          backgroundImage: edgeGradient(info.edges.right, 'to bottom'),
          backgroundSize: `${layout.extendRight + 1}px 100%`,
          backgroundPosition: 'right top',
          backgroundRepeat: 'no-repeat',
        }
      : {}),
  } as CSSProperties;
}
