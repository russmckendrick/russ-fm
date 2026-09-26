import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_FLOOD, FloodSetterContext, FloodValueContext, type FloodState } from './flood-context';

export function FloodProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FloodState>(DEFAULT_FLOOD);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--flood', state.flood);
    root.style.setProperty('--flood-ink', state.ink);
    // The page's ground tints everything below the hero (panels, the scrolled
    // header, the footer); without one it falls back to the stylesheet's.
    if (state.ground) root.style.setProperty('--ground', state.ground);
    else root.style.removeProperty('--ground');
  }, [state]);

  // Stable setter that ignores no-op updates, so pages can call it from effects
  // without re-rendering themselves in a loop.
  const setFlood = useCallback((next: FloodState | null) => {
    const target = next ?? DEFAULT_FLOOD;
    setState(prev =>
      prev.flood === target.flood &&
      prev.ink === target.ink &&
      (prev.cover ?? null) === (target.cover ?? null) &&
      (prev.ground ?? null) === (target.ground ?? null)
        ? prev
        : target,
    );
  }, []);

  return (
    <FloodSetterContext.Provider value={setFlood}>
      <FloodValueContext.Provider value={state}>{children}</FloodValueContext.Provider>
    </FloodSetterContext.Provider>
  );
}
