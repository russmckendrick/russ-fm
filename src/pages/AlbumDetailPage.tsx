import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Disc, Calendar, ExternalLink, Globe, Music, Plus, Star, Play, Users, CalendarDays, MapPin } from 'lucide-react';
import { SiSpotify, SiApplemusic, SiLastdotfm, SiDiscogs } from 'react-icons/si';
import { FcCalendar, FcPlus, FcGlobe } from 'react-icons/fc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { filterGenres } from '@/lib/filterGenres';
import { getCleanGenres } from '@/lib/genreUtils';

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
      small: string;
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
  artists?: Array<{
    name: string;
    discogs_id?: string;
    spotify_id?: string;
  }>;
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
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showDescriptionButton, setShowDescriptionButton] = useState(false);

  // Set page title based on album data
  const pageTitle = detailedAlbum 
    ? `${detailedAlbum.title} by ${
        album?.artists && album.artists.length > 1 
          ? album.artists.map(artist => artist.name).join(' & ')
          : album?.release_artist || 'Unknown Artist'
      } | Russ.fm`
    : 'Loading Album... | Russ.fm';
  
  usePageTitle(pageTitle);

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

  const convertDurationToMs = (duration: string) => {
    if (!duration) return undefined;
    const parts = duration.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return (minutes * 60 + seconds) * 1000;
    }
    return undefined;
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
  
  // Get tracks from multiple sources with fallbacks - prioritize Discogs
  const getTracks = () => {
    // Try Discogs tracklist first (main tracklist from Discogs data)
    if (detailedAlbum?.tracklist && detailedAlbum.tracklist.length > 0) {
      // Check if this is a compilation with complex track structure
      const firstTrack = detailedAlbum.tracklist[0];
      if (firstTrack && typeof firstTrack === 'object' && 'title' in firstTrack && 'artists' in firstTrack) {
        // This is a compilation format - convert to our standard format
        return detailedAlbum.tracklist.map((track: any, index: number) => ({
          track_number: index + 1,
          name: track.title,
          duration_ms: track.duration ? convertDurationToMs(track.duration) : undefined,
          position: track.position,
          artists: track.artists // Keep artist info for compilations
        }));
      } else {
        // This is a regular tracklist format
        return detailedAlbum.tracklist;
      }
    }
    
    // Fallback to Spotify tracks (only if Discogs tracklist not available)
    if (detailedAlbum?.services?.spotify?.tracks && detailedAlbum.services.spotify.tracks.length > 0) {
      return detailedAlbum.services.spotify.tracks;
    }
    
    // Fallback to raw Spotify data tracks
    if (detailedAlbum?.services?.spotify?.raw_data?.tracks?.items && detailedAlbum.services.spotify.raw_data.tracks.items.length > 0) {
      return detailedAlbum.services.spotify.raw_data.tracks.items.map((track: any, index: number) => ({
        track_number: track.track_number || index + 1,
        name: track.name,
        duration_ms: track.duration_ms,
        position: track.disc_number > 1 ? `${track.disc_number}-${track.track_number}` : undefined,
        artists: undefined
      }));
    }
    
    // Last fallback to Last.fm tracks
    if (detailedAlbum?.services?.lastfm?.raw_data?.album?.tracks?.track) {
      const lastfmTracks = detailedAlbum.services.lastfm.raw_data.album.tracks.track;
      return (Array.isArray(lastfmTracks) ? lastfmTracks : [lastfmTracks]).map((track: any, index: number) => ({
        track_number: track['@attr']?.rank || index + 1,
        name: track.name,
        duration_ms: track.duration ? parseInt(track.duration) * 1000 : undefined,
        position: undefined,
        artists: undefined
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8">
        <div className="lg:col-span-2">
          <img
            src={album.images_uri_release['hi-res']}
            alt={album.release_name}
            className="w-full rounded-lg shadow-lg"
          />
        </div>
        
        <div className="lg:col-span-3">
          <div className="flex items-start gap-3 mb-4">
            {album.artists && album.artists.length > 1 ? (
              <div className="flex gap-2 mt-1">
                {album.artists.map((artist, index) => (
                  <Avatar key={index} className="h-20 w-20">
                    <AvatarImage 
                      src={artist.name.toLowerCase() === 'various' ? '/images/various.png' : artist.images_uri_artist['small']} 
                      alt={artist.name} 
                    />
                    <AvatarFallback className="text-xl">{artist.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            ) : (
              <Avatar className="h-20 w-20 mt-1">
                <AvatarImage 
                  src={album.release_artist.toLowerCase() === 'various' ? '/images/various.png' : album.images_uri_artist['small']} 
                  alt={album.release_artist} 
                />
                <AvatarFallback className="text-xl">{album.release_artist.charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-bold mb-2">{album.release_name}</h1>
              <div className="text-2xl text-muted-foreground">
                {album.artists && album.artists.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {album.artists.map((artist, index) => (
                      <React.Fragment key={index}>
                        {artist.name.toLowerCase() === 'various' ? (
                          <span className="text-muted-foreground">{artist.name}</span>
                        ) : (
                          <Link 
                            to={artist.uri_artist}
                            className="hover:text-primary transition-colors"
                          >
                            {artist.name}
                          </Link>
                        )}
                        {index < album.artists.length - 1 && (
                          <span className="text-muted-foreground/60">&</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  album.release_artist.toLowerCase() === 'various' ? (
                    <span className="text-muted-foreground">{album.release_artist}</span>
                  ) : (
                    <Link 
                      to={album.uri_artist}
                      className="hover:text-primary transition-colors inline-block"
                    >
                      {album.release_artist}
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Combined Info and Statistics */}
            <div className="flex flex-wrap items-center gap-6 text-sm">
              {/* Added Date */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <FcPlus className="h-4 w-4" />
                <span>Added: {new Date(album.date_added).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
              
              {/* Release Year */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <FcCalendar className="h-4 w-4" />
                <span>{year}</span>
              </div>
              
              {/* Country */}
              {detailedAlbum?.country && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FcGlobe className="h-4 w-4" />
                  <span>{detailedAlbum.country}</span>
                </div>
              )}

              {/* Spotify Rating/Popularity */}
              {detailedAlbum?.services?.spotify?.popularity && (
                <div className="relative group">
                  <div className="flex items-center gap-2 cursor-help">
                    <SiSpotify className="h-4 w-4 text-green-600" />
                    <span>{detailedAlbum.services.spotify.popularity}% popularity</span>
                  </div>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
                    <div className="text-center">
                      Spotify popularity (0-100) based on total plays and how recent they are. Albums being played a lot now rank higher than those played heavily in the past.
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              )}

              {/* Last.fm Listeners */}
              {detailedAlbum?.services?.lastfm?.listeners && (
                <div className="flex items-center gap-2">
                  <SiLastdotfm className="h-4 w-4 text-red-600" />
                  <span>{formatNumber(detailedAlbum.services.lastfm.listeners)} listeners</span>
                </div>
              )}

              {/* Last.fm Plays */}
              {detailedAlbum?.services?.lastfm?.playcount && (
                <div className="flex items-center gap-2">
                  <SiLastdotfm className="h-4 w-4 text-red-600" />
                  <span>{formatNumber(detailedAlbum.services.lastfm.playcount)} plays</span>
                </div>
              )}
            </div>

            {/* Genres and Styles */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(() => {
                  // Use clean genres from services or fallback to filtered genres
                  const cleanGenres = detailedAlbum ? getCleanGenres({
                    genres: [...album.genre_names, ...(detailedAlbum.styles || [])],
                    services: detailedAlbum.services
                  }) : filterGenres(album.genre_names, album.release_artist);
                  
                  return cleanGenres.map((tag, index) => (
                    <Badge key={index} variant="default">
                      <Music className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ));
                })()}
              </div>
            </div>

            {/* Service Buttons */}
            <div className="space-y-3 mt-6">
              {/* Last.fm Scrobble Button - Always spans full width */}
              <Button 
                onClick={() => {
                  const discogsId = detailedAlbum?.discogs_id || detailedAlbum?.id || album.uri_release.match(/\/(\d+)\//)?.[1];
                  if (discogsId) {
                    window.open(
                      `https://scrobbler.russ.fm/embed/${discogsId}/`,
                      'lastfm-scrobbler',
                      'width=400,height=600,scrollbars=no,resizable=no'
                    );
                  }
                }}
                className="w-full btn-service btn-lastfm h-12"
                variant="outline"
              >
                <SiLastdotfm className="service-icon" />
                <span className="service-text">Scrobble to Last.fm</span>
              </Button>

              {/* View on Discogs - Always spans full width */}
              {(detailedAlbum?.discogs_url || detailedAlbum?.discogs_id || detailedAlbum?.services?.discogs?.url || detailedAlbum?.services?.discogs?.id) && (
                <Button 
                  variant="outline"
                  className="w-full btn-service btn-discogs h-12"
                  onClick={() => window.open(detailedAlbum?.discogs_url || detailedAlbum?.services?.discogs?.url || `https://www.discogs.com/release/${detailedAlbum?.discogs_id || detailedAlbum?.services?.discogs?.id}`, '_blank')}
                >
                  <SiDiscogs className="service-icon" />
                  <span className="service-text">View on Discogs</span>
                </Button>
              )}

              {(() => {
                const serviceButtons = [];

                // Listen on Apple Music
                if (detailedAlbum?.services?.apple_music?.url) {
                  serviceButtons.push(
                    <Button 
                      key="apple"
                      variant="outline"
                      className="btn-service btn-apple-music h-12"
                      onClick={() => window.open(detailedAlbum.services.apple_music.url, '_blank')}
                    >
                      <SiApplemusic className="service-icon" />
                      <span className="service-text">Listen on Apple Music</span>
                    </Button>
                  );
                }

                // Listen on Spotify
                if (detailedAlbum?.spotify_url || detailedAlbum?.services?.spotify?.url || detailedAlbum?.services?.spotify?.raw_data?.external_urls?.spotify) {
                  serviceButtons.push(
                    <Button 
                      key="spotify"
                      variant="outline"
                      className="btn-service btn-spotify h-12"
                      onClick={() => window.open(detailedAlbum?.spotify_url || detailedAlbum?.services?.spotify?.url || detailedAlbum?.services?.spotify?.raw_data?.external_urls?.spotify, '_blank')}
                    >
                      <SiSpotify className="service-icon" />
                      <span className="service-text">Listen on Spotify</span>
                    </Button>
                  );
                }

                // View on Last.fm
                if (detailedAlbum?.services?.lastfm?.url) {
                  serviceButtons.push(
                    <Button 
                      key="lastfm"
                      variant="outline"
                      className="btn-service btn-lastfm h-12"
                      onClick={() => window.open(detailedAlbum.services.lastfm.url, '_blank')}
                    >
                      <SiLastdotfm className="service-icon" />
                      <span className="service-text">View on Last.fm</span>
                    </Button>
                  );
                }

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

      {/* Description */}
      {getAlbumDescription() && (
        <Card className="overflow-hidden mb-8">
          <CardHeader>
            <CardTitle className="text-lg">About This Album</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`relative ${!descriptionExpanded ? 'max-h-48 overflow-hidden' : ''}`}>
              <div 
                className="text-muted-foreground leading-relaxed"
                ref={(el) => {
                  if (el) {
                    // Check if content overflows the container
                    const hasOverflow = el.scrollHeight > 192; // 192px = max-h-48
                    setShowDescriptionButton(hasOverflow);
                  }
                }}
              >
                {(() => {
                  let description = getAlbumDescription();
                  
                  // Remove everything from "Read more on Last.fm" onwards
                  const readMoreIndex = description?.indexOf('Read more on Last.fm');
                  if (readMoreIndex !== -1) {
                    description = description?.substring(0, readMoreIndex).trim();
                  }
                  
                  // Handle different description formats
                  if (description?.includes('\n')) {
                    // Multi-paragraph format: Uses actual \n characters for paragraphs
                    return description.split('\n').filter(paragraph => paragraph.trim()).map((paragraph, index) => (
                      <p key={index} className="mb-4 last:mb-0">
                        {paragraph.trim()}
                      </p>
                    ));
                  } else {
                    // Single paragraph format
                    return (
                      <p className="mb-0">
                        {description}
                      </p>
                    );
                  }
                })()}
              </div>
              {!descriptionExpanded && showDescriptionButton && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-950 pointer-events-none"></div>
              )}
            </div>
            {showDescriptionButton && (
              <div className="mt-4 text-center">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  className="text-primary hover:text-primary-dark"
                >
                  {descriptionExpanded ? 'Show Less' : 'Read More'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              {tracks.map((track, index) => {
                // Check if this is a side/section title (empty position and duration)
                const isSectionTitle = !track.position && !getTrackDuration(track);
                
                if (isSectionTitle) {
                  return (
                    <div key={index} className="bg-muted/30 p-4 border-l-4 border-l-primary">
                      <h3 className="font-semibold text-lg text-primary">{track.name}</h3>
                    </div>
                  );
                }
                
                return (
                  <div key={index} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="text-muted-foreground font-mono text-sm w-12 flex-shrink-0">
                        {track.position || track.track_number || index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium block truncate">{track.name}</span>
                        {track.artists && track.artists.length > 0 && (
                          <span className="text-sm text-muted-foreground block truncate">
                            by {track.artists.map((artist: any) => artist.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    {getTrackDuration(track) && (
                      <div className="flex items-center gap-1 text-muted-foreground text-sm font-mono flex-shrink-0">
                        <Clock className="h-3 w-3" />
                        {getTrackDuration(track)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Artist Biographies */}
      {detailedAlbum?.artists && detailedAlbum.artists.some(artist => artist.biography && artist.name.toLowerCase() !== 'various') && (
        <div className="mt-8 space-y-8">
          {detailedAlbum.artists.map((artist, index) => 
            artist.biography && artist.name.toLowerCase() !== 'various' && (
              <Card key={index} className="overflow-hidden">
                <div className="flex">
                  <img
                    src={(() => {
                      // Find the matching artist image from the artists array
                      if (album.artists) {
                        const foundArtist = album.artists.find(a => a.name === artist.name);
                        if (foundArtist) {
                          return foundArtist.images_uri_artist['medium'];
                        }
                      }
                      // Fallback to combined artist image
                      return album.images_uri_artist['medium'];
                    })()}
                    alt={artist.name}
                    className="w-[300px] h-auto object-cover flex-shrink-0"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      // Use individual artist medium/small images if available
                      if (album.artists) {
                        const foundArtist = album.artists.find(a => a.name === artist.name);
                        if (foundArtist) {
                          target.src = foundArtist.images_uri_artist['medium'] || foundArtist.images_uri_artist['small'] || '';
                          return;
                        }
                      }
                      // Fallback to combined artist images
                      target.src = album.images_uri_artist['medium'] || album.images_uri_artist['small'] || '';
                    }}
                  />
                  <div className="flex-1 p-6">
                    <h3 className="text-2xl font-bold mb-3">{artist.name} Biography</h3>
                    <div className={`relative ${!biographyExpanded ? 'max-h-48 overflow-hidden' : ''}`}>
                      <div className="text-muted-foreground leading-relaxed">
                        {(() => {
                          let bio = artist.biography?.replace(/<[^>]*>/g, '').trim();
                          
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
                          
                          // Handle different biography formats
                          if (bio?.includes('\n')) {
                            // TheAudioDB format: Uses actual \n characters for paragraphs
                            return bio.split('\n').filter(paragraph => paragraph.trim()).map((paragraph, index) => (
                              <p key={index} className="mb-4 last:mb-0">
                                {paragraph.trim()}
                              </p>
                            ));
                          } else {
                            // Legacy format: Single paragraph, no newlines
                            return (
                              <p className="mb-0">
                                {bio}
                              </p>
                            );
                          }
                        })()}
                      </div>
                      {!biographyExpanded && (
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-950 pointer-events-none"></div>
                      )}
                    </div>
                    <div className="mt-4 text-center">
                      {artist.name.toLowerCase() === 'various' ? (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          disabled
                          className="text-muted-foreground"
                        >
                          {artist.name} (Compilation)
                        </Button>
                      ) : (
                        <Link 
                          to={
                            album.artists && album.artists.find(a => a.name === artist.name)?.uri_artist ||
                            album.uri_artist
                          }
                        >
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-primary hover:text-primary-dark"
                          >
                            Goto {artist.name} Page
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      )}

      {/* Release Information */}
      {detailedAlbum && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Release Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  {detailedAlbum.labels && detailedAlbum.labels.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Label:</span>
                      <span className="col-span-2 text-muted-foreground">{detailedAlbum.labels.join(', ')}</span>
                    </div>
                  )}
                  {detailedAlbum.formats && detailedAlbum.formats.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Format:</span>
                      <span className="col-span-2 text-muted-foreground">{detailedAlbum.formats.join(', ')}</span>
                    </div>
                  )}
                  {detailedAlbum.services?.spotify?.external_ids?.upc && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">UPC:</span>
                      <span className="col-span-2 text-muted-foreground font-mono text-sm">
                        {detailedAlbum.services.spotify.external_ids.upc}
                      </span>
                    </div>
                  )}
                  {/* Copyright Information */}
                  {detailedAlbum?.services?.spotify?.copyrights && detailedAlbum.services.spotify.copyrights.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Copyright:</span>
                      <div className="col-span-2 space-y-1">
                        {detailedAlbum.services.spotify.copyrights.map((copyright, index) => (
                          <div key={index} className="text-sm text-muted-foreground">
                            {copyright.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {/* Service IDs */}
                  {(detailedAlbum?.discogs_id || detailedAlbum?.id) && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Album Discogs ID:</span>
                      <span className="col-span-2 text-muted-foreground font-mono text-sm">
                        {detailedAlbum.discogs_id || detailedAlbum.id}
                      </span>
                    </div>
                  )}
                  {/* Artist Discogs IDs */}
                  {detailedAlbum?.artists && detailedAlbum.artists.length > 0 && detailedAlbum.artists.some(artist => (artist as any).discogs_id) && (
                    detailedAlbum.artists.map((artist, index) => 
                      (artist as any).discogs_id && (
                        <div key={index} className="grid grid-cols-3 gap-4">
                          <span className="font-semibold text-sm">{artist.name} Discogs ID:</span>
                          <span className="col-span-2 text-muted-foreground font-mono text-sm">
                            {(artist as any).discogs_id}
                          </span>
                        </div>
                      )
                    )
                  )}
                  {detailedAlbum?.services?.spotify?.id && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Spotify ID:</span>
                      <span className="col-span-2 text-muted-foreground font-mono text-sm">
                        {detailedAlbum.services.spotify.id}
                      </span>
                    </div>
                  )}
                  {detailedAlbum?.apple_music_id && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-semibold text-sm">Apple Music ID:</span>
                      <span className="col-span-2 text-muted-foreground font-mono text-sm">
                        {detailedAlbum.apple_music_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}