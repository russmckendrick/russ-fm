import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Music } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getAlbumImageFromData, getArtistAvatarFromData, handleImageError } from '@/lib/image-utils';
import { useAlbumColors } from '@/hooks/useAlbumColors';

interface Album {
  release_name: string;
  release_artist: string;
  artists?: Array<{
    name: string;
    uri_artist: string;
    images_uri_artist: {
      avatar: string;
    };
  }>;
  genre_names: string[];
  date_release_year: string;
  date_added: string;
  uri_release: string;
  images_uri_release: {
    medium: string;
  };
}

interface AlbumCardProps {
  album: Album;
  onClick?: () => void;
}

export function AlbumCard({ album, onClick }: AlbumCardProps) {
  const navigate = useNavigate();

  const albumPath = album.uri_release.replace('/album/', '').replace('/', '');
  const colors = useAlbumColors(albumPath);

  const year = new Date(album.date_release_year).getFullYear();
  const cleanGenres = getCleanGenresFromArray(album.genre_names, album.release_artist);
  const displayGenres = cleanGenres.slice(0, 3);

  const displayArtistName = album.release_artist;
  const displayAlbumName = album.release_name;

  const firstArtist = album.artists?.[0] || {
    name: album.release_artist,
    uri_artist: '',
    images_uri_artist: { avatar: '' }
  };

  const getAvatarUrl = (artist: typeof firstArtist) => {
    return getArtistAvatarFromData(artist.uri_artist);
  };

  const getArtistInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="group relative h-full"
    >
      {/* Dynamic Glow Effect */}
      <div
        className="absolute -inset-0.5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{
          background: colors ? `radial-gradient(circle at center, ${colors.accent}40, transparent 70%)` : 'transparent'
        }}
      />

      <Link
        to={`/album/${albumPath}`}
        onClick={handleCardClick}
        className="block h-full relative z-10"
      >
        <Card className="h-full border-0 bg-transparent shadow-none overflow-visible">
          <CardContent className="p-0 h-full flex flex-col gap-4">
            {/* Album Cover Container */}
            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-md transition-all duration-500 group-hover:shadow-xl group-hover:scale-[1.02]">
              <img
                src={getAlbumImageFromData(`/album/${albumPath}/`, 'medium')}
                alt={album.release_name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
                onError={handleImageError}
              />

              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />



              {/* Top Right Actions */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-panel">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/album/${albumPath}`);
                      }}
                    >
                      <SiLastdotfm className="mr-2 h-4 w-4" />
                      Scrobble to Last.fm
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!onClick) {
                          window.location.href = `/album/${albumPath}`;
                        }
                      }}
                    >
                      <Music className="mr-2 h-4 w-4" />
                      View Album Details
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Content Info */}
            <div className="flex flex-col gap-1 px-1">
              <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                {displayAlbumName}
              </h3>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Avatar className="h-5 w-5 border border-border">
                  <AvatarImage
                    src={getAvatarUrl(firstArtist)}
                    alt={firstArtist.name}
                    className="object-cover"
                    onError={handleImageError}
                  />
                  <AvatarFallback className="text-[10px]">
                    {getArtistInitials(firstArtist.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium line-clamp-1 hover:underline">
                  {displayArtistName}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-secondary/50 backdrop-blur-sm">
                  {year}
                </Badge>
                {displayGenres.map((genre, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-[10px] px-1.5 h-5 border-white/10 bg-white/5"
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}