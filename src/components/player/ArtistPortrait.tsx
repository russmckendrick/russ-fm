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
 * portraitLayout() so faces stay clear of the text, with a right fade that
 * finishes under the text. The <img> box runs on past the photo (and to the
 * page edge when it stops short) with a soft gradient of the photo's own edge
 * colours as its background, which the filter, blend and fades treat like
 * the photo.
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
 * The placed <img>: the photo held at its size in the content box
 * (object-fit: contain), and the box carried on past it (right, and into the
 * left and top padding) by background layers drawn from the photo's own edge
 * colours (edgeGradient: a smoothed profile along that edge, so nothing
 * touching the edge streaks). The right layer is clipped to the content box so
 * it can't paint over the padding; the top layer spans the whole width.
 */
function placedStyle(layout: PortraitLayout, info: ArtistImageInfo): CSSProperties {
  const layers: Array<{ image: string; size: string; position: string; box: string }> = [];
  if (layout.extendRight > 0) {
    layers.push({
      image: edgeGradient(info.edges.right, 'to bottom'),
      size: `${layout.extendRight}px 100%`,
      position: 'right top',
      box: 'content-box',
    });
  }
  if (layout.extendTop > 0) {
    layers.push({
      image: edgeGradient(info.edges.top, 'to right', layout.extendLeft, layout.photoWidth),
      // One pixel into the photo so no hairline of flood shows at the join.
      size: `100% ${layout.extendTop + 1}px`,
      position: 'left top',
      box: 'border-box',
    });
  }
  if (layout.extendLeft > 0) {
    layers.push({
      image: edgeGradient(info.edges.left, 'to bottom'),
      size: `${layout.extendLeft + 1}px 100%`,
      position: 'left top',
      box: 'border-box',
    });
  }
  return {
    '--stage-w': `${layout.stageWidth}px`,
    '--el-left': `${layout.left}px`,
    '--el-w': `${layout.width}px`,
    '--el-h': `${layout.stageHeight}px`,
    '--fade-from': `${layout.fadeFrom}px`,
    '--fade-to': `${layout.fadeTo}px`,
    boxSizing: 'border-box',
    paddingLeft: layout.extendLeft,
    paddingTop: layout.extendTop,
    objectFit: 'contain',
    objectPosition: '0 0',
    ...(layers.length
      ? {
          backgroundImage: layers.map(l => l.image).join(', '),
          backgroundSize: layers.map(l => l.size).join(', '),
          backgroundPosition: layers.map(l => l.position).join(', '),
          backgroundOrigin: layers.map(l => l.box).join(', '),
          backgroundClip: layers.map(l => l.box).join(', '),
          backgroundRepeat: 'no-repeat',
        }
      : {}),
  } as CSSProperties;
}
