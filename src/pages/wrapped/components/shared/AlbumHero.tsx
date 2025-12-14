import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { createGlowGradient } from '@/lib/color-utils';
import { handleImageError } from '@/lib/image-utils';

interface AlbumHeroProps {
  imageSrc: string;
  title: string;
  artist: string;
  slug: string;
  colors: AlbumColorPalette | null;
  size?: 'medium' | 'large' | 'xl';
  showLink?: boolean;
  delay?: number;
  className?: string;
}

export function AlbumHero({
  imageSrc,
  title,
  artist,
  slug,
  colors,
  size = 'large',
  showLink = true,
  delay = 0,
  className = '',
}: AlbumHeroProps) {
  const sizeClasses = {
    medium: 'w-64 h-64 md:w-80 md:h-80',
    large: 'w-72 h-72 md:w-96 md:h-96 lg:w-[450px] lg:h-[450px]',
    xl: 'w-80 h-80 md:w-[450px] md:h-[450px] lg:w-[500px] lg:h-[500px]',
  };

  const Content = (
    <motion.div
      className={`relative ${sizeClasses[size]} ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 1,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={showLink ? { scale: 1.02 } : {}}
    >
      {/* Glow effect */}
      <motion.div
        className="absolute -inset-4 md:-inset-6 rounded-2xl opacity-50 blur-2xl"
        style={{
          background: colors ? createGlowGradient(colors, 'bold') : 'none',
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.5, scale: 1 }}
        transition={{ duration: 1.2, delay: delay + 0.2 }}
      />

      {/* Album artwork */}
      <motion.img
        src={imageSrc}
        alt={`${title} by ${artist}`}
        className="relative w-full h-full rounded-xl shadow-2xl object-cover"
        style={{
          boxShadow: colors
            ? `0 25px 50px -12px ${colors.accent}60, 0 10px 30px -10px ${colors.background}80`
            : '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
        onError={handleImageError}
        loading="eager"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: delay + 0.1 }}
      />

      {/* Hover overlay */}
      {showLink && (
        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
      )}
    </motion.div>
  );

  if (showLink) {
    return (
      <Link to={`/album/${slug}`} className="group block">
        {Content}
      </Link>
    );
  }

  return Content;
}

// Compact version for grids
interface AlbumCardHeroProps {
  imageSrc: string;
  title: string;
  artist: string;
  slug: string;
  colors?: AlbumColorPalette | null;
  delay?: number;
  className?: string;
}

export function AlbumCardHero({
  imageSrc,
  title,
  artist,
  slug,
  colors,
  delay = 0,
  className = '',
}: AlbumCardHeroProps) {
  return (
    <Link to={`/album/${slug}`} className={`group block ${className}`}>
      <motion.div
        className="relative aspect-square overflow-hidden rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay }}
        whileHover={{ scale: 1.03 }}
      >
        {/* Subtle glow */}
        {colors && (
          <div
            className="absolute -inset-2 opacity-30 blur-xl transition-opacity group-hover:opacity-50"
            style={{ background: colors.accent }}
          />
        )}

        <img
          src={imageSrc}
          alt={`${title} by ${artist}`}
          className="relative w-full h-full object-cover rounded-lg"
          onError={handleImageError}
        />

        {/* Hover overlay with info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white font-semibold text-sm truncate">{title}</p>
            <p className="text-white/70 text-xs truncate">{artist}</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
