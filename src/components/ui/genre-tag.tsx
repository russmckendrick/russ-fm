import * as React from "react"
import { useNavigate } from "react-router-dom"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { getGenreColor } from "@/lib/genreColors"

const genreTagVariants = cva(
  "inline-flex items-center rounded-full border font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

export interface GenreTagProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof genreTagVariants> {
  genre: string
  linkable?: boolean
}

function GenreTag({
  genre,
  linkable = true,
  size,
  className,
  onClick,
  ...props
}: GenreTagProps) {
  const navigate = useNavigate()
  const genreColor = getGenreColor(genre)

  // Extract HSL values to create theme-aware variations
  const hslMatch = genreColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  const [, hue, saturation] = hslMatch || ['', '0', '50', '50']

  // Create CSS custom properties for theme-aware colors
  const cssVars = {
    '--genre-hue': hue,
    '--genre-saturation': `${saturation}%`,
  } as React.CSSProperties

  // Handle click - stop propagation to prevent parent link from firing
  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (linkable) {
      e.preventDefault()
      e.stopPropagation()
      navigate(`/albums/1?genre=${encodeURIComponent(genre)}`)
    }
    onClick?.(e)
  }

  // Hover states
  const hoverClass = linkable
    ? "hover:shadow-md hover:scale-105 cursor-pointer"
    : ""

  return (
    <span
      className={cn(
        genreTagVariants({ size }),
        hoverClass,
        // Light mode styles
        "bg-[hsl(var(--genre-hue),var(--genre-saturation),95%)]",
        "border-[hsl(var(--genre-hue),var(--genre-saturation),70%)]",
        "text-[hsl(var(--genre-hue),var(--genre-saturation),30%)]",
        // Dark mode styles
        "dark:bg-[hsl(var(--genre-hue),var(--genre-saturation),15%)]",
        "dark:border-[hsl(var(--genre-hue),var(--genre-saturation),35%)]",
        "dark:text-[hsl(var(--genre-hue),var(--genre-saturation),85%)]",
        className
      )}
      style={cssVars}
      onClick={handleClick}
      {...props}
    >
      {genre}
    </span>
  )
}

export { GenreTag, genreTagVariants }
