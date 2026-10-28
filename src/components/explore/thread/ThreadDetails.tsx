import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { sleeveUrl, ytEmbed, ytThumb, type Explore } from '@/lib/explore/data';
import { galaxyPath, labelName, videoTitle, type Hop, type ThreadNode } from '@/lib/explore/thread';
import { entityName, thumbUrl, trimBio } from '@/lib/explore/threadCards';

interface ThreadDetailsProps {
  d: Explore;
  node: ThreadNode;
  /** Ways out of this card, best first. */
  outs: Hop[];
  /** Which of them the next card currently is. */
  nextAlt: number | null;
  sound: boolean;
  /** A video playing with sound in the panel. */
  playing: string | null;
  various: number | null;
  onHop: (hop: Hop) => void;
  onPick: (kind: 'a' | 'r', i: number) => void;
  onPlay: (id: string | null) => void;
  onSound: () => void;
  onCopy: () => void;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const byYear = (d: Explore) => (x: number, y: number) => (d.albums[x].y ?? 9999) - (d.albums[y].y ?? 9999);

/**
 * The current card in full: bio or record details, every way out, the records
 * owned (each one a hop), videos to play with sound, and links to the
 * album/artist page and The Galaxy. A side panel on desktop, a sheet on phones.
 */
export function ThreadDetails({ d, node, outs, nextAlt, sound, playing, various, onHop, onPick, onPlay, onSound, onCopy }: ThreadDetailsProps) {
  const isVideo = node.view === 'video';
  let head;
  let shelf: number[] = [];
  let shelfTitle = '';
  let videos: { id: string; title: string; sub: string }[] = [];
  let mapArtist: number | null = null;
  let page: { to: string; label: string };

  if (node.kind === 'a') {
    const a = d.artists[node.i];
    const year = a.formed ? `Formed ${a.formed}` : a.born ? `Born ${a.born}` : '';
    const meta = [a.from, year, a.died ? `died ${a.died}` : '', a.genre, a.mood].filter(Boolean).join(' · ');
    mapArtist = node.i;
    page = { to: `/artist/${a.slug}`, label: 'Artist page' };
    shelf = [...a.records].sort(byYear(d));
    shelfTitle = 'In the collection';
    videos = a.videos.map(v => ({ id: v[0], title: v[1] || 'Video', sub: v[2] || a.name }));
    head = (
      <>
        <div className="t-kicker text-[color:var(--cream-dim)]">Artist</div>
        <h2 className="thr-d-title t-disp text-[34px]">{a.name}</h2>
        {meta && <p className="thr-d-meta t-mono">{meta}</p>}
        {a.bio && <p className="thr-d-bio">{trimBio(a.bio)}</p>}
        {a.members.length > 0 && (
          <p className="thr-d-meta t-mono">
            Members: {a.members.slice(0, 8).join(', ')}
            {a.members.length > 8 ? '…' : ''}
          </p>
        )}
      </>
    );
  } else {
    const r = d.albums[node.i];
    const labels = [...new Set(r.l.map(labelName))].join(', ');
    const meta = [r.y, labels, r.c, r.fmt, r.vc ? `${r.vc} vinyl` : '', r.lis ? `${r.lis.toLocaleString('en-GB')} Last.fm listeners` : ''].filter(Boolean).join(' · ');
    const lead = r.a.find(x => x !== various);
    mapArtist = lead ?? null;
    page = { to: `/album/${r.slug}`, label: 'Album page' };
    if (lead != null && d.artists[lead].records.length > 1) {
      shelf = d.artists[lead].records.filter(x => x !== node.i).sort(byYear(d));
      shelfTitle = `More ${d.artists[lead].name}`;
    }
    videos = r.v.map(v => ({ id: v[0], title: videoTitle(d, v, r), sub: v[2] === 'other' ? 'clip' : v[2] }));
    const credits = (d.creditsOn.get(node.i) ?? []).slice(0, 10);
    head = (
      <>
        <div className="t-kicker text-[color:var(--cream-dim)]">Record</div>
        <h2 className="thr-d-title t-cond text-[44px]">{r.t}</h2>
        <p className="thr-d-by">
          {r.a.length
            ? r.a.map((ai, j) => (
                <span key={ai}>
                  {j > 0 && ', '}
                  <button type="button" className="underline decoration-[color:var(--cream-rule)] underline-offset-4 hover:decoration-current" onClick={() => onPick('a', ai)}>
                    {d.artists[ai].name}
                  </button>
                </span>
              ))
            : r.by}
        </p>
        <p className="thr-d-meta t-mono">{meta}</p>
        {(r.s.length > 0 || r.g.length > 0) && (
          <div className="thr-chips">
            {[...new Set([...r.s, ...r.g])].slice(0, 8).map(s => (
              <span key={s}>{s}</span>
            ))}
          </div>
        )}
        {credits.length > 0 && (
          <p className="thr-d-meta t-mono">
            Credits: {credits.map(c => `${d.people[c.person].name} (${c.role})`).join(', ')}
          </p>
        )}
      </>
    );
  }

  return (
    <div>
      {playing && (
        <div className="thr-player">
          <iframe src={ytEmbed(playing, { mute: false, loop: false })} title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      {head}
      <div className="thr-d-actions">
        <Link to={page.to} className="pill pill-sm">
          {page.label} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {mapArtist != null && (
          <Link to={galaxyPath(d.artists[mapArtist].slug)} className="pill pill-sm">
            See on the map <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        {isVideo && (
          <button type="button" className="pill pill-sm" onClick={onSound} aria-pressed={sound}>
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        )}
        <button type="button" className="pill pill-sm" onClick={onCopy}>
          Copy trail link
        </button>
      </div>

      <section className="thr-d-sec" aria-label="Ways out">
        <h3>
          <span className="t-kicker">Ways out</span>
          <span className="t-mono">{outs.length}</span>
        </h3>
        <ul className="thr-outs">
          {outs.map((e, j) => (
            <li key={`${e.kind}${e.i}${e.vid?.[0] ?? ''}`}>
              <button type="button" className="thr-out" onClick={() => onHop(e)}>
                <span className={`thr-out-th${e.kind === 'r' ? ' is-sq' : ''}`}>
                  <img src={e.vid ? ytThumb(e.vid[0]) : thumbUrl(d, e)} alt="" loading="lazy" />
                </span>
                <span>
                  <span className="thr-out-t1">
                    {entityName(d, e)}
                    {e.kind === 'r' && !e.vid ? ` · ${d.albums[e.i].by}` : ''}
                    {j === nextAlt && <span className="thr-out-next t-kicker">Next</span>}
                  </span>
                  <span className="thr-out-t2">{e.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {shelf.length > 0 && (
        <section className="thr-d-sec" aria-label={shelfTitle}>
          <h3>
            <span className="t-kicker">{shelfTitle}</span>
            <span className="t-mono">{plural(shelf.length, 'record')}</span>
          </h3>
          <div className="thr-shelf">
            {shelf.map(ri => {
              const r = d.albums[ri];
              const label = `${r.t}${r.y ? `, ${r.y}` : ''}`;
              return (
                <button key={ri} type="button" title={label} aria-label={`Hop to ${label}`} onClick={() => onPick('r', ri)}>
                  <img src={sleeveUrl(r, 'medium')} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="thr-d-sec" aria-label="Videos">
          <h3>
            <span className="t-kicker">Videos</span>
            <span className="t-mono">play with sound</span>
          </h3>
          <div className="thr-vids">
            {videos.map(v => (
              <button key={v.id} type="button" className="thr-vid" onClick={() => onPlay(v.id)} aria-label={`Play ${v.title}`}>
                <span className="thr-vid-th">
                  <img src={ytThumb(v.id)} alt="" loading="lazy" />
                </span>
                <span>
                  <span className="thr-vid-t1">{v.title}</span>
                  <span className="thr-vid-t2 t-mono">{v.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
