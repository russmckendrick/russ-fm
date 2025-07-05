import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  date_release_year: string;
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
  const displayGenres = album.genre_names.slice(0, 3);

  const albumPath = album.uri_release.replace('/album/', '').replace('/', '');

  if (onClick) {
    return (
      <Card 
        className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg overflow-hidden"
        onClick={onClick}
      >
      <div className="aspect-square relative overflow-hidden">
        <img
          src={album.images_uri_release.medium}
          alt={album.release_name}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
          loading="lazy"
        />
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2">
          {album.release_name}
        </h3>
        <p className="text-muted-foreground mb-2 line-clamp-1">
          {album.release_artist}
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          {year}
        </p>
        <div className="flex flex-wrap gap-1">
          {displayGenres.map((genre, index) => (
            <Badge 
              key={index} 
              variant="secondary" 
              className="text-xs capitalize"
            >
              {genre.toLowerCase()}
            </Badge>
          ))}
          {album.genre_names.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{album.genre_names.length - 3}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
    );
  }

  return (
    <Link to={`/album/${albumPath}`}>
      <Card 
        className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg overflow-hidden"
      >
        <div className="aspect-square relative overflow-hidden">
          <img
            src={album.images_uri_release.medium}
            alt={album.release_name}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
            loading="lazy"
          />
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2">
            {album.release_name}
          </h3>
          <p className="text-muted-foreground mb-2 line-clamp-1">
            {album.release_artist}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            {year}
          </p>
          <div className="flex flex-wrap gap-1">
            {displayGenres.map((genre, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="text-xs capitalize"
              >
                {genre.toLowerCase()}
              </Badge>
            ))}
            {album.genre_names.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{album.genre_names.length - 3}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}