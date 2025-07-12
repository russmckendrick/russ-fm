import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, MoreHorizontal, Music } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';
import { getCleanGenresFromArray } from '@/lib/genreUtils';

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
  const year = new Date(album.date_release_year).getFullYear();
  const cleanGenres = getCleanGenresFromArray(album.genre_names, album.release_artist);
  const displayGenres = cleanGenres.slice(0, 2);

  const albumPath = album.uri_release.replace('/album/', '').replace('/', '');
  
  const firstArtist = album.artists?.[0] || {
    name: album.release_artist,
    uri_artist: '',
    images_uri_artist: { avatar: '' }
  };
  
  // Generate avatar URL from existing artist images
  const getAvatarUrl = (artist: typeof firstArtist) => {
    if (artist.images_uri_artist.avatar) {
      return artist.images_uri_artist.avatar;
    }
    // Derive avatar URL from hi-res or medium image
    const baseImage = (artist.images_uri_artist as any)['hi-res'] || artist.images_uri_artist.medium;
    if (baseImage) {
      return baseImage.replace(/-hi-res\.jpg$/, '-avatar.jpg').replace(/-medium\.jpg$/, '-avatar.jpg');
    }
    return '';
  };
  
  const getArtistInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const CardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (onClick) {
      return (
        <Card 
          className="w-full h-full shadow-none hover:shadow-md transition-shadow cursor-pointer flex flex-col"
          onClick={onClick}
        >
          {children}
        </Card>
      );
    }
    return (
      <Link to={`/album/${albumPath}`} className="h-full">
        <Card className="w-full h-full shadow-none hover:shadow-md transition-shadow flex flex-col">
          {children}
        </Card>
      </Link>
    );
  };

  return (
    <CardWrapper>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage 
              src={getAvatarUrl(firstArtist)} 
              alt={firstArtist.name}
              className="object-cover"
            />
            <AvatarFallback className="text-xs">
              {getArtistInitials(firstArtist.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5">
            <h6 className="text-sm leading-none font-medium">{album.release_artist}</h6>
            <span className="text-xs text-muted-foreground">Released: {year}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const discogsId = album.uri_release.match(/\/(\d+)\//)?.[1];
                if (discogsId) {
                  window.open(
                    `https://scrobbler.russ.fm/embed/${discogsId}/`,
                    'lastfm-scrobbler',
                    'width=400,height=600,scrollbars=no,resizable=no'
                  );
                }
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
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col">
        <div className="relative aspect-square bg-muted border-y">
          <img
            src={album.images_uri_release.medium}
            alt={album.release_name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="pt-3 pb-4 px-4 flex-1 flex flex-col">
          <h2 className="font-semibold line-clamp-1">{album.release_name}</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {displayGenres.map((genre, index) => (
              <span 
                key={index}
                className="text-sm text-blue-500"
              >
                #{genre.toLowerCase().replace(/[\s,&]+/g, '')}
              </span>
            ))}
            {cleanGenres.length > 2 && (
              <span className="text-sm text-muted-foreground">
                +{cleanGenres.length - 2} more
              </span>
            )}
          </div>
        </div>
      </CardContent>
      <Separator className="mt-auto" />
      <CardFooter className="flex py-2 px-2">
        <Button 
          variant="ghost" 
          className="w-full text-muted-foreground h-9 justify-start"
          onClick={(e) => {
            if (!onClick) {
              e.stopPropagation();
            }
          }}
        >
          <Calendar className="h-4 w-4 mr-2" />
          <span className="text-sm">Added {new Date(album.date_added).toLocaleDateString()}</span>
        </Button>
      </CardFooter>
    </CardWrapper>
  );
}