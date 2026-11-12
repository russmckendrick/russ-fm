import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { artistFacts, type ArtistFactSource } from '@/lib/artistFacts';
import { useArtistImageInfo } from '@/lib/artistImage';
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
 * line inside the padding, so a name never breaks mid-word, with short names capped (88px) and the
 * rest set a fifth under what would fit, so the photo stays the subject.
 * A long name is also held to about two lines (not below 4.4cqi), so it leaves the
 * top of the photo to the faces. The display face, extended and in capitals, runs
 * about 0.9em a letter.
 */
function nameSize(name: string) {
  const longest = Math.max(4, ...name.split(/\s+/).map(w => w.length));
  const word = 88 / (longest * 0.9);
  const twoLines = Math.max(5.5, 88 / ((name.length / 2) * 0.9 * 1.12));
  return `min(${(Math.min(word, twoLines) * 0.8).toFixed(2)}cqi, 88px)`;
}

/** Where the faces sit in the band, as a fraction of its height: above the name. */
const FACE_LINE = 0.34;

/**
 * `object-position` for a photo that covers the band, so the point (x, y) of the
 * photo (fractions) lands at the band's centre across and on FACE_LINE down, as far
 * as covering allows. A percentage position on its own only does that when little
 * is cropped; the band crops more than half of a square photo.
 */
function coverPosition(photo: { width: number; height: number }, box: { w: number; h: number }, x: number, y: number) {
  const scale = Math.max(box.w / photo.width, box.h / photo.height);
  const along = (size: number, room: number, at: number, line: number) => {
    const spare = size * scale - room;
    return spare > 1 ? Math.min(1, Math.max(0, (at * size * scale - line * room) / spare)) : 0.5;
  };
  return `${(along(photo.width, box.w, x, 0.5) * 100).toFixed(1)}% ${(along(photo.height, box.h, y, FACE_LINE) * 100).toFixed(1)}%`;
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
  // The band's size, to work out how the photo is cropped.
  const band = useRef<HTMLAnchorElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = band.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Frame on the middle of the faces (all of them: a band's line-up), else the photo's focus.
  const photo = fanart ?? info;
  const faces = photo?.faces ?? [];
  const point: [number, number] | null = faces.length
    ? [
        (Math.min(...faces.map(f => f[0])) + Math.max(...faces.map(f => f[0] + f[2]))) / 2,
        (Math.min(...faces.map(f => f[1])) + Math.max(...faces.map(f => f[1] + f[3]))) / 2,
      ]
    : !fanart && info?.focus
      ? info.focus
      : null;
  const position = photo && box && point ? coverPosition(photo, box, point[0], point[1]) : '50% 25%';

  return (
    <section className="flex flex-col gap-8">
      <Link ref={band} to={uriArtist} className="artist-band" style={{ '--band-flood': flood } as React.CSSProperties}>
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
