import { useState, useEffect, useRef, useCallback } from 'react';
import { appConfig } from '@/config/app.config';
import type { ColorPalette } from '@/lib/colorExtractor';
import { getArtistImageFromData, getAlbumImageFromData } from '@/lib/image-utils';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { Album, Artist } from '@/types/album';

// Section components
import { HeroSection } from '@/components/home/HeroSection';
import { RecentAlbumsSection } from '@/components/home/RecentAlbumsSection';
import { RecentArtistsSection } from '@/components/home/RecentArtistsSection';
import { GenresSection } from '@/components/home/GenresSection';
import { RandomCollectionSection } from '@/components/home/RandomCollectionSection';
import { RandomArtistsSection } from '@/components/home/RandomArtistsSection';
import { StatsAside } from '@/components/home/StatsAside';

/**
 * Editorial home page. The hero is full-bleed; everything below splits
 * into a main column (walls, genres, random grids) and a
 * sticky stats aside on wide viewports.
 */
export function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
  const [recentArtists, setRecentArtists] = useState<Artist[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [heroTimelineKey, setHeroTimelineKey] = useState(0);
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
      .then((collection: Album[]) => {
        // Boxset members never feature on the home page (recents, hero, walls, stats aside).
        const data = excludeBoxsetMembers(collection);
        setAlbums(data);

        const recentCount = Math.max(
          appConfig.homepage.recentlyAdded.displayCount,
          appConfig.homepage.hero.numberOfFeaturedAlbums,
        );
        const recent = [...data]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .slice(0, recentCount);
        setRecentAlbums(recent);

        const genreCounts = data.reduce((acc, album) => {
          album.genre_names.forEach(g => { acc[g] = (acc[g] || 0) + 1; });
          return acc;
        }, {} as Record<string, number>);

        // Random collection (exclude recents)
        const recentAlbumIds = new Set(recent.map(a => a.uri_release));
        const nonRecent = data.filter(a => !recentAlbumIds.has(a.uri_release));
        setNonRecentAlbums(nonRecent);

        setRandomCollectionItems(
          shuffle(nonRecent).slice(0, appConfig.homepage.randomCollection.displayCount),
        );

        // Recent artists — one entry per artist, sorted by most recent album
        const artistMap = new Map<string, { album: Album; artist: Album['artists'][0] }>();
        [...data]
          .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
          .forEach(album => {
            album.artists.forEach(artist => {
              if (!artistMap.has(artist.name)) artistMap.set(artist.name, { album, artist });
            });
          });

        const recentArtistsList: Artist[] = Array.from(artistMap.values())
          .slice(0, 12)
          .map(({ album, artist }) => ({
            name: artist.name,
            uri: artist.uri_artist,
            avatar: artist.uri_artist
              ? getArtistImageFromData(artist.uri_artist, 'hi-res')
              : getAlbumImageFromData(album.uri_release, 'hi-res'),
            latestAlbum: album,
          }));
        setRecentArtists(recentArtistsList);

        // Non-recent artists pool (for random roster)
        const recentArtistNames = new Set(recentArtistsList.map(a => a.name));
        const allArtistsMap = new Map<string, { album: Album; artist: Album['artists'][0] }>();
        data.forEach(album => {
          album.artists.forEach(artist => {
            if (!allArtistsMap.has(artist.name)) allArtistsMap.set(artist.name, { album, artist });
          });
        });
        const nonRecentArtistsList: Artist[] = Array.from(allArtistsMap.values())
          .filter(({ artist }) => !recentArtistNames.has(artist.name))
          .map(({ album, artist }) => ({
            name: artist.name,
            uri: artist.uri_artist,
            avatar: artist.uri_artist
              ? getArtistImageFromData(artist.uri_artist, 'hi-res')
              : getAlbumImageFromData(album.uri_release, 'hi-res'),
            latestAlbum: album,
          }));
        setNonRecentArtists(nonRecentArtistsList);
        setRandomArtists(
          shuffle(nonRecentArtistsList).slice(0, appConfig.homepage.randomArtists.displayCount),
        );

        // Genres — 6 random from those with >= 4 albums, each with 4 sample covers
        const allGenres = Object.entries(genreCounts)
          .filter(([, c]) => c >= 4)
          .sort(([, a], [, b]) => b - a);
        const selectedGenres = shuffle(allGenres).slice(0, 6);
        setRandomizedGenres(selectedGenres);

        const genreAlbumMap: Record<string, Album[]> = {};
        selectedGenres.forEach(([genre]) => {
          const gAlbums = data.filter(a => a.genre_names.includes(genre));
          if (gAlbums.length) genreAlbumMap[genre] = shuffle(gAlbums).slice(0, 4);
        });
        setRandomizedGenreAlbums(genreAlbumMap);

        // Colour palettes for hero albums
        const featured = recent.slice(0, appConfig.homepage.hero.numberOfFeaturedAlbums);
        const fallback: ColorPalette = {
          background: '#8a8377',
          foreground: '#ffffff',
          accent: '#c03a2b',
          muted: '#5a534a',
        };
        const seed: Record<string, ColorPalette> = {};
        featured.forEach(a => { seed[a.uri_release] = fallback; });
        setColorPalettes(seed);

        fetch('/album-colors.json')
          .then(r => r.json())
          .then((all: Record<string, ColorPalette>) => {
            const updated: Record<string, ColorPalette> = {};
            featured.forEach(a => { updated[a.uri_release] = all[a.uri_release] || fallback; });
            setColorPalettes(updated);
          })
          .catch(() => {
            /* keep fallbacks */
          });
      })
      .catch(error => console.error('Error loading collection:', error));
  }, []);

  // Auto-rotate featured albums. The interval lives in a ref so the
  // manual-select handler can clear + restart it without tearing down
  // the effect, keeping the timeline sweep aligned to real elapsed time.
  const rotateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRotateMs = appConfig.homepage.hero.autoRotateInterval;
  const featuredCount = Math.min(
    appConfig.homepage.hero.numberOfFeaturedAlbums,
    recentAlbums.length,
  );

  const startRotateInterval = useCallback(() => {
    if (rotateIntervalRef.current) clearInterval(rotateIntervalRef.current);
    if (featuredCount === 0) return;
    rotateIntervalRef.current = setInterval(() => {
      setFeaturedIndex(prev => (prev + 1) % featuredCount);
      setHeroTimelineKey(prev => prev + 1);
    }, autoRotateMs);
  }, [featuredCount, autoRotateMs]);

  useEffect(() => {
    startRotateInterval();
    return () => {
      if (rotateIntervalRef.current) clearInterval(rotateIntervalRef.current);
    };
  }, [startRotateInterval]);

  const handleSelectFeaturedIndex = useCallback(
    (index: number) => {
      setFeaturedIndex(index);
      setHeroTimelineKey(prev => prev + 1);
      startRotateInterval();
    },
    [startRotateInterval],
  );

  const refreshRandomCollection = () => {
    if (!nonRecentAlbums.length) return;
    setRandomCollectionItems(
      shuffle(nonRecentAlbums).slice(0, appConfig.homepage.randomCollection.displayCount),
    );
  };

  const refreshRandomArtists = () => {
    if (!nonRecentArtists.length) return;
    setRandomArtists(
      shuffle(nonRecentArtists).slice(0, appConfig.homepage.randomArtists.displayCount),
    );
  };

  const refreshGenreAlbums = () => {
    if (!albums.length) return;
    const genreCounts = albums.reduce((acc, album) => {
      album.genre_names.forEach(g => { acc[g] = (acc[g] || 0) + 1; });
      return acc;
    }, {} as Record<string, number>);

    const allGenres = Object.entries(genreCounts)
      .filter(([, c]) => c >= 4)
      .sort(([, a], [, b]) => b - a);
    const selectedGenres = shuffle(allGenres).slice(0, 6);
    setRandomizedGenres(selectedGenres);

    const map: Record<string, Album[]> = {};
    selectedGenres.forEach(([genre]) => {
      const gAlbums = albums.filter(a => a.genre_names.includes(genre));
      if (gAlbums.length) map[genre] = shuffle(gAlbums).slice(0, 4);
    });
    setRandomizedGenreAlbums(map);
  };

  const featuredAlbums = recentAlbums.slice(0, appConfig.homepage.hero.numberOfFeaturedAlbums);
  const safeFeaturedIndex = featuredAlbums.length ? featuredIndex % featuredAlbums.length : 0;
  const currentFeatured = featuredAlbums[safeFeaturedIndex];
  const currentPalette = currentFeatured ? colorPalettes[currentFeatured.uri_release] : null;

  // Map section keys → component render functions
  const sections: Record<string, () => JSX.Element | null> = {
    hero: () => (
      <HeroSection
        currentFeatured={currentFeatured}
        featuredAlbums={featuredAlbums}
        featuredIndex={safeFeaturedIndex}
        currentPalette={currentPalette}
        autoRotateMs={autoRotateMs}
        timelineKey={heroTimelineKey}
        onSelectIndex={handleSelectFeaturedIndex}
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

  const mainSections = appConfig.homepage.sectionOrder.filter(k => k !== 'hero');

  return (
    <>
      {appConfig.homepage.sectionOrder.includes('hero') && sections.hero()}

      <div className="mx-auto w-full max-w-[1640px] px-5 py-10 md:px-8 md:py-14">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-14">
            {mainSections.map(key => {
              const render = sections[key];
              return render ? <div key={key}>{render()}</div> : null;
            })}
          </div>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <StatsAside albums={albums} />
          </div>
        </div>
      </div>
    </>
  );
}

// --- Helpers -------------------------------------------------------------

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
