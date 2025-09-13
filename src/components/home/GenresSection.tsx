import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import type { Album } from '@/types/album';

interface GenresSectionProps {
  topGenres: [string, number][];
  randomizedGenreAlbums: Record<string, Album[]>;
  onRefresh?: () => void;
}

export function GenresSection({ topGenres, randomizedGenreAlbums, onRefresh }: GenresSectionProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="flex items-center justify-between mb-8"
        initial={{ opacity: 0, x: -20 }}
        animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-2xl lg:text-3xl font-light text-foreground">Genres</h2>
          {onRefresh && (
            <motion.button
              onClick={onRefresh}
              className="group flex items-center justify-center w-8 h-8 bg-secondary hover:bg-primary rounded-full transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              title="Shuffle genres"
            >
              <motion.div
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.3 }}
              >
                <Shuffle className="w-4 h-4 text-secondary-foreground group-hover:text-primary-foreground transition-colors" />
              </motion.div>
            </motion.button>
          )}
        </div>
        <Link to="/genres" className="text-primary hover:text-primary/80 transition-colors">
          Explore all genres →
        </Link>
      </motion.div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        {topGenres.map(([genre, count], index) => {
          // Get pre-randomized albums for this genre
          const genreAlbums = randomizedGenreAlbums[genre] || [];

          // Take first 4 albums for 2x2 grid, or pad with duplicates if fewer
          const displayAlbums = genreAlbums.length >= 4
            ? genreAlbums.slice(0, 4)
            : genreAlbums.length > 0
              ? [...genreAlbums, ...Array(4 - genreAlbums.length).fill(genreAlbums[0])].slice(0, 4)
              : [];

          // Randomize polaroid rotation for natural scatter effect
          const rotation = (index % 2 === 0 ? 1 : -1) * (Math.random() * 6 + 2);

          return displayAlbums.length > 0 ? (
            <motion.div
              key={`${genre}-${displayAlbums.map(a => a?.uri_release).join('-')}`}
              initial={{ opacity: 0, y: 30, rotate: rotation + 15 }}
              animate={{ opacity: 1, y: 0, rotate: rotation }}
              transition={{
                delay: 0.3 + index * 0.15,
                type: "spring",
                stiffness: 100,
                damping: 12
              }}
              whileHover={{
                scale: 1.05,
                rotate: 0,
                zIndex: 10,
                transition: { type: "spring", stiffness: 300, damping: 20 }
              }}
              className="relative"
            >
              <div className="group block">
                {/* Polaroid Frame */}
                <motion.div
                  className="bg-white p-4 pb-12 shadow-xl rounded-lg"
                  whileHover={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }}
                >
                  {/* 2x2 Photo Grid */}
                  <div className="aspect-square overflow-hidden rounded-sm">
                    <div className="grid grid-cols-2 gap-1 h-full">
                      {displayAlbums.slice(0, 4).map((album, albumIndex) => (
                        <Link
                          key={`${album?.uri_release}-${albumIndex}`}
                          to={album?.uri_release || '#'}
                          className="block overflow-hidden rounded-sm group/album"
                        >
                          <motion.img
                            key={album?.uri_release}
                            src={getAlbumImageFromData(album?.uri_release || '', 'medium')}
                            alt={album ? `${album.release_name} by ${album.release_artist}` : ''}
                            className="w-full h-full object-cover"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              delay: 0.4 + index * 0.15 + albumIndex * 0.05,
                              duration: 0.3
                            }}
                            whileHover={{ scale: 1.1 }}
                            onError={handleImageError}
                          />
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Genre Label (handwritten style) */}
                  <div className="absolute bottom-4 left-0 right-0 px-4">
                    <p className="text-center text-slate-700 font-medium text-lg tracking-wide"
                       style={{ fontFamily: '"Kalam", "Comic Sans MS", cursive' }}>
                      {genre}
                    </p>
                  </div>
                </motion.div>

                {/* Subtle tape effect */}
                <motion.div
                  className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-16 h-6 bg-yellow-100/80 rounded-sm shadow-sm border border-yellow-200/50 -rotate-3"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.15 }}
                />
              </div>
            </motion.div>
          ) : null;
        })}
      </div>
    </motion.section>
  );
}