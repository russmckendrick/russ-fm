import { motion } from 'framer-motion';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { createGlowGradient } from '@/lib/color-utils';



export interface FullBleedBackgroundProps {
  colors: AlbumColorPalette | null;
  imageSrc?: string;
  imageAlt?: string;
  overlay?: 'dark' | 'light' | 'gradient' | 'none';
  blur?: boolean;
  animate?: boolean;
  className?: string;
  children?: React.ReactNode;
  variant?: 'default' | 'vibrant' | 'subtle' | 'deep';
}

export function FullBleedBackground({
  colors,
  imageSrc,
  imageAlt = 'Background',
  overlay = 'gradient',
  blur = false,
  animate = true,
  className = '',
  children,
  variant = 'default',
}: FullBleedBackgroundProps) {
  const defaultBackground = 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)';

  const createHeroGradient = (palette: AlbumColorPalette) => {
    switch (variant) {
      case 'vibrant':
        return `linear-gradient(135deg, 
          ${palette.accent} 0%, 
          ${palette.background} 40%, 
          ${palette.accent} 80%, 
          ${palette.background} 100%)`;
      case 'subtle':
        return `linear-gradient(135deg, 
          ${palette.background} 0%, 
          ${palette.muted} 50%, 
          ${palette.background} 100%)`;
      case 'deep':
        // A darker, richer mix that avoids muddy middle-tones
        return `linear-gradient(135deg, 
          ${palette.background} 0%, 
          #000000 40%, 
          ${palette.muted} 80%, 
          ${palette.background} 100%)`;
      case 'default':
      default:
        return `linear-gradient(135deg, ${palette.background} 0%, ${palette.muted} 50%, ${palette.background} 100%)`;
    }
  };

  const MotionWrapper = animate ? motion.div : 'div';
  const motionProps = animate
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 1.2, ease: 'easeInOut' },
    }
    : {};

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <MotionWrapper
        className="absolute inset-0"
        {...motionProps as any}
      >
        {/* Base gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: colors ? createHeroGradient(colors) : defaultBackground,
          }}
        />

        {/* Optional background image */}
        {imageSrc && (
          <div className="absolute inset-0">
            <img
              src={imageSrc}
              alt={imageAlt}
              className={`
                  w-full h-full object-cover
                  ${blur ? 'blur-2xl scale-110' : ''}
                `}
              loading="eager"
            />
          </div>
        )}

        {/* Accent color overlays - Adjusted by variant */}
        {colors && (
          <>
            <div
              className={`absolute top-0 left-0 w-full h-full mix-blend-overlay ${variant === 'subtle' ? 'opacity-20' :
                variant === 'vibrant' ? 'opacity-60' :
                  'opacity-40'
                }`}
              style={{
                background: `radial-gradient(circle at 20% 30%, ${colors.accent} 0%, transparent 50%)`,
              }}
            />
            <div
              className={`absolute bottom-0 right-0 w-full h-full mix-blend-overlay ${variant === 'subtle' ? 'opacity-10' :
                variant === 'vibrant' ? 'opacity-50' :
                  'opacity-30'
                }`}
              style={{
                background: `radial-gradient(circle at 80% 80%, ${colors.accent} 0%, transparent 50%)`,
              }}
            />
            {/* Extra glow in the center */}
            <div
              className={`absolute inset-0 ${variant === 'subtle' ? 'opacity-10' :
                variant === 'deep' ? 'opacity-10' :
                  'opacity-20'
                }`}
              style={{
                background: createGlowGradient(colors, variant === 'vibrant' ? 'bold' : 'medium'),
              }}
            />
          </>
        )}

        {/* Overlay options */}
        {overlay === 'dark' && (
          <div className="absolute inset-0 bg-black/50" />
        )}
        {overlay === 'light' && (
          <div className="absolute inset-0 bg-white/20" />
        )}
        {overlay === 'gradient' && (
          <div className={`absolute inset-0 bg-gradient-to-t from-background ${variant === 'deep' ? 'via-black/60' : 'via-background/50'
            } to-transparent`} />
        )}
      </MotionWrapper>

      {/* Content layer */}
      {children && (
        <div className="relative z-10 h-full">{children}</div>
      )}
    </div>
  );
}

// Simplified version for neutral backgrounds
interface NeutralBackgroundProps {
  variant?: 'dark' | 'darker' | 'accent';
  accentColor?: string;
  className?: string;
  children?: React.ReactNode;
}

export function NeutralBackground({
  variant = 'dark',
  accentColor,
  className = '',
  children,
}: NeutralBackgroundProps) {
  const backgrounds = {
    dark: 'bg-gradient-to-br from-zinc-900 via-zinc-950 to-black',
    darker: 'bg-black',
    accent: accentColor
      ? `bg-gradient-to-br from-zinc-900 to-zinc-950`
      : 'bg-gradient-to-br from-zinc-900 to-zinc-950',
  };

  return (
    <div className={`absolute inset-0 ${backgrounds[variant]} ${className}`}>
      {/* Subtle noise texture */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Accent glow if provided */}
      {accentColor && (
        <>
          <div
            className="absolute top-1/4 left-1/4 w-96 h-96 opacity-20 blur-3xl"
            style={{ background: accentColor }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-64 h-64 opacity-10 blur-3xl"
            style={{ background: accentColor }}
          />
        </>
      )}

      {children && (
        <div className="relative z-10 h-full">{children}</div>
      )}
    </div>
  );
}
