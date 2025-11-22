import { useState, useEffect } from 'react';
import { appConfig } from '@/config/app.config';
import type { ColorPalette } from '@/lib/colorExtractor';
import { getArtistImageFromData, getAlbumImageFromData } from '@/lib/image-utils';
import type { Album, Artist } from '@/types/album';

// Import section components
import { HeroSection } from '@/components/home/HeroSection';
import { RecentAlbumsSection } from '@/components/home/RecentAlbumsSection';
import { RecentArtistsSection } from '@/components/home/RecentArtistsSection';
import { GenresSection } from '@/components/home/GenresSection';
import { RandomCollectionSection } from '@/components/home/RandomCollectionSection';
import { RandomArtistsSection } from '@/components/home/RandomArtistsSection';

export function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
  const [recentArtists, setRecentArtists] = useState<Artist[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [randomizedGenreAlbums, setRandomizedGenreAlbums] = useState<Record<string, Album[]>>({});
  const [randomizedGenres, setRandomizedGenres] = useState<[string, number][]>([]);
  const [randomCollectionItems, setRandomCollectionItems] = useState<Album[]>([]);
  const [randomArtists, setRandomArtists] = useState<Artist[]>([]);
  const [colorPalettes, setColorPalettes] = useState<Record<string, ColorPalette>>({});
  const [nonRecentAlbums, setNonRecentAlbums] = useState<Album[]>([]);
  const [nonRecentArtists, setNonRecentArtists] = useState<Artist[]>([]);

  useEffect(() => {
    fetch('/collection.json')
      .then(res => res.json())
      .then((data: Album[]) => {
        setAlbums(data);

        // Get recent additions (configurable count + extra for hero rotation)
        const recentCount = Math.max(
          appConfig.homepage.recentlyAdded.displayCount,
          appConfig.homepage.hero.numberOfFeaturedAlbums
        ); // No extra since we're excluding them from random collection
        const recent = [...data]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .slice(0, recentCount);
        setRecentAlbums(recent);

        // Calculate genre counts and albums by decade for randomization
        const genreCounts = data.reduce((acc, album) => {
          album.genre_names.forEach(genre => {
            acc[genre] = (acc[genre] || 0) + 1;
          });
          return acc;
        }, {} as Record<string, number>);

        // Select random albums for the collection showcase, excluding recent ones
        const recentAlbumIds = new Set(recent.map(album => album.uri_release));
        const nonRecentAlbumsData = data.filter(album => !recentAlbumIds.has(album.uri_release));
        setNonRecentAlbums(nonRecentAlbumsData);

        const shuffledAlbums = [...nonRecentAlbumsData].sort(() => Math.random() - 0.5);
        const randomItems = shuffledAlbums.slice(0, appConfig.homepage.randomCollection.displayCount);
        console.log('HomePage: Setting randomCollectionItems:', {
          totalAlbums: data.length,
          recentAlbumsCount: recent.length,
          nonRecentAlbumsCount: nonRecentAlbumsData.length,
          shuffledCount: shuffledAlbums.length,
          randomItems: randomItems,
          randomItemsLength: randomItems.length,
          firstItem: randomItems[0],
          configDisplayCount: appConfig.homepage.randomCollection.displayCount
        });

        // Get recently added artists (unique by artist name, sorted by most recent album)
        const artistMap = new Map<string, { album: Album; artist: any }>();

        // Sort all albums by date_added (most recent first) and build artist map
        [...data]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .forEach(album => {
            album.artists.forEach(artist => {
              if (!artistMap.has(artist.name)) {
                artistMap.set(artist.name, { album, artist });
              }
            });
          });

        // Convert to array and take first 6 unique artists
        const recentArtistsList = Array.from(artistMap.entries())
          .slice(0, 6)
          .map(([_, { album, artist }]) => ({
            name: artist.name,
            uri: artist.uri_artist,
            avatar: artist.uri_artist ? getArtistImageFromData(artist.uri_artist, 'hi-res') : getAlbumImageFromData(album.uri_release, 'hi-res'),
            latestAlbum: album
          }));

        setRecentArtists(recentArtistsList);

        // Generate random artists excluding recent ones
        const recentArtistNames = new Set(recentArtistsList.map(artist => artist.name));

        // Get all unique artists from the collection
        const allArtistsMap = new Map<string, { album: Album; artist: any }>();
        data.forEach(album => {
          album.artists.forEach(artist => {
            if (!allArtistsMap.has(artist.name)) {
              allArtistsMap.set(artist.name, { album, artist });
            }
          });
        });

        // Filter out recent artists and convert to array
        const nonRecentArtistsList = Array.from(allArtistsMap.entries())
          .filter(([artistName]) => !recentArtistNames.has(artistName))
          .map(([_, { album, artist }]) => ({
            name: artist.name,
            uri: artist.uri_artist,
            avatar: artist.uri_artist ? getArtistImageFromData(artist.uri_artist, 'hi-res') : getAlbumImageFromData(album.uri_release, 'hi-res'),
            latestAlbum: album
          }));

        setNonRecentArtists(nonRecentArtistsList);

        // Select random artists
        const shuffledArtists = [...nonRecentArtistsList].sort(() => Math.random() - 0.5);
        const randomArtistItems = shuffledArtists.slice(0, appConfig.homepage.randomArtists.displayCount);
        setRandomArtists(randomArtistItems);

        console.log('HomePage: Setting randomArtists:', {
          totalUniqueArtists: allArtistsMap.size,
          recentArtistsCount: recentArtistsList.length,
          nonRecentArtistsCount: nonRecentArtistsList.length,
          randomArtistItems: randomArtistItems,
          randomArtistsLength: randomArtistItems.length,
          firstRandomArtist: randomArtistItems[0],
          configDisplayCount: appConfig.homepage.randomArtists.displayCount
        });

        // Randomize genre selection and albums
        const allGenres = Object.entries(genreCounts)
          .filter(([, count]) => count >= 4) // Only include genres with 4+ albums
          .sort(([, a], [, b]) => b - a); // Sort by count first

        // Take a random selection of 6 genres from genres with 4+ albums
        const shuffledGenres = [...allGenres].sort(() => Math.random() - 0.5);
        const selectedGenres = shuffledGenres.slice(0, 6);

        setRandomizedGenres(selectedGenres);

        // Pre-randomize genre representative albums for selected genres
        const genreAlbumMap: Record<string, Album[]> = {};

        // Randomize genre albums - provide multiple albums per genre for 2x2 grid
        selectedGenres.forEach(([genre]) => {
          const genreAlbums = data.filter(album => album.genre_names.includes(genre));
          if (genreAlbums.length > 0) {
            // Shuffle and take up to 4 albums for the 2x2 grid
            const shuffledGenreAlbums = [...genreAlbums].sort(() => Math.random() - 0.5);
            genreAlbumMap[genre] = shuffledGenreAlbums.slice(0, 4);
          }
        });

        setRandomizedGenreAlbums(genreAlbumMap);
        setRandomCollectionItems(randomItems);

        // Load pre-generated colors for featured albums (lazy loaded)
        const loadColors = async () => {
          // Set default palettes first for immediate render
          const palettes: Record<string, ColorPalette> = {};
          const featuredAlbums = recent.slice(0, appConfig.homepage.hero.numberOfFeaturedAlbums);

          for (const album of featuredAlbums) {
            palettes[album.uri_release] = {
              background: '#1a1a2e',
              foreground: '#ffffff',
              accent: '#0066cc',
              muted: '#666666',
            };
          }

          setColorPalettes(palettes);

          // Load actual colors in the background
          try {
            const response = await fetch('/album-colors.json');
            const allColors = await response.json();

            // Update with actual colors
            const updatedPalettes: Record<string, ColorPalette> = {};
            for (const album of featuredAlbums) {
              if (allColors[album.uri_release]) {
                updatedPalettes[album.uri_release] = allColors[album.uri_release];
              } else {
                updatedPalettes[album.uri_release] = palettes[album.uri_release];
              }
            }

            setColorPalettes(updatedPalettes);
          } catch (error) {
            console.warn('Failed to load pre-generated colors, using defaults:', error);
            // Keep default palettes already set
          }
        };

        loadColors();
      })
      .catch(error => console.error('Error loading collection:', error));
  }, []);

  // Auto-rotate featured albums
  useEffect(() => {
    if (recentAlbums.length > 0) {
      const interval = setInterval(() => {
        setFeaturedIndex((prev) => (prev + 1) % Math.min(appConfig.homepage.hero.numberOfFeaturedAlbums, recentAlbums.length));
      }, appConfig.homepage.hero.autoRotateInterval);
      return () => clearInterval(interval);
    }
  }, [recentAlbums]);

  // Function to refresh random collection items
  const refreshRandomCollection = () => {
    if (nonRecentAlbums.length > 0) {
      const shuffledAlbums = [...nonRecentAlbums].sort(() => Math.random() - 0.5);
      const randomItems = shuffledAlbums.slice(0, appConfig.homepage.randomCollection.displayCount);
      setRandomCollectionItems(randomItems);
      console.log('HomePage: Refreshed randomCollectionItems:', {
        nonRecentAlbumsCount: nonRecentAlbums.length,
        shuffledCount: shuffledAlbums.length,
        randomItems: randomItems,
        firstItem: randomItems[0]
      });
    }
  };

  // Function to refresh random artists
  const refreshRandomArtists = () => {
    if (nonRecentArtists.length > 0) {
      const shuffledArtists = [...nonRecentArtists].sort(() => Math.random() - 0.5);
      const randomArtistItems = shuffledArtists.slice(0, appConfig.homepage.randomArtists.displayCount);
      setRandomArtists(randomArtistItems);
      console.log('HomePage: Refreshed randomArtists:', {
        nonRecentArtistsCount: nonRecentArtists.length,
        shuffledCount: shuffledArtists.length,
        randomArtistItems: randomArtistItems,
        firstArtist: randomArtistItems[0]
      });
    }
  };

  // Function to refresh genre albums and selection
  const refreshGenreAlbums = () => {
    if (albums.length > 0) {
      // Calculate genre counts
      const genreCounts = albums.reduce((acc, album) => {
        album.genre_names.forEach(genre => {
          acc[genre] = (acc[genre] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>);

      // Randomize genre selection
      const allGenres = Object.entries(genreCounts)
        .filter(([, count]) => count >= 4) // Only include genres with 4+ albums
        .sort(([, a], [, b]) => b - a); // Sort by count first

      // Take a random selection of 6 genres from genres with 4+ albums
      const shuffledGenres = [...allGenres].sort(() => Math.random() - 0.5);
      const selectedGenres = shuffledGenres.slice(0, 6);

      setRandomizedGenres(selectedGenres);

      // Generate new randomized genre albums for selected genres
      const genreAlbumMap: Record<string, Album[]> = {};
      selectedGenres.forEach(([genre]) => {
        const genreAlbums = albums.filter(album => album.genre_names.includes(genre));
        if (genreAlbums.length > 0) {
          // Shuffle and take up to 4 albums for the 2x2 grid
          const shuffledGenreAlbums = [...genreAlbums].sort(() => Math.random() - 0.5);
          genreAlbumMap[genre] = shuffledGenreAlbums.slice(0, 4);
        }
      });

      setRandomizedGenreAlbums(genreAlbumMap);
      console.log('HomePage: Refreshed genres and albums:', {
        selectedGenres: selectedGenres.map(([genre]) => genre),
        genreCount: Object.keys(genreAlbumMap).length,
        firstGenre: Object.keys(genreAlbumMap)[0],
        firstGenreAlbums: Object.values(genreAlbumMap)[0]
      });
    }
  };

  const featuredAlbums = recentAlbums.slice(0, appConfig.homepage.hero.numberOfFeaturedAlbums);
  const currentFeatured = featuredAlbums[featuredIndex];
  const currentPalette = currentFeatured ? colorPalettes[currentFeatured.uri_release] : null;

  // Get top genres (calculated from state if albums are loaded)
  const topGenres = albums.length > 0
    ? Object.entries(albums.reduce((acc, album) => {
      album.genre_names.forEach(genre => {
        acc[genre] = (acc[genre] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
    : [];

  // Section component mapping
  const sectionComponents = {
    hero: () => (
      <HeroSection
        currentFeatured={currentFeatured}
        featuredAlbums={featuredAlbums}
        featuredIndex={featuredIndex}
        setFeaturedIndex={setFeaturedIndex}
        currentPalette={currentPalette}
      />
    ),
    recentAlbums: () => <RecentAlbumsSection recentAlbums={recentAlbums} />,
    recentArtists: () => <RecentArtistsSection recentArtists={recentArtists} />,
    genres: () => (
      <GenresSection
        topGenres={randomizedGenres}
        randomizedGenreAlbums={randomizedGenreAlbums}
        onRefresh={refreshGenreAlbums}
      />
    ),
    randomCollection: () => (
      <RandomCollectionSection
        randomCollectionItems={randomCollectionItems}
        onRefresh={refreshRandomCollection}
      />
    ),
    randomArtists: () => (
      <RandomArtistsSection
        randomArtists={randomArtists}
        onRefresh={refreshRandomArtists}
      />
    ),
  };

  return (
    <div className="space-y-16">
      {appConfig.homepage.sectionOrder.map((sectionKey, index) => {
        const SectionComponent = sectionComponents[sectionKey as keyof typeof sectionComponents];
        // Hero gets full width, other sections get container
        if (sectionKey === 'hero') {
          return SectionComponent ? <div key={sectionKey}>{SectionComponent()}</div> : null;
        }
        return SectionComponent ? (
          <div key={sectionKey} className="container mx-auto px-4">
            {SectionComponent()}
          </div>
        ) : null;
      })}
    </div>
  );
}