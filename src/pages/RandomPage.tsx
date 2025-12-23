import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GenreTag } from '@/components/ui/genre-tag';
import { MetadataBadge } from '@/components/ui/metadata-badge';
import { Shuffle, RefreshCw, ArrowRight } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { generateColorProperties, createHeroBackground, createGlowGradient } from '@/lib/color-utils';
import { useAlbumColorsWithFallback } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    json_detailed_artist: string;
    images_uri_artist: {
      'hi-res': string;
      medium: string;
    };
  }>;
  genre_names: string[];
  uri_release: string;
  uri_artist: string;
  date_added: string;
  date_release_year: string;
  json_detailed_release: string;
  json_detailed_artist: string;
  images_uri_release: {
    'hi-res': string;
    medium: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
  };
}

export function RandomPage() {
  const [randomAlbum, setRandomAlbum] = useState<Album | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isShuffling, setIsShuffling] = useState(false);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  // Get album path for color extraction
  const albumPath = randomAlbum?.uri_release.replace('/album/', '').replace('/', '') || '';
  const albumColors = useAlbumColorsWithFallback(albumPath);

  usePageTitle('Random Discovery | Russ.fm');

  const getRandomAlbum = (albums: Album[]): Album => {
    return albums[Math.floor(Math.random() * albums.length)];
  };

  const loadInitialAlbum = useCallback((albums: Album[]) => {
    const selected = getRandomAlbum(albums);
    setRandomAlbum(selected);
    setIsLoading(false);
  }, []);

  const loadCollection = useCallback(async () => {
    try {
      const response = await fetch('/collection.json');
      const albums: Album[] = await response.json();
      setAllAlbums(albums);
      loadInitialAlbum(albums);
    } catch (error) {
      console.error('Error loading collection:', error);
      setIsLoading(false);
    }
  }, [loadInitialAlbum]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const handleShuffle = useCallback(() => {
    if (allAlbums.length > 0) {
      setIsShuffling(true);

      // Fade out current album
      setIsVisible(false);

      // After fade out, get new album
      setTimeout(() => {
        const newAlbum = getRandomAlbum(allAlbums);
        setRandomAlbum(newAlbum);

        // Fade in new album
        setTimeout(() => {
          setIsVisible(true);
          setIsShuffling(false);
        }, 100);
      }, 400);
    }
  }, [allAlbums]);

  // Keyboard controls - space bar to shuffle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger if space bar and not in an input/textarea
      if (event.code === 'Space' &&
          !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        if (!isShuffling && allAlbums.length > 0) {
          handleShuffle();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShuffling, allAlbums, handleShuffle]);

  const getAlbumPath = (album: Album) => {
    return album.uri_release.replace('/album/', '').replace('/', '');
  };

  // Get year from album
  const getYear = () => {
    if (!randomAlbum) return '';
    return new Date(randomAlbum.date_release_year).getFullYear();
  };

  // Get clean genres
  const getGenres = () => {
    if (!randomAlbum) return [];
    return getCleanGenresFromArray(randomAlbum.genre_names, randomAlbum.release_artist).slice(0, 4);
  };

  // Generate CSS custom properties for album colors
  const colorProperties = generateColorProperties(albumColors);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your collection...</p>
        </div>
      </div>
    );
  }

  if (!randomAlbum) {
    return null;
  }

  return (
    <PageContainer variant="hero">
      {/* Hero Section - Album Spotlight */}
      <div
        className="relative w-full min-h-screen flex items-center justify-center py-4 sm:py-6 md:py-12 px-4 sm:px-6 overflow-hidden transition-colors duration-800"
        style={{
          background: createHeroBackground(albumColors),
          ...colorProperties
        }}
      >
        {/* Animated Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-0 left-0 w-full h-full opacity-40 mix-blend-overlay"
            style={{
              background: `radial-gradient(circle at 20% 30%, ${albumColors.accent} 0%, transparent 50%)`
            }}
          />
          <div
            className="absolute bottom-0 right-0 w-full h-full opacity-30 mix-blend-overlay"
            style={{
              background: `radial-gradient(circle at 80% 80%, ${albumColors.accent} 0%, transparent 50%)`
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="container mx-auto relative z-10 max-w-6xl px-4 sm:px-6">
          <motion.div
            key={randomAlbum.uri_release}
            initial={{ opacity: 0 }}
            animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col md:flex-row items-center gap-6 md:gap-10 lg:gap-16"
          >
            {/* Left Column - Album Artwork */}
            <div className="flex-shrink-0 w-full md:w-auto">
              <Link to={`/album/${getAlbumPath(randomAlbum)}`} className="block">
                <motion.div
                  className="relative group mx-auto w-[60vw] sm:w-[55vw] md:w-[42vw] lg:w-[36vw] max-w-sm sm:max-w-md md:max-w-lg cursor-pointer"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={isVisible ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {/* Glow Effect */}
                  <div
                    className="absolute -inset-4 sm:-inset-6 md:-inset-8 rounded-2xl opacity-60 blur-2xl sm:blur-3xl transition-all duration-700 group-hover:opacity-80"
                    style={{ background: createGlowGradient(albumColors, 'bold') }}
                  />

                  {/* Vinyl Record Peeking Out */}
                  <div
                    className="absolute -right-1 sm:-right-2 md:-right-4 top-1/2 -translate-y-1/2 w-[50%] h-[50%] sm:w-[60%] sm:h-[60%] md:w-[70%] md:h-[70%] rounded-full opacity-40 transition-all duration-500 group-hover:-right-2 sm:group-hover:-right-4 md:group-hover:-right-6"
                    style={{
                      background: `radial-gradient(circle, ${albumColors.muted} 20%, ${albumColors.background} 40%, transparent 60%)`,
                      boxShadow: `inset 0 0 50px ${albumColors.background}`,
                      transform: 'rotate(-3deg) translateY(-50%)'
                    }}
                  />

                  {/* Album Artwork */}
                  <motion.img
                    src={getAlbumImageFromData(randomAlbum.uri_release, 'hi-res')}
                    alt={randomAlbum.release_name}
                    onError={handleImageError}
                    className="relative w-full aspect-square rounded-xl shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
                    style={{
                      boxShadow: `0 25px 50px -12px ${albumColors.accent}80`,
                      transform: 'rotate(-1deg)'
                    }}
                    whileHover={{ rotate: 0 }}
                  />

                  {/* Reflection */}
                  <div
                    className="absolute -bottom-4 left-0 right-0 h-24 opacity-20 blur-xl"
                    style={{
                      background: `linear-gradient(to bottom, ${albumColors.accent}, transparent)`
                    }}
                  />
                </motion.div>
              </Link>
            </div>

            {/* Right Column - Text and Buttons */}
            <div className="flex-1 text-center md:text-left space-y-4 md:space-y-6">
              {/* Album Title & Artist */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="space-y-1 sm:space-y-2"
              >
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight leading-tight text-foreground">
                  <Link
                    to={`/album/${getAlbumPath(randomAlbum)}`}
                    className="hover:underline decoration-2 underline-offset-4 transition-colors"
                  >
                    {randomAlbum.release_name}
                  </Link>
                </h1>
                <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground font-medium">
                  by{' '}
                  <Link
                    to={randomAlbum.uri_artist}
                    className="text-foreground hover:underline decoration-2 underline-offset-4 transition-colors"
                  >
                    {randomAlbum.release_artist}
                  </Link>
                </p>
              </motion.div>

              {/* Metadata */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <MetadataBadge>{getYear()}</MetadataBadge>
                  {getGenres().map((genre, index) => (
                    <GenreTag key={index} genre={genre} size="md" linkable={true} />
                  ))}
                </div>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2"
                initial={{ opacity: 0, x: 20 }}
                animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <Button
                  onClick={handleShuffle}
                  size="lg"
                  className="gap-2 px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-sm sm:text-base md:text-lg shadow-lg hover:scale-105 transition-transform border-0 text-white font-medium"
                  disabled={isShuffling}
                  style={{
                    backgroundColor: albumColors.accent,
                  }}
                >
                  {isShuffling ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Finding...
                    </>
                  ) : (
                    <>
                      <Shuffle className="h-5 w-5" />
                      Shuffle
                    </>
                  )}
                </Button>

                <Link to={`/album/${getAlbumPath(randomAlbum)}`}>
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2 px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-sm sm:text-base md:text-lg shadow-lg hover:scale-105 transition-all font-medium text-foreground dark:text-white backdrop-blur-md"
                    style={{
                      borderColor: albumColors.accent,
                      backgroundColor: `${albumColors.background}40`
                    }}
                  >
                    View Album
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </Link>
              </motion.div>

              {/* Keyboard Hint - Desktop Only */}
              <motion.p
                className="hidden md:block text-sm text-muted-foreground/60"
                initial={{ opacity: 0 }}
                animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
              >
                Press <kbd className="px-2 py-1 bg-muted/50 rounded text-xs font-mono">Space</kbd> to shuffle
              </motion.p>
            </div>
          </motion.div>
        </div>
      </div>
    </PageContainer>
  );
}