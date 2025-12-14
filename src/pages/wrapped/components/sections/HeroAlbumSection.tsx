import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { FullBleedBackground } from '../shared/FullBleedBackground';
import { AlbumHero } from '../shared/AlbumHero';
import { RevealText } from '../shared/RevealText';
import type { WrappedRelease } from '@/types/wrapped';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getImageUrl } from '@/lib/image-utils';

interface HeroAlbumSectionProps {
  release: WrappedRelease;
  colors: AlbumColorPalette | null;
  headline: string;
  subheadline?: string;
  showDate?: boolean;
  backgroundVariant?: 'default' | 'vibrant' | 'subtle' | 'deep' | 'cosmic';
}

export function HeroAlbumSection({
  release,
  colors,
  headline,
  subheadline,
  showDate = true,
  backgroundVariant = 'default',
}: HeroAlbumSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const formattedDate = new Date(release.date_added).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const imageSrc = getImageUrl((release.images['hi-res'] || release.images.medium).replace(/^\//, ''));

  return (
    <div ref={ref} className="relative h-full w-full flex items-center justify-center overflow-hidden">
      {/* Blurred background image */}
      <div className="absolute inset-0">
        <img
          src={imageSrc}
          alt=""
          className="w-full h-full object-cover blur-3xl scale-110 opacity-30"
          aria-hidden="true"
        />
      </div>

      <FullBleedBackground colors={colors} overlay="gradient" variant={backgroundVariant} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
          {/* Album artwork */}
          <div className="flex-shrink-0">
            <AlbumHero
              imageSrc={imageSrc}
              title={release.release_name}
              artist={release.release_artist}
              slug={release.slug}
              colors={colors}
              size="large"
              delay={0.2}
            />
          </div>

          {/* Content */}
          <div className="flex-1 text-center lg:text-left">
            {/* Headline */}
            <RevealText delay={0.3} className="mb-6">
              <p className="text-white/60 text-sm md:text-base uppercase tracking-[0.2em]">
                {headline}
              </p>
            </RevealText>

            {/* Album title */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <Link
                to={`/album/${release.slug}`}
                className="group inline-block"
              >
                <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight group-hover:opacity-80 transition-opacity">
                  {release.release_name}
                </h2>
              </Link>
            </motion.div>

            {/* Artist */}
            <motion.p
              className="mt-4 text-xl md:text-2xl text-white/80"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {release.release_artist}
            </motion.p>

            {/* Date added */}
            {showDate && (
              <motion.p
                className="mt-4 text-white/50 text-sm"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                Added {formattedDate}
              </motion.p>
            )}

            {/* Genres */}
            {release.genre_names.length > 0 && (
              <motion.div
                className="mt-6 flex flex-wrap justify-center lg:justify-start gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                {release.genre_names.slice(0, 3).map((genre, idx) => (
                  <span
                    key={`hero-genre-${idx}`}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70 backdrop-blur-sm"
                  >
                    {genre}
                  </span>
                ))}
              </motion.div>
            )}

            {/* Subheadline */}
            {subheadline && (
              <motion.p
                className="mt-8 text-white/40 text-sm max-w-md mx-auto lg:mx-0"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
              >
                {subheadline.replace(/your/gi, 'my')}
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
