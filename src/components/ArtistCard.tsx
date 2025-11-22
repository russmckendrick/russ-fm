import { Link, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  date_added: string;
  date_release_year: string;
  uri_release: string;
  images_uri_release: {
    medium: string;
    avatar?: string;
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
  const navigate = useNavigate();

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  const CardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (onClick) {
      return (
        <div
          className="w-full h-full cursor-pointer focus:outline-none outline-none"
          onClick={handleCardClick}
        >
          {children}
        </div>
      );
    }
    return (
      <Link to={artist.uri} className="block h-full focus:outline-none focus-visible:outline-none outline-none">
        {children}
      </Link>
    );
  };

  return (
    <div className="group relative h-full">
      <CardWrapper>
        <div className="h-full flex flex-col gap-4">
          {/* Artist Image Container */}
          <div className="relative aspect-square rounded-full overflow-hidden shadow-md transition-all duration-500">
            <img
              src={artist.image}
              alt={artist.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              loading="lazy"
            />

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Content Info */}
          <div className="flex flex-col items-center text-center gap-1 px-1">
            <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {artist.name}
            </h3>

            <span className="text-sm text-muted-foreground font-medium">
              {artist.albumCount} album{artist.albumCount !== 1 ? 's' : ''}
            </span>

            {/* Recent Albums Avatars */}
            <div className="mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
              <AvatarGroup max={4}>
                {artist.albums
                  .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
                  .slice(0, 4)
                  .map((album, index) => {
                    const albumPath = album.uri_release?.replace('/album/', '').replace('/', '') || '';
                    return (
                      <div
                        key={index}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/album/${albumPath}`);
                        }}
                        className="cursor-pointer hover:scale-110 transition-transform z-10"
                        title={album.release_name}
                      >
                        <Avatar className="h-6 w-6 border-2 border-background">
                          <AvatarImage
                            src={getAlbumImageFromData(album.uri_release, 'small')}
                            onError={handleImageError}
                            alt={album.release_name}
                            className="object-cover"
                          />
                          <AvatarFallback className="text-[8px]">
                            {album.release_name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    );
                  })}
              </AvatarGroup>
            </div>
          </div>
        </div>
      </CardWrapper>
    </div>
  );
}