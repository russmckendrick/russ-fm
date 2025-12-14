import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GenreTag } from '@/components/ui/genre-tag';
import { MetadataBadge } from '@/components/ui/metadata-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ColorPalette } from '@/lib/colorExtractor';
import { getReadableTextColor, createGlowGradient } from '@/lib/color-utils';
import { getAlbumImageFromData, getArtistAvatarFromData, handleImageError } from '@/lib/image-utils';
import type { Album } from '@/types/album';

interface HeroSectionProps {
  currentFeatured: Album | null;
  featuredAlbums: Album[];
  featuredIndex: number;
  setFeaturedIndex: (index: number) => void;
  currentPalette: ColorPalette | null;
}

export function HeroSection({
  currentFeatured,
  featuredAlbums,
  featuredIndex,
  setFeaturedIndex,
  currentPalette
}: HeroSectionProps) {
  if (!currentFeatured) return null;

  const createHeroBackground = (palette: ColorPalette | null) => {
    if (!palette) return 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)';
    return `linear-gradient(135deg, ${palette.background} 0%, ${palette.muted} 50%, ${palette.background} 100%)`;
  };

  const titleTextStyle = {
    color: currentPalette ? getReadableTextColor(currentPalette.background, currentPalette.foreground, currentPalette.accent) : '#ffffff'
  };

  const colorProperties = currentPalette ? {
    '--dynamic-accent': currentPalette.accent,
    '--dynamic-foreground': currentPalette.foreground,
    '--dynamic-background': currentPalette.background,
  } as React.CSSProperties : {};

  return (
    <motion.section
      className="relative w-full min-h-[60vh] md:min-h-[500px] flex items-center justify-center pb-8 pt-24 md:pt-32 px-4 overflow-hidden md:-mt-32"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Animated Background Effects */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`bg-${featuredIndex}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{
            background: createHeroBackground(currentPalette),
            ...colorProperties
          }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute top-0 left-0 w-full h-full opacity-40 mix-blend-overlay"
              style={{
                background: currentPalette ? `radial-gradient(circle at 20% 30%, ${currentPalette.accent} 0%, transparent 50%)` : 'none'
              }}
            />
            <div
              className="absolute bottom-0 right-0 w-full h-full opacity-30 mix-blend-overlay"
              style={{
                background: currentPalette ? `radial-gradient(circle at 80% 80%, ${currentPalette.accent} 0%, transparent 50%)` : 'none'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="container mx-auto relative z-10 max-w-6xl">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
          {/* Album Art - Floating */}
          <Link to={currentFeatured.uri_release} className="relative w-64 md:w-96 lg:w-[450px] h-64 md:h-96 lg:h-[450px] flex-shrink-0 mx-auto md:mx-0 block">
            <AnimatePresence mode="sync">
              <motion.div
                key={featuredIndex}
                className="absolute inset-0 group"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 1.0, ease: "easeInOut" }}
                whileHover={{ scale: 1.02 }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div
                  className="absolute -inset-4 rounded-2xl opacity-40 blur-2xl transition-all duration-700 group-hover:opacity-60"
                  style={{ background: currentPalette ? createGlowGradient(currentPalette, 'bold') : 'none' }}
                />
                <img
                  src={getAlbumImageFromData(currentFeatured.uri_release, 'hi-res')}
                  alt={currentFeatured.release_name}
                  className="relative w-full h-full rounded-xl shadow-2xl transition-transform duration-500 object-cover"
                  style={{
                    boxShadow: currentPalette ? `0 20px 40px -10px ${currentPalette.accent}60` : undefined
                  }}
                  onError={handleImageError}
                  loading="eager"
                />
              </motion.div>
            </AnimatePresence>
          </Link>

          {/* Header Info */}
          <div className="flex-1 relative flex items-center justify-center md:justify-start w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={featuredIndex}
                className="w-full flex flex-col justify-center text-center md:text-left space-y-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
              >
                <div className="space-y-2">
                  <Link to={currentFeatured.uri_release}>
                    <motion.h1
                      className="text-2xl md:text-6xl font-bold tracking-tight leading-tight text-balance hover:opacity-80 transition-opacity cursor-pointer text-foreground"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.6 }}
                    >
                      {currentFeatured.release_name}
                    </motion.h1>
                  </Link>
                  <motion.div
                    className="text-xl md:text-2xl font-medium opacity-90 text-foreground flex flex-wrap items-center justify-center md:justify-start gap-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                  >
                    {/* Artist Avatar(s) */}
                    {currentFeatured.artists && currentFeatured.artists.length > 1 ? (
                      <div className="flex -space-x-2">
                        {currentFeatured.artists.map((artist, index) => (
                          <Link key={index} to={artist.uri_artist} className="group/avatar">
                            <Avatar className="h-10 w-10 ring-2 ring-background shadow-md transition-transform group-hover/avatar:scale-110 group-hover/avatar:z-10 relative">
                              <AvatarImage
                                src={getArtistAvatarFromData(artist.uri_artist)}
                                alt={artist.name}
                                onError={handleImageError}
                              />
                              <AvatarFallback className="text-xs bg-muted">
                                {artist.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <Link to={currentFeatured.uri_artist} className="group/avatar">
                        <Avatar className="h-10 w-10 ring-2 ring-background shadow-md transition-transform group-hover/avatar:scale-110">
                          <AvatarImage
                            src={getArtistAvatarFromData(currentFeatured.uri_artist)}
                            alt={currentFeatured.release_artist}
                            onError={handleImageError}
                          />
                          <AvatarFallback className="text-xs bg-muted">
                            {currentFeatured.release_artist.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                    )}
                    {currentFeatured.artists && currentFeatured.artists.length > 1 ? (
                      currentFeatured.artists.map((artist, index) => (
                        <React.Fragment key={index}>
                          <Link
                            to={artist.uri_artist}
                            className="hover:underline decoration-2 underline-offset-4"
                          >
                            {artist.name}
                          </Link>
                          {index < currentFeatured.artists.length - 1 && <span>&</span>}
                        </React.Fragment>
                      ))
                    ) : (
                      <Link
                        to={currentFeatured.uri_artist}
                        className="hover:underline decoration-2 underline-offset-4"
                      >
                        {currentFeatured.release_artist}
                      </Link>
                    )}
                  </motion.div>
                </div>

                {/* Quick Stats Row */}
                <motion.div
                  className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <MetadataBadge>
                    {new Date(currentFeatured.date_release_year).getFullYear()}
                  </MetadataBadge>
                  {currentFeatured.genre_names.slice(0, 3).map((genre) => (
                    <GenreTag key={genre} genre={genre} size="md" linkable={true} />
                  ))}
                </motion.div>

                {/* Navigation dots - sleeker design */}
                {featuredAlbums.length > 1 && (
                  <motion.div
                    className="flex items-center justify-center md:justify-start gap-2 pt-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    {featuredAlbums.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setFeaturedIndex(index)}
                        className={`h-1.5 rounded-full transition-all duration-500 ${index === featuredIndex
                          ? 'w-12 bg-white/90'
                          : 'w-1.5 bg-white/30 hover:bg-white/50'
                          }`}
                        aria-label={`Go to album ${index + 1}`}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.section>
  );
}