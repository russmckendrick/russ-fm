import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shuffle, RefreshCw } from 'lucide-react';

interface Album {
  release_name: string;
  release_artist: string;
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
    small: string;
  };
  images_uri_artist: {
    'hi-res': string;
    medium: string;
    small: string;
  };
}

export function RandomPage() {
  const [randomAlbums, setRandomAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isShuffling, setIsShuffling] = useState(false);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [albumVisibility, setAlbumVisibility] = useState([true, true, true]);

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const albums: Album[] = await response.json();
      setAllAlbums(albums);
      loadInitialAlbums(albums);
    } catch (error) {
      console.error('Error loading collection:', error);
      setIsLoading(false);
    }
  };

  const getRandomAlbums = (albums: Album[]): Album[] => {
    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  };

  const loadInitialAlbums = (albums: Album[]) => {
    const selected = getRandomAlbums(albums);
    setRandomAlbums(selected);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const handleShuffle = () => {
    if (allAlbums.length > 0) {
      setIsShuffling(true);
      
      // Create random order for albums to change
      const randomOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
      
      // Fade out albums in random order
      randomOrder.forEach((index, orderIndex) => {
        setTimeout(() => {
          setAlbumVisibility(prev => {
            const newVisibility = [...prev];
            newVisibility[index] = false;
            return newVisibility;
          });
        }, orderIndex * 150); // 150ms delay between each album
      });
      
      // After all albums fade out, get new albums
      setTimeout(() => {
        const newAlbums = getRandomAlbums(allAlbums);
        setRandomAlbums(newAlbums);
        
        // Fade in new albums in the same random order
        randomOrder.forEach((index, orderIndex) => {
          setTimeout(() => {
            setAlbumVisibility(prev => {
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-8">Random Albums</h1>
        
        <Button 
          onClick={handleShuffle}
          size="lg"
          className="gap-2"
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

      {/* Albums */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-lg mb-4" />
              <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {randomAlbums.map((album, index) => (
            <div
              key={album.uri_release}
              className={`text-center transition-all duration-300 ${
                albumVisibility[index] ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
            >
              <Link 
                to={`/album/${getAlbumPath(album)}`}
                className="block group"
              >
                <div className="relative overflow-hidden rounded-lg shadow-lg group-hover:shadow-xl transition-all duration-300">
                  <img
                    src={album.images_uri_release.medium}
                    alt={album.release_name}
                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                </div>
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-1 group-hover:text-primary transition-colors">
                    {album.release_name}
                  </h3>
                  <p className="text-muted-foreground">
                    {album.release_artist}
                  </p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}