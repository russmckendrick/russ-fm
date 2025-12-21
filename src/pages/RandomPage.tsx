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
        className="relative w-full min-h-[80vh] flex items-center justify-center pb-12 pt-32 px-4 overflow-hidden transition-colors duration-800"
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

        {/* Main Content */}
        <div className="container mx-auto relative z-10 max-w-5xl">
          <motion.div
            key={randomAlbum.uri_release}
            initial={{ opacity: 0, y: 30 }}
            animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-center space-y-8"
          >
            {/* Album Artwork - The Hero */}
            <Link to={`/album/${getAlbumPath(randomAlbum)}`} className="block">
              <motion.div
                className="relative group mx-auto w-full max-w-3xl cursor-pointer"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={isVisible ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {/* Glow Effect */}
                <div
                  className="absolute -inset-8 rounded-2xl opacity-60 blur-3xl transition-all duration-700 group-hover:opacity-80"
                  style={{ background: createGlowGradient(albumColors, 'bold') }}
                />

                {/* Vinyl Record Peeking Out */}
                <div
                  className="absolute -right-4 top-1/2 -translate-y-1/2 w-[70%] h-[70%] rounded-full opacity-40 transition-all duration-500 group-hover:-right-6"
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

            {/* Album Title & Artist */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight text-foreground">
                <Link
                  to={`/album/${getAlbumPath(randomAlbum)}`}
                  className="hover:underline decoration-2 underline-offset-4 transition-colors"
                >
                  {randomAlbum.release_name}
                </Link>
                <span className="text-foreground/60 font-medium"> by </span>
                <Link
                  to={randomAlbum.uri_artist}
                  className="hover:underline decoration-2 underline-offset-4 transition-colors"
                >
                  {randomAlbum.release_artist}
                </Link>
              </h1>
            </motion.div>

            {/* Metadata */}
            <motion.div
              className="max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                <MetadataBadge>{getYear()}</MetadataBadge>
                {getGenres().map((genre, index) => (
                  <GenreTag key={index} genre={genre} size="md" linkable={true} />
                ))}
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              className="flex flex-wrap items-center justify-center gap-4 pt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <Button
                onClick={handleShuffle}
                size="lg"
                className="gap-3 px-10 py-6 text-lg shadow-lg hover:scale-105 transition-transform border-0 text-white font-medium"
                disabled={isShuffling}
                style={{
                  backgroundColor: albumColors.accent,
                }}
              >
                {isShuffling ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Finding Next Album...
                  </>
                ) : (
                  <>
                    <Shuffle className="h-5 w-5" />
                    Shuffle Discovery
                  </>
                )}
              </Button>

              <Link to={`/album/${getAlbumPath(randomAlbum)}`}>
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 px-10 py-6 text-lg shadow-lg hover:scale-105 transition-all font-medium text-foreground dark:text-white backdrop-blur-md"
                  style={{
                    borderColor: albumColors.accent,
                    backgroundColor: `${albumColors.background}40`
                  }}
                >
                  View Album
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageContainer>
  );
}