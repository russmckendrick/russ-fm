import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shuffle, RefreshCw, Music, User } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';

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

interface Artist {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  images_uri_artist: {
    'hi-res': string;
    medium: string;
  };
}

interface RandomItem {
  type: 'album' | 'artist';
  data: Album | Artist;
}

export function RandomPage() {
  const [randomItems, setRandomItems] = useState<RandomItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isShuffling, setIsShuffling] = useState(false);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [itemVisibility, setItemVisibility] = useState([true, true, true]);

  usePageTitle('Random Discovery | RussFM');

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const albums: Album[] = await response.json();
      setAllAlbums(albums);
      
      // Process artists from albums
      const artists = processArtists(albums);
      setAllArtists(artists);
      
      loadInitialItems(albums, artists);
    } catch (error) {
      console.error('Error loading collection:', error);
      setIsLoading(false);
    }
  };

  const processArtists = (albums: Album[]): Artist[] => {
    const artistMap = new Map<string, Artist>();

    albums.forEach(album => {
      // Handle albums with multiple artists
      if (album.artists && album.artists.length > 0) {
        // Process each individual artist
        album.artists.forEach(artistInfo => {
          const artistName = artistInfo.name;
          
          // Skip "Various" artists
          if (artistName.toLowerCase() === 'various') {
            return;
          }
          
          if (!artistMap.has(artistName)) {
            artistMap.set(artistName, {
              name: artistName,
              uri: artistInfo.uri_artist,
              albums: [],
              albumCount: 0,
              genres: [],
              images_uri_artist: artistInfo.images_uri_artist,
            });
          }
          
          const artist = artistMap.get(artistName)!;
          artist.albums.push(album);
          artist.albumCount++;
          
          // Add genres
          album.genre_names.forEach(genre => {
            if (!artist.genres.includes(genre)) {
              artist.genres.push(genre);
            }
          });
        });
      }
    });

    return Array.from(artistMap.values()).filter(artist => artist.albumCount > 0);
  };

  const getRandomItems = (albums: Album[], artists: Artist[], currentShuffleCount: number): RandomItem[] => {
    const items: RandomItem[] = [];
    
    // Determine if we should include an artist (every 3-4 shuffles)
    const shouldIncludeArtist = currentShuffleCount > 0 && currentShuffleCount % 3 === 0 && artists.length > 0;
    
    if (shouldIncludeArtist) {
      // Add one random artist
      const randomArtist = artists[Math.floor(Math.random() * artists.length)];
      items.push({ type: 'artist', data: randomArtist });
      
      // Fill remaining slots with albums
      const randomAlbums = [...albums].sort(() => Math.random() - 0.5).slice(0, 2);
      randomAlbums.forEach(album => {
        items.push({ type: 'album', data: album });
      });
    } else {
      // All albums
      const randomAlbums = [...albums].sort(() => Math.random() - 0.5).slice(0, 3);
      randomAlbums.forEach(album => {
        items.push({ type: 'album', data: album });
      });
    }
    
    // Shuffle the final items array
    return items.sort(() => Math.random() - 0.5);
  };

  const loadInitialItems = (albums: Album[], artists: Artist[]) => {
    const selected = getRandomItems(albums, artists, 0);
    setRandomItems(selected);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const handleShuffle = () => {
    if (allAlbums.length > 0) {
      setIsShuffling(true);
      const newShuffleCount = shuffleCount + 1;
      
      // Create random order for items to change
      const randomOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
      
      // Fade out items in random order
      randomOrder.forEach((index, orderIndex) => {
        setTimeout(() => {
          setItemVisibility(prev => {
            const newVisibility = [...prev];
            newVisibility[index] = false;
            return newVisibility;
          });
        }, orderIndex * 150); // 150ms delay between each item
      });
      
      // After all items fade out, get new items
      setTimeout(() => {
        const newItems = getRandomItems(allAlbums, allArtists, newShuffleCount);
        setRandomItems(newItems);
        setShuffleCount(newShuffleCount);
        
        // Fade in new items in the same random order
        randomOrder.forEach((index, orderIndex) => {
          setTimeout(() => {
            setItemVisibility(prev => {
              const newVisibility = [...prev];
              newVisibility[index] = true;
              return newVisibility;
            });
          }, orderIndex * 150);
        });
        
        setIsShuffling(false);
      }, randomOrder.length * 150 + 100); // Wait for all to fade out plus a small buffer
    }
  };

  const getAlbumPath = (album: Album) => {
    return album.uri_release.replace('/album/', '').replace('/', '');
  };

  const getArtistPath = (artist: Artist) => {
    return artist.uri.replace('/artist/', '').replace('/', '');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-h1 mb-8">Random Discovery</h1>
        
        <Button 
          onClick={handleShuffle}
          size="lg"
          className="gap-3 px-8 py-4 text-lg"
          disabled={isShuffling || isLoading}
        >
          {isShuffling ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              Shuffling...
            </>
          ) : (
            <>
              <Shuffle className="h-5 w-5" />
              Shuffle
            </>
          )}
        </Button>
      </div>

      {/* Random Items */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-0">
                <div className="aspect-square bg-muted rounded-t-xl mb-4" />
                <div className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {randomItems.map((item, index) => (
            <div
              key={item.type === 'album' ? (item.data as Album).uri_release : (item.data as Artist).uri}
              className={`transition-all duration-300 ${
                itemVisibility[index] ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
            >
              {item.type === 'album' ? (
                <Link to={`/album/${getAlbumPath(item.data as Album)}`}>
                  <Card variant="interactive" className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="relative aspect-square overflow-hidden">
                        <img
                          src={(item.data as Album).images_uri_release.medium}
                          alt={(item.data as Album).release_name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-3 right-3">
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                            <Music className="h-3 w-3 mr-1" />
                            Album
                          </Badge>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold mb-1 line-clamp-1">
                          {(item.data as Album).release_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {(item.data as Album).release_artist}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Link to={`/artist/${getArtistPath(item.data as Artist)}`}>
                  <Card variant="interactive" className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="relative aspect-square overflow-hidden">
                        <img
                          src={(item.data as Artist).images_uri_artist.medium}
                          alt={(item.data as Artist).name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-3 right-3">
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                            <User className="h-3 w-3 mr-1" />
                            Artist
                          </Badge>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold mb-1 line-clamp-1">
                          {(item.data as Artist).name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {(item.data as Artist).albumCount} album{(item.data as Artist).albumCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}