import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Disc, Calendar, Users, ExternalLink, Globe, Music } from 'lucide-react';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs } from 'react-icons/si';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

interface Track {
  track_number: number;
  name: string;
  duration_ms?: number;
  position?: string;
}

interface DetailedAlbum {
  id?: string;
  title: string;
  artists: Array<{
    name: string;
    biography?: string;
  }>;
  released: string;
  year: number;
  country?: string;
  labels?: string[];
  formats?: string[];
  genres: string[];
  styles?: string[];
  tracklist?: Track[];
  images?: Array<{
    type: string;
    uri: string;
    uri150: string;
    uri500: string;
    width: number;
    height: number;
  }>;
  spotify_id?: string;
  spotify_url?: string;
  discogs_id?: string;
  discogs_url?: string;
  services?: {
    spotify?: {
      id?: string;
      url?: string;
      tracks?: Track[];
      popularity?: number;
      external_ids?: {
        upc?: string;
      };
      copyrights?: Array<{
        text: string;
        type: string;
      }>;
      raw_data?: {
        external_urls?: {
          spotify?: string;
        };
        tracks?: {
          items?: Array<{
            track_number?: number;
            name: string;
            duration_ms?: number;
            disc_number?: number;
          }>;
        };
      };
    };
    apple_music?: {
      url?: string;
      editorial_notes?: string;
      copyright?: string;
      artwork_url?: string;
      raw_attributes?: {
        editorialNotes?: {
          short?: string;
          standard?: string;
        };
      };
    };
    lastfm?: {
      listeners?: number;
      playcount?: number;
      wiki_content?: string;
      wiki_summary?: string;
      url?: string;
      raw_data?: {
        album?: {
          tracks?: {
            track?: any; // Can be array or single track
          };
        };
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
}

export function AlbumDetailPage() {
  const { albumPath } = useParams<{ albumPath: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [detailedAlbum, setDetailedAlbum] = useState<DetailedAlbum | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlbumData();
  }, [albumPath]);

  const loadAlbumData = async () => {
    try {
      // Load collection to find this specific album
      const collectionResponse = await fetch('/collection.json');
      const collection = await collectionResponse.json();
      
      // Find the album by its URI
      const foundAlbum = collection.find((item: Album) => 
        item.uri_release === `/album/${albumPath}/`
      );
      
      if (foundAlbum) {
        setAlbum(foundAlbum);

        // Load detailed album information
        try {
          const albumDetailResponse = await fetch(`${foundAlbum.json_detailed_release}`);
          const albumDetail = await albumDetailResponse.json();
          setDetailedAlbum(albumDetail);
        } catch (error) {
          console.error('Error loading album details:', error);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading album data:', error);
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (!ms) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getTrackDuration = (track: Track) => {
    if (track.duration_ms) {
      return formatDuration(track.duration_ms);
    }
    return '';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const cleanDescription = (text: string) => {
    // Remove HTML tags and clean up text
    return text?.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n').trim();
  };

  const getAlbumDescription = () => {
    if (detailedAlbum?.services?.apple_music?.raw_attributes?.editorialNotes?.short) {
      return cleanDescription(detailedAlbum.services.apple_music.raw_attributes.editorialNotes.short);
    }
    if (detailedAlbum?.services?.apple_music?.editorial_notes) {
      return cleanDescription(detailedAlbum.services.apple_music.editorial_notes);
    }
    if (detailedAlbum?.services?.lastfm?.wiki_summary) {
      return cleanDescription(detailedAlbum.services.lastfm.wiki_summary);
    }
    return null;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading album...</p>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Albums
          </Button>
        </Link>
        <Card className="p-8 text-center">
          <CardContent>
            <Disc className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Album not found</h3>
            <p className="text-muted-foreground">The requested album could not be found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const year = new Date(album.date_release_year).getFullYear();
  
  // Get tracks from multiple sources with fallbacks
  const getTracks = () => {
    // Try Spotify tracks first (usually has durations)
    if (detailedAlbum?.services?.spotify?.tracks && detailedAlbum.services.spotify.tracks.length > 0) {
      return detailedAlbum.services.spotify.tracks;
    }
    
    // Try main tracklist
    if (detailedAlbum?.tracklist && detailedAlbum.tracklist.length > 0) {
      return detailedAlbum.tracklist;
    }
    
    // Try raw Spotify data tracks
    if (detailedAlbum?.services?.spotify?.raw_data?.tracks?.items && detailedAlbum.services.spotify.raw_data.tracks.items.length > 0) {
      return detailedAlbum.services.spotify.raw_data.tracks.items.map((track: any, index: number) => ({
        track_number: track.track_number || index + 1,
        name: track.name,
        duration_ms: track.duration_ms,
        position: track.disc_number > 1 ? `${track.disc_number}-${track.track_number}` : undefined
      }));
    }
    
    // Try Last.fm tracks
    if (detailedAlbum?.services?.lastfm?.raw_data?.album?.tracks?.track) {
      const lastfmTracks = detailedAlbum.services.lastfm.raw_data.album.tracks.track;
      return (Array.isArray(lastfmTracks) ? lastfmTracks : [lastfmTracks]).map((track: any, index: number) => ({
        track_number: track['@attr']?.rank || index + 1,
        name: track.name,
        duration_ms: track.duration ? parseInt(track.duration) * 1000 : undefined,
        position: undefined
      }));
    }
    
    return [];
  };
  
  const tracks = getTracks();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Button */}
      <Link to="/">
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Albums
        </Button>
      </Link>

      {/* Album Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-1">
          <img
            src={album.images_uri_release['hi-res']}
            alt={album.release_name}
            className="w-full rounded-lg shadow-lg"
          />
        </div>
        
        <div className="lg:col-span-2">
          <h1 className="text-4xl font-bold mb-2">{album.release_name}</h1>
          <Link 
            to={album.uri_artist}
            className="text-2xl text-muted-foreground hover:text-primary transition-colors mb-4 inline-block"
          >
            {album.release_artist}
          </Link>
          
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{year}</span>
              </div>
              {detailedAlbum?.country && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span>{detailedAlbum.country}</span>
                </div>
              )}
            </div>

            {/* Statistics */}
            {detailedAlbum?.services && (
              <div className="flex items-center gap-6 text-sm">
                {detailedAlbum.services.spotify?.popularity && (
                  <div className="flex items-center gap-2">
                    <SiSpotify className="h-4 w-4 text-green-600" />
                    <span>Popularity: {detailedAlbum.services.spotify.popularity}/100</span>
                  </div>
                )}
                {detailedAlbum.services.lastfm?.listeners && (
                  <div className="flex items-center gap-2">
                    <SiLastdotfm className="h-4 w-4 text-red-600" />
                    <span>{formatNumber(detailedAlbum.services.lastfm.listeners)} listeners</span>
                  </div>
                )}
                {detailedAlbum.services.lastfm?.playcount && (
                  <div className="flex items-center gap-2">
                    <SiLastdotfm className="h-4 w-4 text-red-600" />
                    <span>{formatNumber(detailedAlbum.services.lastfm.playcount)} plays</span>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {getAlbumDescription() && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About This Album</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {getAlbumDescription()}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Genres and Styles */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {album.genre_names.map((genre, index) => (
                  <Badge key={index} variant="default" className="capitalize">
                    <Music className="h-3 w-3 mr-1" />
                    {genre.toLowerCase()}
                  </Badge>
                ))}
              </div>
              {detailedAlbum?.styles && detailedAlbum.styles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detailedAlbum.styles.map((style, index) => (
                    <Badge key={index} variant="outline" className="capitalize">
                      {style.toLowerCase()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Album Details */}
            {detailedAlbum && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Release Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detailedAlbum.labels && detailedAlbum.labels.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium min-w-[80px]">Label:</span>
                      <span className="text-muted-foreground">{detailedAlbum.labels.join(', ')}</span>
                    </div>
                  )}
                  {detailedAlbum.formats && detailedAlbum.formats.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium min-w-[80px]">Format:</span>
                      <span className="text-muted-foreground">{detailedAlbum.formats.join(', ')}</span>
                    </div>
                  )}
                  {detailedAlbum.services?.spotify?.external_ids?.upc && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium min-w-[80px]">UPC:</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {detailedAlbum.services.spotify.external_ids.upc}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Enhanced External Links */}
            {detailedAlbum?.services && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Listen & Explore</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(detailedAlbum.spotify_url || detailedAlbum.services?.spotify?.url || detailedAlbum.services?.spotify?.raw_data?.external_urls?.spotify) && (
                      <a 
                        href={detailedAlbum.spotify_url || detailedAlbum.services?.spotify?.url || detailedAlbum.services?.spotify?.raw_data?.external_urls?.spotify}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                      >
                        <SiSpotify className="h-4 w-4" />
                        <span className="text-sm font-medium">Spotify</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </a>
                    )}
                    {detailedAlbum.services?.apple_music?.url && (
                      <a 
                        href={detailedAlbum.services.apple_music.url}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                      >
                        <SiApplemusic className="h-4 w-4" />
                        <span className="text-sm font-medium">Apple Music</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </a>
                    )}
                    {detailedAlbum.services?.lastfm?.url && (
                      <a 
                        href={detailedAlbum.services.lastfm.url}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                      >
                        <SiLastdotfm className="h-4 w-4" />
                        <span className="text-sm font-medium">Last.fm</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </a>
                    )}
                    {(detailedAlbum.discogs_url || detailedAlbum.discogs_id || detailedAlbum.services?.discogs?.url || detailedAlbum.services?.discogs?.id) && (
                      <a 
                        href={detailedAlbum.discogs_url || detailedAlbum.services?.discogs?.url || `https://www.discogs.com/release/${detailedAlbum.discogs_id || detailedAlbum.services?.discogs?.id}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                      >
                        <SiDiscogs className="h-4 w-4" />
                        <span className="text-sm font-medium">Discogs</span>
                        <ExternalLink className="h-3 w-3 ml-auto" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Copyright Information */}
            {detailedAlbum?.services?.spotify?.copyrights && detailedAlbum.services.spotify.copyrights.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                {detailedAlbum.services.spotify.copyrights.map((copyright, index) => (
                  <p key={index}>{copyright.text}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tracklist */}
      {tracks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Disc className="h-6 w-6" />
              Tracklist
              <Badge variant="outline" className="ml-auto">
                {tracks.length} tracks
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {tracks.map((track, index) => (
                <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-muted-foreground font-mono text-sm w-8 flex-shrink-0">
                      {track.track_number || index + 1}
                    </span>
                    {track.position && (
                      <span className="text-muted-foreground font-mono text-xs bg-muted px-2 py-1 rounded flex-shrink-0">
                        {track.position}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium block truncate">{track.name}</span>
                    </div>
                  </div>
                  {getTrackDuration(track) && (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm font-mono flex-shrink-0">
                      <Clock className="h-3 w-3" />
                      {getTrackDuration(track)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Artist Biography */}
      {detailedAlbum?.artists && detailedAlbum.artists.some(artist => artist.biography) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="h-6 w-6" />
              About the Artist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailedAlbum.artists.map((artist, index) => 
              artist.biography && (
                <div key={index} className="space-y-4">
                  <h3 className="text-lg font-semibold">{artist.name}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {cleanDescription(artist.biography.substring(0, 500))}
                    {artist.biography.length > 500 && '...'}
                  </p>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Additional Images Gallery */}
      {detailedAlbum?.images && detailedAlbum.images.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Additional Images</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {detailedAlbum.images.slice(1, 7).map((image, index) => (
                <div key={index} className="aspect-square">
                  <img
                    src={image.uri500 || image.uri}
                    alt={`${album.release_name} - Image ${index + 2}`}
                    className="w-full h-full object-cover rounded-lg"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}