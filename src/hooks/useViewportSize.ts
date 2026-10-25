import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
// A string, so an unchanged size is the same snapshot.
const snapshot = () => `${document.documentElement.clientWidth}x${window.innerHeight}`;

/** The page's width (without a scrollbar) and the window's height, in px; updates on resize. */
export function useViewportSize(): [number, number] {
  const size = useSyncExternalStore(subscribe, snapshot, () => '1440x900');
  const [w, h] = size.split('x').map(Number);
  return [w, h];
}
