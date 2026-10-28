import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { swipeDirection } from '@/lib/explore/threadMotion';

interface ThreadSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/**
 * The details as a bottom sheet (phones and tablets). Drag the top edge down
 * to dismiss it, or tap outside, press Escape or use Close.
 */
export function ThreadSheet({ open, onClose, label, children }: ThreadSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; last: [number, number] } | null>(null);

  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo({ top: 0 });
    sheetRef.current?.focus({ preventScroll: true });
  }, [open]);

  const setDrag = (px: number) => sheetRef.current?.style.setProperty('--thr-sheet-drag', `${Math.max(0, px)}px`);

  return (
    <>
      {open && <div className="thr-scrim" onClick={onClose} aria-hidden />}
      <div
        ref={sheetRef}
        className={`thr-sheet${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal={open}
        aria-label={label}
        aria-hidden={!open}
        tabIndex={-1}
        inert={!open}
      >
        <div
          className="thr-sheet-grip"
          onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button')) return;
            drag.current = { y: e.clientY, t: performance.now(), last: [e.clientY, performance.now()] };
            e.currentTarget.setPointerCapture(e.pointerId);
            sheetRef.current?.classList.add('is-dragging');
          }}
          onPointerMove={e => {
            if (!drag.current) return;
            drag.current.last = [e.clientY, performance.now()];
            setDrag(e.clientY - drag.current.y);
          }}
          onPointerUp={e => {
            const dg = drag.current;
            drag.current = null;
            sheetRef.current?.classList.remove('is-dragging');
            if (!dg) return;
            const dy = e.clientY - dg.y;
            const v = (dg.last[0] - dg.y) / Math.max(1, dg.last[1] - dg.t);
            // "back" in swipe terms is a drag down
            if (swipeDirection(dy, v, sheetRef.current?.clientHeight ?? 600, 'y') === -1) onClose();
            setDrag(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            sheetRef.current?.classList.remove('is-dragging');
            setDrag(0);
          }}
        >
          <span className="t-kicker text-[color:var(--cream-dim)]">Details</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div ref={bodyRef} className="thr-sheet-body">
          {children}
        </div>
      </div>
    </>
  );
}
