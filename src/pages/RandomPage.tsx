import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Cherry } from 'lucide-react';
import './RandomPage.css';

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
  const [currentAlbums, setCurrentAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [reelPositions, setReelPositions] = useState([0, 0, 0]);

  const loadCollection = async () => {
    try {
      const response = await fetch('/collection.json');
      const albums: Album[] = await response.json();
      setAllAlbums(albums);
      // Get initial random albums
      const initial = getRandomSelection(albums, 3);
      setCurrentAlbums(initial);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading collection:', error);
      setIsLoading(false);
    }
  };

  const getRandomSelection = (albums: Album[], count: number): Album[] => {
    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const handleSpin = () => {
    if (allAlbums.length > 0 && !isSpinning) {
      setIsSpinning(true);
      
      // Calculate random spins for each reel
      const spins = [
        Math.floor(Math.random() * 5) + 10, // 10-14 rotations
        Math.floor(Math.random() * 5) + 12, // 12-16 rotations
        Math.floor(Math.random() * 5) + 14, // 14-18 rotations
      ];
      
      setReelPositions(spins);
      
      // After animation completes, update albums
      setTimeout(() => {
        const newAlbums = getRandomSelection(allAlbums, 3);
        setCurrentAlbums(newAlbums);
        setReelPositions([0, 0, 0]);
        setIsSpinning(false);
      }, 3000);
    }
  };

  const getAlbumPath = (album: Album) => {
    return album.uri_release.replace('/album/', '').replace('/', '');
  };

  // Generate multiple album copies for smooth spinning
  const getReelAlbums = (index: number) => {
    if (!currentAlbums[index]) return [];
    
    // Create array with multiple copies for seamless spinning
    const album = currentAlbums[index];
    return Array(20).fill(album);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Slot Machine Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Cherry className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">Album Slot Machine</h1>
          <Cherry className="h-8 w-8 text-primary" />
        </div>
        <p className="text-xl text-muted-foreground mb-8">
          Pull the lever and let fate choose your next listen!
        </p>
      </div>

      {/* Slot Machine Container */}
      <div className="max-w-6xl mx-auto">
        <div className="slot-machine-frame">
          {/* Top decoration */}
          <div className="slot-machine-top">
            <div className="marquee-lights"></div>
          </div>
          
          {/* Slot Windows */}
          <div className="slot-machine-body">
            <div className="slot-windows">
              {isLoading ? (
                <div className="loading-slots">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="slot-column">
                      <div className="slot-window">
                        <div className="animate-pulse">
                          <div className="aspect-square bg-muted rounded-lg" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {currentAlbums.map((album, index) => (
                    <div key={`slot-${index}`} className="slot-column">
                      <div className="slot-window">
                        <div className="slot-mask">
                          <div 
                            className={`reel ${isSpinning ? 'spinning' : ''}`}
                            style={{
                              transform: `translateY(${isSpinning ? -reelPositions[index] * 100 : 0}%)`,
                              transition: isSpinning 
                                ? `transform ${2.5 + index * 0.3}s cubic-bezier(0.17, 0.67, 0.12, 0.99)`
                                : 'none'
                            }}
                          >
                            {/* Multiple copies for seamless spinning */}
                            {getReelAlbums(index).map((reelAlbum, copyIndex) => (
                              <div key={`${index}-${copyIndex}`} className="reel-item">
                                <Link 
                                  to={`/album/${getAlbumPath(album)}`}
                                  className="album-link"
                                  onClick={(e) => isSpinning && e.preventDefault()}
                                >
                                  <img
                                    src={album.images_uri_release.medium}
                                    alt={album.release_name}
                                    className="album-cover"
                                    draggable={false}
                                  />
                                  <div className="album-overlay">
                                    <h3>{album.release_name}</h3>
                                    <p>{album.release_artist}</p>
                                  </div>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Reel separator */}
                      {index < 2 && <div className="reel-separator"></div>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Spin Button */}
          <div className="slot-machine-controls">
            <Button 
              onClick={handleSpin}
              size="lg"
              className="spin-button"
              disabled={isSpinning || isLoading}
            >
              <Cherry className="h-6 w-6" />
              <span>{isSpinning ? 'SPINNING...' : 'PULL THE LEVER!'}</span>
            </Button>
          </div>
        </div>

        {/* Bottom text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            🎰 Your lucky albums today • Each spin reveals 3 new picks from your collection 🎰
          </p>
        </div>
      </div>
    </div>
  );
}