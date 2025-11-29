import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ServiceButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Service name (e.g., 'spotify', 'apple-music', 'discogs', 'lastfm', 'wikipedia') */
  service?: 'spotify' | 'apple-music' | 'discogs' | 'lastfm' | 'wikipedia' | 'custom'
  /** Brand color for the button */
  brandColor?: string
  /** URL to open when clicked */
  url?: string
  /** Icon component */
  icon?: React.ReactNode
  /** Button text */
  children: React.ReactNode
  /** Custom className */
  className?: string
  /** Progress state for showing internal progress bar */
  progress?: { current: number; total: number } | null
}

// Brand colors for common services
const BRAND_COLORS = {
  spotify: '#1DB954',
  'apple-music': '#FA243C',
  lastfm: '#D51007',
  discogs: '#333333',
  wikipedia: '#000000',
} as const

// Helper to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ServiceButton({
  service = 'custom',
  brandColor,
  url,
  icon,
  children,
  className,
  onClick,
  progress,
  ...props
}: ServiceButtonProps) {
  const color = brandColor || (service !== 'custom' ? BRAND_COLORS[service] : undefined)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (url) {
      window.open(url, '_blank')
    }
    onClick?.(e)
  }

  // Calculate progress percentage
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0;
  // Use a white overlay for clear visibility on any brand color
  const progressFillColor = 'rgba(255, 255, 255, 0.35)';

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "relative overflow-hidden h-9 px-4 border-2 text-white shadow-lg",
        "transition-all duration-200 ease-in-out",
        "hover:scale-105 hover:shadow-xl hover:bg-white",
        "active:scale-95",
        "[&_svg]:transition-colors [&_svg]:duration-200",
        className
      )}
      style={{
        backgroundColor: color,
        borderColor: color,
        '--hover-color': color,
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        // Check if dark mode is active
        const isDark = document.documentElement.classList.contains('dark')
        const hoverBg = isDark ? '#6b7280' : 'white' // mid-grey in dark mode, white in light mode

        e.currentTarget.style.backgroundColor = hoverBg
        e.currentTarget.style.color = color || ''
        // Update SVG icon color
        const svg = e.currentTarget.querySelector('svg')
        if (svg && color) {
          svg.style.color = color
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = color || ''
        e.currentTarget.style.color = 'white'
        // Reset SVG icon color
        const svg = e.currentTarget.querySelector('svg')
        if (svg) {
          svg.style.color = 'white'
        }
      }}
      onClick={handleClick}
      {...props}
    >
      {/* Progress fill overlay */}
      {progress && (
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
          style={{
            width: `${progressPercent}%`,
            background: `linear-gradient(90deg, ${progressFillColor} 0%, rgba(255, 255, 255, 0.5) 100%)`,
          }}
        />
      )}

      {/* Button content - above the progress fill */}
      <span className="relative z-10 flex items-center">
        {icon && <span className="mr-2">{icon}</span>}
        {children}
      </span>
    </Button>
  )
}

export { ServiceButton }
