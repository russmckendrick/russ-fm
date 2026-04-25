import * as React from "react";
import { cn } from "@/lib/utils";

export interface ServiceButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  service?: "spotify" | "apple-music" | "discogs" | "lastfm" | "wikipedia" | "custom";
  brandColor?: string;
  url?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  progress?: { current: number; total: number } | null;
}

const BRAND_COLORS = {
  spotify: "#1DB954",
  "apple-music": "#d8273f",
  lastfm: "#D51007",
  discogs: "#2a2724",
  wikipedia: "#2a2724",
} as const;

const ServiceButton = React.forwardRef<HTMLButtonElement, ServiceButtonProps>(
  (
    {
      service = "custom",
      brandColor,
      url,
      icon,
      children,
      className,
      onClick,
      progress,
      style,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const color =
      brandColor || (service !== "custom" ? BRAND_COLORS[service] : undefined);
    const progressPercent = progress
      ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100))
      : 0;

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "relative inline-flex h-10 items-center justify-center overflow-hidden border px-4",
          "font-mono text-[11px] uppercase tracking-[0.08em]",
          "transition-[color,background-color,border-color,transform,opacity] duration-200",
          "hover:-translate-y-px active:translate-y-px",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          "disabled:pointer-events-none disabled:opacity-55",
          className,
        )}
        style={
          {
            borderColor: color ?? "var(--rule-strong)",
            backgroundColor: color ?? "var(--ink)",
            color: "var(--paper)",
            ...style,
          } as React.CSSProperties
        }
        onClick={handleClick}
        {...props}
      >
        {progress && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        )}
        <span className="relative flex items-center gap-2">
          {icon && <span aria-hidden>{icon}</span>}
          {children}
        </span>
      </button>
    );
  },
);

ServiceButton.displayName = "ServiceButton";

export { ServiceButton };
