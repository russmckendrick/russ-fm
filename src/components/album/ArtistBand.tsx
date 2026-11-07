import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { artistFacts, type ArtistFactSource } from '@/lib/artistFacts';
import { focusPosition, useArtistImageInfo } from '@/lib/artistImage';
import { loadDetailJson } from '@/lib/collection';
import { getArtistDetailJsonUrl, getArtistFanartFromData, getArtistPhotoFromData, handleImageError } from '@/lib/image-utils';

interface ArtistBandProps {
  name: string;
  uriArtist: string;
  /** The bio, already cleaned and trimmed, as the page renders it. */
  bio: ReactNode;
  /** How many records of theirs the collection has, this one included. */
  count: number;
  /** The sleeve's flood, washed over the photo's left side. */
  flood: string;
  accent: string;
}

/**
 * The name's size, from the band's width (`cqi`): its longest word must fit on one
 * line inside the padding, so a name never breaks mid-word, with short names capped.
 * The display face, extended and in capitals, runs about 0.9em a letter.
 */
function nameSize(name: string) {
  const longest = Math.max(4, ...name.split(/\s+/).map(w => w.length));
  return `min(${(88 / (longest * 0.9)).toFixed(2)}cqi, 128px)`;
}

/**
 * The album page's artist section: their TheAudioDB fanart as a wide band (their own
 * photo when they have none), framed on the face the image notes found, fading into
 * the page with a wash of the sleeve's colour. The name sits big over it with a line
 * of facts and genre chips from their detail JSON (left out until it loads); the bio
 * follows below.
 */
export function ArtistBand({ name, uriArtist, bio, count, flood, accent }: ArtistBandProps) {
  const info = useArtistImageInfo(uriArtist);
  const [failedFanart, setFailedFanart] = useState(false);
  const [data, setData] = useState<{ uri: string; json: ArtistFactSource } | null>(null);

  useEffect(() => {
    let alive = true;
    loadDetailJson<ArtistFactSource>(getArtistDetailJsonUrl(uriArtist))
      .then(json => alive && setData({ uri: uriArtist, json }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uriArtist]);

  const facts = artistFacts(data?.uri === uriArtist ? data.json : null);
  const fanart = !failedFanart ? info?.fanart : undefined;
  // Nothing until the image notes say which photo to use.
  const src = info === undefined ? '' : fanart ? getArtistFanartFromData(uriArtist, fanart.file) : getArtistPhotoFromData(uriArtist, info?.source);
  const face = fanart?.faces?.[0];
  const position = face
    ? `${Math.round((face[0] + face[2] / 2) * 100)}% ${Math.round(Math.max(0, face[1] + face[3] / 2 - 0.15) * 100)}%`
    : focusPosition(info) ?? '50% 25%';

  return (
    <section className="flex flex-col gap-8">
      <Link to={uriArtist} className="artist-band" style={{ '--band-flood': flood } as React.CSSProperties}>
        {src && (
          <img
            src={src}
            alt=""
            loading="lazy"
            style={{ objectPosition: position }}
            onError={e => (fanart ? setFailedFanart(true) : handleImageError(e))}
          />
        )}
        <div className="artist-band-body">
          <span className="t-kicker opacity-80">The artist</span>
          <span className="t-disp artist-band-name" style={{ fontSize: nameSize(name) }}>
            {name}
          </span>
        </div>
      </Link>

      {/* The facts sit under the band, so the photo keeps the band to itself and the name. */}
      {(facts.rows.length > 0 || facts.genres.length > 0) && (
        <div className="artist-band-meta">
          {facts.rows.length > 0 && (
            <dl className="artist-band-facts">
              {facts.rows.map(([k, v]) => (
                <div key={k}>
                  <dt style={{ color: accent }}>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {facts.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {facts.genres.map(g => (
                <span key={g} className="artist-band-chip">{g}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {bio}
        <Link to={uriArtist} className="inline-flex items-center gap-2 self-start font-bold" style={{ color: accent }}>
          {count} {count === 1 ? 'record' : 'records'} in the collection
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
