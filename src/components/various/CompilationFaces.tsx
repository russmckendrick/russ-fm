import { getArtistAvatarFromData, handleImageError } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

/**
 * A compilation's byline picture: the avatars of up to four artists on it who
 * have a page, overlapping, else the Various Artists avatar.
 */
export function CompilationFaces({ artists, ring, className }: { artists: string[]; /** The colour behind, round each face. */ ring: string; className?: string }) {
  const faces = artists.length ? artists.slice(0, 4) : ['/artist/various/'];
  return (
    <span className={cn('flex shrink-0', className)} aria-hidden>
      {faces.map((uri, i) => (
        <img
          key={uri}
          src={getArtistAvatarFromData(uri)}
          alt=""
          onError={handleImageError}
          className={cn('h-10 w-10 rounded-full object-cover md:h-11 md:w-11', i > 0 && '-ml-3.5')}
          style={{ zIndex: faces.length - i, boxShadow: `0 0 0 2.5px ${ring}` }}
        />
      ))}
    </span>
  );
}
