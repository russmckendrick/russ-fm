import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Music, Globe, Calendar, ExternalLink, Disc } from 'lucide-react';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs } from 'react-icons/si';
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
            {/* Basic Info */}
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Disc className="h-4 w-4" />
                <span>{albums.length} album{albums.length !== 1 ? 's' : ''} in collection</span>
              </div>
              {artistData?.country && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>{artistData.country}</span>
                </div>
              )}
              {artistData?.formed_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Formed: {artistData.formed_date}</span>
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="flex items-center gap-6 text-sm">
              {(artistData?.services?.spotify?.followers?.total || artistData?.followers) && (
                <div className="flex items-center gap-2">
                  <SiSpotify className="h-4 w-4 text-green-600" />
                  <span>{((artistData.services?.spotify?.followers?.total || artistData.followers) || 0).toLocaleString()} followers</span>
                </div>
              )}
              {(artistData?.services?.spotify?.popularity || artistData?.popularity) && (
                <div className="flex items-center gap-2">
                  <SiSpotify className="h-4 w-4 text-green-600" />
                  <span>Popularity: {artistData.services?.spotify?.popularity || artistData.popularity}/100</span>
                </div>
              )}
              {artistData?.services?.lastfm?.listeners && (
                <div className="flex items-center gap-2">
                  <SiLastdotfm className="h-4 w-4 text-red-600" />
                  <span>{artistData.services.lastfm.listeners.toLocaleString()} listeners</span>
                </div>
              )}
              {artistData?.services?.lastfm?.playcount && (
                <div className="flex items-center gap-2">
                  <SiLastdotfm className="h-4 w-4 text-red-600" />
                  <span>{artistData.services.lastfm.playcount.toLocaleString()} plays</span>
                </div>
              )}
            </div>

            {/* Biography */}
            {(artistData?.biography || artistData?.services?.lastfm?.bio?.content) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Biography</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {(artistData.biography || artistData.services?.lastfm?.bio?.content || '')
                      .replace(/<[^>]*>/g, '')
                      .substring(0, 800)}
                    {(artistData.biography || artistData.services?.lastfm?.bio?.content || '').length > 800 && '...'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Genres */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {allGenres.map((genre, index) => (
                  <Badge key={index} variant="default" className="capitalize">
                    <Music className="h-3 w-3 mr-1" />
                    {genre.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>

            {/* External Links */}
            {(artistData?.spotify_url || artistData?.services || artistData?.discogs_url) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Listen & Explore</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(artistData.spotify_url || artistData.services?.spotify?.url || artistData.services?.spotify?.external_urls?.spotify) && (
                      <Button 
                        variant="outline"
                        className="btn-service btn-spotify justify-start h-12 p-3"
                        onClick={() => window.open(artistData.spotify_url || artistData.services?.spotify?.url || artistData.services?.spotify?.external_urls?.spotify, '_blank')}
                      >
                        <SiSpotify className="service-icon" />
                        <span className="service-text">Listen on Spotify</span>
                      </Button>
                    )}
                    {artistData.services?.apple_music?.url && (
                      <Button 
                        variant="outline"
                        className="btn-service btn-apple-music justify-start h-12 p-3"
                        onClick={() => window.open(artistData.services.apple_music.url, '_blank')}
                      >
                        <SiApplemusic className="service-icon" />
                        <span className="service-text">Listen on Apple Music</span>
                      </Button>
                    )}
                    {artistData.services?.lastfm?.url && (
                      <Button 
                        variant="outline"
                        className="btn-service btn-lastfm justify-start h-12 p-3"
                        onClick={() => window.open(artistData.services.lastfm.url, '_blank')}
                      >
                        <SiLastdotfm className="service-icon" />
                        <span className="service-text">View on Last.fm</span>
                      </Button>
                    )}
                    {(artistData.discogs_url || artistData.discogs_id || artistData.services?.discogs?.url) && (
                      <Button 
                        variant="outline"
                        className="btn-service btn-discogs justify-start h-12 p-3"
                        onClick={() => window.open(artistData.discogs_url || artistData.services?.discogs?.url || `https://www.discogs.com/artist/${artistData.discogs_id || artistData.services?.discogs?.id}`, '_blank')}
                      >
                        <SiDiscogs className="service-icon" />
                        <span className="service-text">View on Discogs</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

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
              .sort((a, b) => new Date(a.date_release_year).getTime() - new Date(b.date_release_year).getTime())
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