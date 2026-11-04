import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { FitTitle } from '@/components/player';
import { phoneCrop, useArtistImageInfo, type HeroPhoto } from '@/lib/artistImage';
import { getArtistFanartFromData, getArtistPhotoFromData } from '@/lib/image-utils';

interface IndexPosterProps {
  uri: string;
  name: string;
  records: number;
  /** The artist's own flood (their newest record): the name's off-register shadow. */
  flood: string;
  /** The poster's width over its height, and its width in px. */
  aspect: number;
  width: number;
}

/**
 * One poster on the /artists wall (IndexRoom), printed like the artist page's
 * PosterWall: their fanart (else their own photo) cropped round the faces, the
 * name overprinted in cream, scuffed. No sleeves: the wall is the collection's.
 */
export function IndexPoster({ uri, name, records, flood, aspect, width }: IndexPosterProps) {
  const info = useArtistImageInfo(uri);
  const [failed, setFailed] = useState(false);
  if (info === undefined) return null;
  const fanart = !failed ? info?.fanart : undefined;
  const src = fanart ? getArtistFanartFromData(uri, fanart.file) : getArtistPhotoFromData(uri, info?.source);
  const photo: HeroPhoto | null = fanart
    ? fanart
    : info
      ? { width: info.width, height: info.height, faces: info.faces, people: info.people, salient: null, columns: [] }
      : null;
  const label = `${name}, ${records.toLocaleString('en-GB')} record${records === 1 ? '' : 's'}`;
  return (
    <Link to={uri} className="index-room-poster" aria-label={label} title={label}>
      <img
        src={src}
        alt=""
        className="artist-poster-photo"
        style={{ objectPosition: photo ? phoneCrop(photo, aspect).position : '50% 30%' }}
        onError={fanart ? () => setFailed(true) : undefined}
        decoding="async"
      />
      <div className="artist-poster-foot" aria-hidden style={{ '--flood': flood } as CSSProperties}>
        <div className="min-w-0 flex-1">
          <FitTitle as="h2" max={Math.round(width * 0.22)} min={12} className="artist-poster-name">
            {name}
          </FitTitle>
        </div>
      </div>
      <div className="artist-poster-wear" aria-hidden />
    </Link>
  );
}
