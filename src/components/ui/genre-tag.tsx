import * as React from "react";
import { useNavigate } from "react-router-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { getGenreColor } from "@/lib/genreColors";

/**
 * Editorial chip. Sharp corners, hairline border, mono or grotesk body.
 * When `tinted`, the chip picks up a subtle wash from the genre's mapped
 * hue so different genres remain distinguishable at a glance without the
 * old pastel-pill treatment.
 */
const genreTagVariants = cva(
  "inline-flex items-center border font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  {
    variants: {
      size: {
        sm: "px-1.5 py-[3px] text-[10px] tracking-[0.04em]",
        md: "px-2 py-[3px] text-[11px] tracking-[0.03em]",
        lg: "px-2.5 py-1 text-xs tracking-[0.02em]",
      },
      tone: {
        /** Paper chip with a hairline ink rule. The editorial default. */
        default: "bg-paper text-ink border-rule-strong hover:bg-paper-2",
        /** Uses the genre-mapped hue as a subtle tint; still sharp-cornered. */
        tinted:
          "bg-[hsl(var(--genre-hue),var(--genre-saturation),96%)] border-[hsl(var(--genre-hue),var(--genre-saturation),55%)] text-[hsl(var(--genre-hue),var(--genre-saturation),22%)] hover:bg-[hsl(var(--genre-hue),var(--genre-saturation),92%)] dark:bg-[hsl(var(--genre-hue),var(--genre-saturation),12%)] dark:border-[hsl(var(--genre-hue),var(--genre-saturation),45%)] dark:text-[hsl(var(--genre-hue),var(--genre-saturation),85%)] dark:hover:bg-[hsl(var(--genre-hue),var(--genre-saturation),18%)]",
      },
      mono: {
        true: "font-mono uppercase",
        false: "font-grot",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "default",
      mono: false,
    },
  }
);

export interface GenreTagProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof genreTagVariants> {
  genre: string;
  linkable?: boolean;
}

function GenreTag({
  genre,
  linkable = true,
  size,
  tone,
  mono,
  className,
  onClick,
  ...props
}: GenreTagProps) {
  const navigate = useNavigate();
  const genreColor = getGenreColor(genre);
  const hslMatch = genreColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  const [, hue, saturation] = hslMatch || ["", "0", "50"];

  const cssVars = {
    "--genre-hue": hue,
    "--genre-saturation": `${saturation}%`,
  } as React.CSSProperties;

  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (linkable) {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/albums/1?genre=${encodeURIComponent(genre)}`);
    }
    onClick?.(e);
  };

  return (
    <span
      className={cn(
        genreTagVariants({ size, tone, mono }),
        linkable && "cursor-pointer",
        className
      )}
      style={cssVars}
      onClick={handleClick}
      {...props}
    >
      {genre}
    </span>
  );
}

export { GenreTag, genreTagVariants };
