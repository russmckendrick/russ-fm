import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appConfig } from '@/config/app.config';
import type { ColorPalette } from '@/lib/colorExtractor';
import { getReadableTextColor } from '@/lib/color-utils';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
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

  return (
    <motion.section
      className="relative rounded-[2rem] overflow-hidden shadow-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Full background album artwork with blur */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${featuredIndex}`}
          className="absolute inset-0 w-full h-full"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        >
          <div
            className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat filter blur-3xl opacity-60"
            style={{
              backgroundImage: `url(${getAlbumImageFromData(currentFeatured.uri_release, 'medium')})`,
              transform: 'scale(1.2)'
            }}
          />

          {/* Dynamic gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: currentPalette
                ? `linear-gradient(135deg, 
                    ${currentPalette.background}F2 0%, 
                    ${currentPalette.background}CC 30%,
                    ${currentPalette.muted}99 60%,
                    ${currentPalette.accent}40 100%)`
                : 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.4) 100%)'
            }}
          />

          {/* Mesh Gradient Effect */}
          {currentPalette && (
            <div
              className="absolute inset-0 opacity-40 mix-blend-overlay"
              style={{
                backgroundImage: `
                  radial-gradient(at 0% 0%, ${currentPalette.accent} 0px, transparent 50%),
                  radial-gradient(at 100% 0%, ${currentPalette.muted} 0px, transparent 50%),
                  radial-gradient(at 100% 100%, ${currentPalette.background} 0px, transparent 50%),
                  radial-gradient(at 0% 100%, ${currentPalette.accent} 0px, transparent 50%)
                `
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-16 p-8 lg:p-16 min-h-[500px] items-center">
        {/* Floating Album Artwork */}
        <div className="relative group flex items-center justify-center lg:justify-start perspective-1000">
          <AnimatePresence mode="wait">
            <motion.div
              key={featuredIndex}
              className="relative w-72 h-72 lg:w-[450px] lg:h-[450px]"
              initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotateY: 15 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.02, rotateY: 5 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Glow effect */}
              <div
                className="absolute -inset-10 rounded-full opacity-50 blur-3xl transition-opacity duration-500"
                style={{
                  background: currentPalette
                    ? `radial-gradient(circle at center, ${currentPalette.accent}, transparent 70%)`
                    : 'radial-gradient(circle at center, rgba(255,255,255,0.2), transparent 70%)'
                }}
              />

              {/* Main album cover */}
              <div
                className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
                style={{
                  boxShadow: currentPalette
                    ? `0 25px 50px -12px ${currentPalette.background}66, 0 0 0 1px ${currentPalette.accent}33`
                    : '0 25px 50px -12px rgba(0,0,0,0.5)'
                }}
              >
                <img
                  src={getAlbumImageFromData(currentFeatured.uri_release, 'medium')}
                  srcSet={`
                    ${getAlbumImageFromData(currentFeatured.uri_release, 'small')} 400w,
                    ${getAlbumImageFromData(currentFeatured.uri_release, 'medium')} 800w,
                    ${getAlbumImageFromData(currentFeatured.uri_release, 'hi-res')} 1400w
                  `}
                  sizes="(max-width: 768px) 300px, 500px"
                  alt={`${currentFeatured.release_name} by ${currentFeatured.release_artist}`}
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                  loading="eager"
                />

                {/* Glassy sheen */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Album Info */}
        <AnimatePresence mode="wait">
          <motion.div
            key={featuredIndex}
            className="flex flex-col justify-center text-center lg:text-right space-y-8"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <div className="space-y-4">
              <motion.h1
                className="text-4xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-balance leading-[1.1]"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                {currentFeatured.release_name}
              </motion.h1>
              <motion.p
                className="text-xl lg:text-3xl font-medium opacity-90"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                {currentFeatured.release_artist}
              </motion.p>
            </div>

            <motion.div
              className="flex flex-wrap gap-2 justify-center lg:justify-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {currentFeatured.genre_names.slice(0, 3).map((genre) => (
                <Link key={genre} to={`/albums/1?genre=${encodeURIComponent(genre)}`}>
                  <Badge
                    variant="secondary"
                    className="px-4 py-1.5 text-sm backdrop-blur-md bg-white/10 hover:bg-white/20 border-white/10 text-white transition-all"
                  >
                    {genre}
                  </Badge>
                </Link>
              ))}
            </motion.div>

            <motion.div
              className="flex flex-col items-center lg:items-end gap-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                asChild
                size="lg"
                className="rounded-full px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                style={{
                  backgroundColor: currentPalette?.accent || 'white',
                  color: currentPalette?.accent
                    ? getReadableTextColor(currentPalette.accent)
                    : 'black'
                }}
              >
                <Link to={currentFeatured.uri_release}>
                  {appConfig.homepage.hero.exploreButtonText}
                </Link>
              </Button>

              {/* Navigation dots */}
              <div className="flex items-center gap-3 p-2 rounded-full bg-black/20 backdrop-blur-md">
                {featuredAlbums.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setFeaturedIndex(index)}
                    className={`relative w-2.5 h-2.5 rounded-full transition-all duration-300 ${index === featuredIndex ? 'w-8 bg-white' : 'bg-white/40 hover:bg-white/60'
                      }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}