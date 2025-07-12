import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Music } from 'lucide-react';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  date_added: string;
  date_release_year: string;
  uri_release: string;
  images_uri_release: {
    medium: string;
  };
}

interface Artist {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  image: string;
  latestAlbum: string;
  biography?: string;
}

interface ArtistCardProps {
  artist: Artist;
  onClick?: () => void;
}

export function ArtistCard({ artist, onClick }: ArtistCardProps) {
  const displayGenres = artist.genres.slice(0, 2);

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
      <Link to={artist.uri} className="h-full">
        <Card className="w-full h-full shadow-none hover:shadow-md transition-shadow flex flex-col">
          {children}
        </Card>
      </Link>
    );
  };

  return (
    <CardWrapper>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <AvatarGroup max={5}>
          {artist.albums
            .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
            .map((album, index) => {
              const albumPath = album.uri_release?.replace('/album/', '').replace('/', '') || '';
              return (
                <Link 
                  key={index} 
                  to={`/album/${albumPath}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block"
                >
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage 
                      src={album.images_uri_release.medium} 
                      alt={album.release_name}
                      className="object-cover"
                    />
                    <AvatarFallback className="text-[10px]">
                      {album.release_name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              );
            })}
        </AvatarGroup>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col">
        <div className="relative aspect-square bg-muted border-y">
          <img
            src={artist.image}
            alt={artist.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="pt-3 pb-4 px-4 flex-1 flex flex-col">
          <h2 className="font-semibold line-clamp-1">{artist.name}</h2>
        </div>
      </CardContent>
      <Separator className="mt-auto" />
      <CardFooter className="flex py-2 px-2">
        <div className="w-full">
          <p className="text-xs text-muted-foreground line-clamp-3">
            {artist.biography || `${artist.name} has ${artist.albumCount} album${artist.albumCount !== 1 ? 's' : ''} in the collection.`}
          </p>
        </div>
      </CardFooter>
    </CardWrapper>
  );
}