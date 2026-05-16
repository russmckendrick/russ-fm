import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Children,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DragWallProps {
  children: ReactNode;
  /**
   * CSS value for each child's flex-basis. Default keeps ~6 tiles visible
   * on a 1640px container with 16px gaps; callers can override for larger
   * artist walls or denser album walls.
   */
  itemBasis?: string;
  /** Tailwind gap class between items. Default gap-4. */
  gapClass?: string;
  ariaLabel?: string;
  className?: string;
  showScrollbar?: boolean;
}

/**
 * Horizontal drag-scroll wall. Wheel scrolling is translated from vertical
 * → horizontal, mouse drag scrolls, and prev/next controls appear on hover.
 * A post-drag click guard stops accidental link navigation after a real
 * drag gesture.
 */
export function DragWall({
  children,
  itemBasis = "min(36vw, 220px)",
  gapClass = "gap-4",
  ariaLabel = "Scroll wall",
  className,
  showScrollbar = false,
}: DragWallProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, sl: 0, moved: 0 });
  const [overflow, setOverflow] = useState({ start: false, end: false });

  // Wheel → horizontal scroll
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Track overflow state to decide whether to show prev/next chevrons
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      setOverflow({
        start: el.scrollLeft > 2,
        end: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  // Only left-button mouse drags scroll. We deliberately do NOT call
  // `setPointerCapture` — doing so retargets the click event to the track
  // and breaks normal child-link navigation. Instead we watch for
  // movement on window, and if the pointer actually moved, install a
  // one-shot capture-phase click blocker so the post-drag click doesn't
  // accidentally follow a link.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: 0 };

    const onMove = (ev: PointerEvent) => {
      if (!drag.current.down || !trackRef.current) return;
      const dx = ev.clientX - drag.current.x;
      drag.current.moved = Math.abs(dx);
      if (drag.current.moved > 3) {
        trackRef.current.classList.add("cursor-grabbing");
        // Prevent text selection while actually dragging.
        ev.preventDefault();
      }
      trackRef.current.scrollLeft = drag.current.sl - dx;
    };
    const onUp = () => {
      drag.current.down = false;
      if (trackRef.current) trackRef.current.classList.remove("cursor-grabbing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (drag.current.moved > 6) {
        const stop = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener("click", stop, true);
        };
        window.addEventListener("click", stop, true);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const itemStyle: CSSProperties = { flex: `0 0 ${itemBasis}` };

  return (
    <div className={cn("relative isolate", className)}>
      <div
        ref={trackRef}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "flex w-full select-none overflow-x-auto overflow-y-hidden",
          "cursor-grab overscroll-x-contain scroll-smooth",
          showScrollbar
            ? "pb-3 [scrollbar-color:var(--ink)_var(--paper-2)] [scrollbar-width:thin]"
            : "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          gapClass
        )}
        onPointerDown={onDown}
      >
        {Children.map(children, (child, i) => (
          <div key={i} style={itemStyle} className="min-w-0">
            {child}
          </div>
        ))}
      </div>

      {overflow.start && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-ink bg-ink text-paper shadow-[0_6px_14px_-8px_rgba(14,13,11,0.45)] transition-colors hover:border-hl hover:bg-hl md:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {overflow.end && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center border border-ink bg-ink text-paper shadow-[0_6px_14px_-8px_rgba(14,13,11,0.45)] transition-colors hover:border-hl hover:bg-hl md:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
