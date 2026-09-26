import { useEffect, useState } from 'react';
import { getArtistImageInfoUrl } from '@/lib/image-utils';

type Box = [number, number, number, number];

interface EdgeInfo {
  colour: string;
  /** Relative luminance, 0–1. */
  luminance: number;
  /** 1 = a flat colour, lower = busier. */
  even: number;
}

/**
 * `<slug>-image.json`, written next to each artist photo by
 * scripts/generate-artist-images.js. Boxes are fractions of the photo,
 * origin top-left: faces/people as [x, y, w, h], subject as [x0, y0, x1, y1].
 */
export interface ArtistImageInfo {
  v: number;
  width: number;
  height: number;
  faces: Box[];
  people: Box[];
  subject: Box | null;
  focus: [number, number] | null;
  backdrop: EdgeInfo & { tone: 'light' | 'dark' };
  edges: Record<'bottom', EdgeInfo> & Record<'top' | 'left' | 'right', EdgeInfo & { profile?: string[] }>;
  luminance: number;
}

const infoCache = new Map<string, Promise<ArtistImageInfo | null>>();

/** Not loadDetailJson: its path clean-up rewrites any /artist/ JSON path to the artist's detail file. */
function loadImageInfo(url: string): Promise<ArtistImageInfo | null> {
  let pending = infoCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(res => (res.ok ? res.json() : null))
      // The dev server answers a missing file with index.html, which won't parse.
      .then(info => (info && typeof info.width === 'number' ? (info as ArtistImageInfo) : null))
      .catch(() => null);
    infoCache.set(url, pending);
  }
  return pending;
}

/**
 * The artist's image notes: `undefined` while loading, `null` when there are
 * none (a photo added since the script last ran).
 */
export function useArtistImageInfo(uriArtist: string | undefined): ArtistImageInfo | null | undefined {
  const [state, setState] = useState<{ uri?: string; info: ArtistImageInfo | null | undefined }>({ info: undefined });

  useEffect(() => {
    if (!uriArtist) return;
    let alive = true;
    loadImageInfo(getArtistImageInfoUrl(uriArtist)).then(info => {
      if (alive) setState({ uri: uriArtist, info });
    });
    return () => {
      alive = false;
    };
  }, [uriArtist]);

  return state.uri === uriArtist ? state.info : undefined;
}

export interface PortraitLayout {
  stageWidth: number;
  stageHeight: number;
  /**
   * The <img> box in the stage (px), always the stage's full height, from the
   * page edge. The photo sits at the left of it; the box runs `extendRight`
   * past the photo (a short lead-out, never a long strip) showing a soft
   * gradient of the photo's own right-edge colours, which the element's
   * filter, blend and fade treat exactly like the photo, so the end of the
   * fade isn't the photo's hard edge.
   */
  left: number;
  width: number;
  photoWidth: number;
  photoHeight: number;
  extendRight: number;
  /** Right fade in stage px: fully visible up to `fadeFrom`, gone by `fadeTo`. */
  fadeFrom: number;
  fadeTo: number;
}

/** How far past its edge the photo is carried on to soften the end of the fade. */
const LEAD_OUT = 96;

/**
 * Where the photo sits in the desktop hero. The hero's photo column is sized
 * to the photo (portraitColumn), so the photo is as tall as the flood, starts
 * at the page edge and ends about where the column does; the text takes the
 * rest of the width. The photo fades out over its right side and a short
 * lead-out past it, finishing just into the gap before the text (or under the
 * text when a wide photo is capped). The fade is longer on a harsh step in
 * lightness, and starts no earlier than just before the last face, as long as
 * that leaves it room.
 *
 * `stageW`/`stageH`: the stage; `textX`: where the text column starts, in
 * stage px; `harsh`: the backdrop and flood are far apart in lightness.
 */
export function portraitLayout(
  info: ArtistImageInfo,
  stageW: number,
  stageH: number,
  textX: number,
  harsh: boolean,
): PortraitLayout {
  const photoHeight = Math.round(stageH);
  const photoWidth = (info.width / info.height) * photoHeight;
  const photoRight = photoWidth;

  const length = harsh ? 340 : 300;
  let fadeTo = photoRight < textX ? Math.min(photoRight + LEAD_OUT, textX + 24) : Math.min(photoRight, textX + 120);
  fadeTo = Math.min(fadeTo, stageW);
  let fadeFrom = fadeTo - length;
  const faces = info.faces;
  if (faces.length) {
    const lastFace = Math.max(...faces.map(f => f[0] + f[2])) * photoWidth;
    fadeFrom = Math.max(fadeFrom, Math.min(lastFace - 40, fadeTo - 200));
  }

  const extendRight = Math.max(0, Math.round(fadeTo - photoRight));
  return {
    stageWidth: stageW,
    stageHeight: stageH,
    left: 0,
    width: photoWidth + extendRight,
    photoWidth,
    photoHeight,
    extendRight,
    fadeFrom: Math.max(0, fadeFrom),
    fadeTo,
  };
}

/**
 * The desktop hero's photo column: the photo's width at the stage's height
 * (the fixed row plus the 2.5rem of flood above and below), between 320px and
 * half the window, so the text starts where the photo ends and takes the rest.
 * Before the notes load, a 4:5 photo is assumed.
 */
export function portraitColumn(info: ArtistImageInfo | null | undefined, rowHeight: string): string {
  const aspect = info ? info.width / info.height : 0.8;
  return `clamp(320px, calc((${rowHeight} + 5rem) * ${aspect.toFixed(4)}), 50vw)`;
}

/**
 * An edge's smoothed colour profile as a gradient along that edge, for
 * carrying the photo on past it. Stops are spread over `length` px starting
 * `start` px in (the last colour runs on). Falls back to the edge's average.
 */
export function edgeGradient(
  edge: EdgeInfo & { profile?: string[] },
  direction: 'to bottom' | 'to right',
  start = 0,
  length?: number,
): string {
  const stops = edge.profile?.length ? edge.profile : [edge.colour, edge.colour];
  const at = (i: number) => {
    const share = i / (stops.length - 1);
    return length == null ? `${Math.round(share * 100)}%` : `${Math.round(start + share * length)}px`;
  };
  return `linear-gradient(${direction}, ${stops.map((c, i) => `${c} ${at(i)}`).join(', ')})`;
}

/** object-position for the phone crop: the focus across, biased to the top. */
export function focusPosition(info: ArtistImageInfo | null | undefined): string | undefined {
  if (!info?.focus) return undefined;
  const [x, y] = info.focus;
  return `${Math.round(x * 100)}% ${Math.round(Math.max(0, y - 0.25) * 100)}%`;
}
