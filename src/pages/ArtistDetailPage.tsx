import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Music, Globe, Calendar, ExternalLink, Disc, Users, Play, Clock } from 'lucide-react';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs, SiWikipedia } from 'react-icons/si';
import { FcCalendar, FcPlus, FcGlobe } from 'react-icons/fc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlbumCard } from '@/components/AlbumCard';
import { usePageTitle } from '@/hooks/usePageTitle';

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

interface ArtistData {
  id?: string;
  name: string;
  biography?: string;
  country?: string;
  formed_date?: string;
  genres: string[];
  followers?: number;
  popularity?: number;
  spotify_id?: string;
  spotify_url?: string;
  discogs_id?: string;
  discogs_url?: string;
  services?: {
    spotify?: {
      id?: string;
      url?: string;
      popularity?: number;
      followers?: {
        total?: number;
      };
      external_urls?: {
        spotify?: string;
      };
    };
    apple_music?: {
      url?: string;
      id?: string;
    };
    lastfm?: {
      url?: string;
      listeners?: number;
      playcount?: number;
      bio?: {
        content?: string;
        summary?: string;
      };
    };
    discogs?: {
      id?: string;
      url?: string;
    };
  };
  local_images: {
    'hi-res': string;
    medium: string;
    small: string;
  };
  images?: Array<{
    type: string;
    uri: string;
    uri150: string;
    uri500: string;
    width: number;
    height: number;
  }>;
}

export function ArtistDetailPage() {
  const { artistPath } = useParams<{ artistPath: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [biographyExpanded, setBiographyExpanded] = useState(false);

  // Set page title based on artist data
  const pageTitle = artistData 
    ? `${artistData.name} - ${albums.length} Album${albums.length !== 1 ? 's' : ''} | Russ.fm`
    : 'Loading Artist... | Russ.fm';
  
  usePageTitle(pageTitle);

  useEffect(() => {
    loadArtistData();
  }, [artistPath]);

  const loadArtistData = async () => {
    try {
      // Load collection to find albums by this artist
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json();
      
      // Filter albums by this artist (decode the artistPath)
      const decodedArtistPath = decodeURIComponent(artistPath || '');
      const artistAlbums = collection.filter((album: Album) => 
        album.uri_artist === `/artist/${decodedArtistPath}/`
      );
      
      setAlbums(artistAlbums);

      // Load detailed artist information if available
      if (artistAlbums.length > 0) {
        try {
          const artistDetailResponse = await fetch(`${artistAlbums[0].json_detailed_artist}`);
          const artistDetail = await artistDetailResponse.json();
          setArtistData(artistDetail);
        } catch (error) {
          console.error('Error loading artist details:', error);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading artist data:', error);
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading artist...</p>
        </div>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link to="/artists">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Artists
          </Button>
        </Link>
        <Card className="p-8 text-center">
          <CardContent>
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Artist not found</h3>
            <p className="text-muted-foreground">The requested artist could not be found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const artist = albums[0];
  const allGenres = [...new Set(albums.flatMap(album => album.genre_names))];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Button */}
      <Link to="/artists">
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Artists
        </Button>
      </Link>

      {/* Artist Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-1">
          <img
            src={artistData?.local_images?.['hi-res'] || artist.images_uri_artist['hi-res']}
            alt={artist.release_artist}
            className="w-full rounded-lg shadow-lg"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = artist.images_uri_artist['medium'] || artist.images_uri_artist['small'] || '';
            }}
          />
        </div>
        
        <div className="lg:col-span-2">
          <h1 className="text-4xl font-bold mb-4">{artist.release_artist}</h1>
          
          <div className="space-y-6">
            {/* Combined Info and Statistics */}
            <div className="flex flex-wrap items-center gap-6 text-sm">
              {/* Albums in Collection */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Disc className="h-4 w-4" />
                <span>{albums.length} album{albums.length !== 1 ? 's' : ''} in collection</span>
              </div>
              
              {/* Country */}
              {artistData?.country && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FcGlobe className="h-4 w-4" />
                  <span>{artistData.country}</span>
                </div>
              )}
              
              {/* Formed Date */}
              {artistData?.formed_date && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FcCalendar className="h-4 w-4" />
                  <span>Formed: {artistData.formed_date}</span>
                </div>
              )}

              {/* Spotify Followers */}
              {(artistData?.services?.spotify?.followers?.total || artistData?.followers) && (
                <div className="flex items-center gap-2">
                  <SiSpotify className="h-4 w-4 text-green-600" />
                  <span>{((artistData.services?.spotify?.followers?.total || artistData.followers) || 0).toLocaleString()} followers</span>
                </div>
              )}

              {/* Spotify Popularity */}
              {(artistData?.services?.spotify?.popularity || artistData?.popularity) && (
                <div 
                  className="flex items-center gap-2 cursor-help"
                  title="Spotify popularity (0-100) based on total plays and how recent they are."
                >
                  <SiSpotify className="h-4 w-4 text-green-600" />
                  <span>{artistData.services?.spotify?.popularity || artistData.popularity}% popularity</span>
                </div>
              )}

              {/* Last.fm Listeners */}
              {artistData?.services?.lastfm?.listeners && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-red-600" />
                  <span>{artistData.services.lastfm.listeners.toLocaleString()} listeners</span>
                </div>
              )}

              {/* Last.fm Plays */}
              {artistData?.services?.lastfm?.playcount && (
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-red-600" />
                  <span>{artistData.services.lastfm.playcount.toLocaleString()} plays</span>
                </div>
              )}
            </div>

            {/* Filtered Genres */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(() => {
                  // Filter and deduplicate genres
                  const filteredGenres = allGenres
                    .filter(genre => {
                      const lowerGenre = genre.toLowerCase().trim();
                      // Filter out band names, years, decades, and common non-genre terms
                      return !lowerGenre.includes(artist.release_artist.toLowerCase()) &&
                             !/^\d+s$/.test(lowerGenre) && // Decades like 90s, 80s, 70s
                             !/^(19|20)\d{2}$/.test(lowerGenre) && // Full years like 1985, 2023
                             lowerGenre.length > 0; // Remove empty tags
                    })
                    .map(genre => genre.toLowerCase().trim());
                  
                  // Remove duplicates
                  const uniqueGenres = [...new Set(filteredGenres)];
                  
                  return uniqueGenres.map((genre, index) => (
                    <Badge key={index} variant="default" className="capitalize">
                      <Music className="h-3 w-3 mr-1" />
                      {genre}
                    </Badge>
                  ));
                })()}
              </div>
            </div>

            {/* Service Buttons */}
            <div className="space-y-3 mt-6">
              {/* View on Discogs - Always spans full width */}
              {(artistData?.discogs_url || artistData?.discogs_id || artistData?.services?.discogs?.url) && (
                <Button 
                  variant="outline"
                  className="w-full btn-service btn-discogs h-12"
                  onClick={() => window.open(artistData?.discogs_url || artistData?.services?.discogs?.url || `https://www.discogs.com/artist/${artistData?.discogs_id || artistData?.services?.discogs?.id}`, '_blank')}
                >
                  <SiDiscogs className="service-icon" />
                  <span className="service-text">View on Discogs</span>
                </Button>
              )}

              {(() => {
                const serviceButtons = [];

                // Listen on Apple Music
                if (artistData?.services?.apple_music?.url) {
                  serviceButtons.push(
                    <Button 
                      key="apple"
                      variant="outline"
                      className="btn-service btn-apple-music h-12"
                      onClick={() => window.open(artistData.services.apple_music.url, '_blank')}
                    >
                      <SiApplemusic className="service-icon" />
                      <span className="service-text">Listen on Apple Music</span>
                    </Button>
                  );
                }

                // Listen on Spotify
                if (artistData?.spotify_url || artistData?.services?.spotify?.url || artistData?.services?.spotify?.external_urls?.spotify) {
                  serviceButtons.push(
                    <Button 
                      key="spotify"
                      variant="outline"
                      className="btn-service btn-spotify h-12"
                      onClick={() => window.open(artistData?.spotify_url || artistData?.services?.spotify?.url || artistData?.services?.spotify?.external_urls?.spotify, '_blank')}
                    >
                      <SiSpotify className="service-icon" />
                      <span className="service-text">Listen on Spotify</span>
                    </Button>
                  );
                }

                // View on Last.fm
                if (artistData?.services?.lastfm?.url) {
                  serviceButtons.push(
                    <Button 
                      key="lastfm"
                      variant="outline"
                      className="btn-service btn-lastfm h-12"
                      onClick={() => window.open(artistData.services.lastfm.url, '_blank')}
                    >
                      <SiLastdotfm className="service-icon" />
                      <span className="service-text">View on Last.fm</span>
                    </Button>
                  );
                }

                // View on Wikipedia
                serviceButtons.push(
                  <Button 
                    key="wikipedia"
                    variant="outline"
                    className="btn-service btn-wikipedia h-12"
                    onClick={() => window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(artist.release_artist)}`, '_blank')}
                  >
                    <SiWikipedia className="service-icon" />
                    <span className="service-text">View on Wikipedia</span>
                  </Button>
                );

                if (serviceButtons.length === 0) return null;

                const isOdd = serviceButtons.length % 2 === 1;
                const pairs = [];
                
                for (let i = 0; i < serviceButtons.length - (isOdd ? 1 : 0); i += 2) {
                  pairs.push(
                    <div key={`pair-${i}`} className="grid grid-cols-2 gap-3">
                      {serviceButtons[i]}
                      {serviceButtons[i + 1]}
                    </div>
                  );
                }

                if (isOdd) {
                  pairs.push(
                    <div key="last-button" className="w-full">
                      {React.cloneElement(serviceButtons[serviceButtons.length - 1], { 
                        className: serviceButtons[serviceButtons.length - 1].props.className.replace('btn-service', 'w-full btn-service')
                      })}
                    </div>
                  );
                }

                return pairs;
              })()}
            </div>

          </div>
        </div>
      </div>

      {/* Artist Biography */}
      {artistData?.biography && (
        <Card className="overflow-hidden mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Biography</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`relative ${!biographyExpanded ? 'max-h-48 overflow-hidden' : ''}`}>
              <div className="text-muted-foreground leading-relaxed">
                {(() => {
                  let bio = artistData.biography?.replace(/<[^>]*>/g, '').trim();
                  
                  // Remove everything from "Read more on Last.fm" onwards
                  const readMoreIndex = bio?.indexOf('Read more on Last.fm');
                  if (readMoreIndex !== -1) {
                    bio = bio?.substring(0, readMoreIndex).trim();
                  }
                  
                  // Remove everything from "Full Wikipedia article:" onwards
                  const wikiIndex = bio?.indexOf('Full Wikipedia article:');
                  if (wikiIndex !== -1) {
                    bio = bio?.substring(0, wikiIndex).trim();
                  }
                  
                  // Split by double newlines and create paragraphs
                  return bio?.split(/\n\s*\n/).map((paragraph, index) => (
                    <p key={index} className="mb-4 last:mb-0">
                      {paragraph.trim()}
                    </p>
                  ));
                })()}
              </div>
              {!biographyExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-950 pointer-events-none"></div>
              )}
            </div>
            <div className="mt-4 text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setBiographyExpanded(!biographyExpanded)}
                className="text-primary hover:text-primary-dark"
              >
                {biographyExpanded ? 'Show Less' : 'Read More'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Albums Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Disc className="h-6 w-6" />
            Albums in Collection
            <Badge variant="outline" className="ml-auto">
              {albums.length} albums
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {albums
              .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
              .map((album) => (
                <AlbumCard
                  key={album.uri_release}
                  album={album}
                />
              ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}