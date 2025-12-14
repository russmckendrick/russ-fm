import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { NeutralBackground } from '../shared/FullBleedBackground';
import { RevealText } from '../shared/RevealText';
import type { WrappedData } from '@/types/wrapped';
import { getImageUrl, handleImageError } from '@/lib/image-utils';

interface TopArtistsSectionProps {
  artists: WrappedData['insights']['artists'];
  accentColor?: string;
}

export function TopArtistsSection({
  artists,
  accentColor,
}: TopArtistsSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  // Take top 6 artists
  const topArtists = artists.slice(0, 6);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      <NeutralBackground variant="dark" accentColor={accentColor} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4">
        {/* Section title */}
        <RevealText delay={0.1} className="text-center mb-10 md:mb-14">
          <h2 className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em] mb-2">
            Most Collected
          </h2>
          <p className="text-white text-2xl md:text-3xl font-semibold">
            My Top Artists
          </p>
        </RevealText>

        {/* Artists grid */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6"
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          {topArtists.map((artist, index) => {
            const imageUrl = artist.images?.['hi-res']
              || artist.images?.medium
              || artist.images?.avatar;

            return (
              <motion.div key={`top-artist-${index}`} variants={itemVariants}>
                <Link
                  to={`/artist/${artist.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-white/5">
                    {/* Rank badge */}
                    <div className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {index + 1}
                      </span>
                    </div>

                    {/* Artist image or gradient placeholder */}
                    {imageUrl ? (
                      <img
                        src={getImageUrl(imageUrl.replace(/^\//, ''))}
                        alt={artist.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={handleImageError}
                      />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{
                          background: `linear-gradient(135deg, ${accentColor || '#3b82f6'}40 0%, ${accentColor || '#8b5cf6'}20 100%)`,
                        }}
                      />
                    )}

                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Content */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white font-semibold text-lg truncate group-hover:text-white/90 transition-colors">
                        {artist.name}
                      </p>
                      <p className="text-white/60 text-sm">
                        {artist.count} {artist.count === 1 ? 'album' : 'albums'}
                      </p>
                    </div>

                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(circle at 50% 100%, ${accentColor || '#3b82f6'} 0%, transparent 70%)`,
                      }}
                    />
                  </div>

                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
