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
}

// Brand colors for common services
const BRAND_COLORS = {
  spotify: '#1DB954',
  'apple-music': '#FA243C',
  lastfm: '#D51007',
  discogs: '#333333',
  wikipedia: '#000000',
} as const

function ServiceButton({
  service = 'custom',
  brandColor,
  url,
  icon,
  children,
  className,
  onClick,
  ...props
}: ServiceButtonProps) {
  const color = brandColor || (service !== 'custom' ? BRAND_COLORS[service] : undefined)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (url) {
      window.open(url, '_blank')
    }
    onClick?.(e)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-9 px-4 border-2 text-white shadow-lg",
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
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </Button>
  )
}

export { ServiceButton }
