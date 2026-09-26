import { useEffect, useState } from 'react';

export type BackdropTone = 'light' | 'dark';

const tones = new Map<string, BackdropTone | null>();

/**
 * Whether a photo's backdrop is light or dark, judged from the pixels along
 * its top and side edges. Loads its own CORS-enabled copy of the image (pass
 * a small size), so the visible <img> is never affected. Returns null until
 * measured, or when the host doesn't allow reading the pixels.
 */
export function useBackdropTone(src: string | undefined): BackdropTone | null {
  const [tone, setTone] = useState<BackdropTone | null>(() => (src ? tones.get(src) ?? null : null));

  useEffect(() => {
    if (!src) return;
    if (tones.has(src)) {
      setTone(tones.get(src) ?? null);
      return;
    }
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      const measured = measure(img);
      tones.set(src, measured);
      if (alive) setTone(measured);
    };
    img.onerror = () => tones.set(src, null);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  return tone;
}

function measure(img: HTMLImageElement): BackdropTone | null {
  try {
    const w = 24;
    const h = 30;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Top quarter plus the outer two columns: where the backdrop shows.
        if (y >= h / 4 && x >= 2 && x < w - 2) continue;
        const i = (y * w + x) * 4;
        sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        n++;
      }
    }
    return sum / n >= 0.5 ? 'light' : 'dark';
  } catch {
    // Tainted canvas: the host didn't send CORS headers for this origin.
    return null;
  }
}
