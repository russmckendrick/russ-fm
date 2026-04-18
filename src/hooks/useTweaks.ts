import { useCallback, useEffect, useState } from 'react';
import { redesignConfig } from '@/config/redesign.config';

const STORAGE_KEY = 'russfm.tweaks';

export interface TweaksState {
  density: 'sparse' | 'medium' | 'dense';
  monoLabels: boolean;
  coverColor: boolean;
  tintStrength: number; // 0–1
}

const DEFAULT: TweaksState = {
  density: redesignConfig.density.default,
  monoLabels: redesignConfig.monoLabels.default,
  coverColor: redesignConfig.tintDefaults.showCoverColor,
  tintStrength: redesignConfig.tintDefaults.intensity,
};

function load(): TweaksState {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<TweaksState>;
    return {
      density: parsed.density ?? DEFAULT.density,
      monoLabels: parsed.monoLabels ?? DEFAULT.monoLabels,
      coverColor: parsed.coverColor ?? DEFAULT.coverColor,
      tintStrength:
        typeof parsed.tintStrength === 'number'
          ? Math.min(1, Math.max(0, parsed.tintStrength))
          : DEFAULT.tintStrength,
    };
  } catch {
    return DEFAULT;
  }
}

function apply(state: TweaksState) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;

  el.classList.remove('density-sparse', 'density-medium', 'density-dense');
  el.classList.add(`density-${state.density}`);

  el.classList.toggle('mono-off', !state.monoLabels);
  el.classList.toggle('tint-off', !state.coverColor);

  el.style.setProperty('--tint-strength', String(state.tintStrength));
}

/**
 * Dev-only tweaks singleton. Loads from localStorage, applies class/CSS
 * state to `<html>`, persists on change. Exposes the current state and a
 * setter.
 */
export function useTweaks() {
  const [state, setState] = useState<TweaksState>(DEFAULT);

  // Initialise from storage + apply on mount
  useEffect(() => {
    const loaded = load();
    setState(loaded);
    apply(loaded);
  }, []);

  const update = useCallback((patch: Partial<TweaksState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / privacy mode errors */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    apply(DEFAULT);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(DEFAULT);
  }, []);

  return { state, update, reset, defaults: DEFAULT };
}
