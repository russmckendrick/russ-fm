import { memo, type CSSProperties } from 'react';
import { FitTitle } from '@/components/player';
import { ytEmbed, type Explore } from '@/lib/explore/data';
import { hopLabel, type ThreadNode } from '@/lib/explore/thread';
import { cardImageUrl, cardText, entityName, focusPosition } from '@/lib/explore/threadCards';

interface ThreadCardProps {
  d: Explore;
  node: ThreadNode;
  /** Place in the trail (0 is the start). */
  k: number;
  /** The connection line of the card after this one. */
  nextText: string | null;
  /** Play this card's video (it is the current, settled card). */
  playing: boolean;
  sound: boolean;
  /** Show the swipe hint (the first couple of cards). */
  hint: boolean;
  /** Registers the card's element so the feed can move it every frame. */
  cardRef: (id: number, el: HTMLElement | null) => void;
}

/** The card's loop: no controls even with sound on (the card can't be clicked through), no annotations. */
const cardEmbed = (id: string, sound: boolean) => `${ytEmbed(id, { start: 30, mute: !sound }).replace('controls=1', 'controls=0')}&iv_load_policy=3`;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * One card in the feed: an artist's fanart (or photo), a record's sleeve on
 * its flood, or a muted video loop. The connection line at the top says how
 * it follows the card before; the feed moves the element, not React.
 */
export const ThreadCard = memo(function ThreadCard({ d, node, k, nextText, playing, sound, hint, cardRef }: ThreadCardProps) {
  const text = cardText(d, node);
  const image = cardImageUrl(d, node);
  const via = node.via;
  const person = via.person != null ? d.people[via.person] : null;
  const ways = node.alts.length;
  const style: CSSProperties = {};
  if (node.view === 'sleeve') {
    const r = d.albums[node.i];
    Object.assign(style, { '--thr-bg': r.fl, '--thr-fg': r.ink });
  } else if (node.view === 'video' && node.kind === 'r') {
    Object.assign(style, { '--thr-bg': d.albums[node.i].gr });
  }
  const isArtistTitle = node.kind === 'a' && node.view !== 'video';

  return (
    <article
      ref={el => cardRef(node.id, el)}
      className={`thr-card thr-card--${node.view}`}
      style={style}
      aria-roledescription="card"
      aria-label={`${k === 0 ? 'Start' : `Hop ${k}`}: ${entityName(d, node)}`}
    >
      <div className="thr-media" data-media>
        {node.view === 'sleeve' ? (
          <img className="thr-sleeve" src={image} alt={`${d.albums[node.i].t} sleeve`} draggable={false} />
        ) : node.view === 'video' && node.vid ? (
          <div className="thr-vbox">
            <img src={image} alt="" draggable={false} />
            {playing && (
              <iframe
                key={`${node.vid[0]}-${sound}`}
                src={cardEmbed(node.vid[0], sound)}
                title={`${text.title} video`}
                allow="autoplay; encrypted-media; picture-in-picture"
                tabIndex={-1}
                onLoad={e => e.currentTarget.classList.add('is-on')}
              />
            )}
          </div>
        ) : (
          <img className="thr-cover" src={image} alt={d.artists[node.i].name} style={{ objectPosition: focusPosition(d, node.i) }} draggable={false} />
        )}
      </div>
      {node.view !== 'sleeve' && <div className="thr-shade" />}

      <header className="thr-via">
        <div className="thr-via-kicker">
          <span className="t-kicker">{k === 0 ? 'Start' : `Hop ${k}`}</span>
          {k > 0 && <span className="t-mono text-[12px]">{hopLabel(via)}</span>}
        </div>
        <p className="thr-via-text">
          {person?.thumb && (
            <span className="thr-who">
              <img src={person.thumb} alt="" referrerPolicy="no-referrer" onError={e => e.currentTarget.parentElement?.remove()} />
            </span>
          )}
          {k === 0 ? via.sub ?? via.text : via.text}
        </p>
        {ways > 1 && (
          <button type="button" className="thr-ways" data-act="branch" aria-label={`Another way out (${ways - 1} more)`}>
            <span className="thr-dots" aria-hidden>
              {node.alts.map((_, j) => (
                <i key={j} className={j === node.alt ? 'is-on' : undefined} />
              ))}
            </span>
            {k === 0 ? plural(ways - 1, 'other start') : `${plural(ways - 1, 'more way')} out`}
            <span aria-hidden>⇆</span>
          </button>
        )}
      </header>

      <footer className="thr-info">
        <div className="t-kicker opacity-80">{text.kicker}</div>
        <FitTitle as="h2" max={isArtistTitle ? 52 : 64} min={24} className={isArtistTitle ? 't-disp' : 't-cond'}>
          {text.title}
        </FitTitle>
        {text.by && <p className="thr-by">{text.by}</p>}
        <p className="thr-meta t-mono">
          {text.meta}
          {text.meta && text.meta2 && <br />}
          {text.meta2}
        </p>
        {node.view === 'video' && (
          <button type="button" className="pill pill-sm thr-sound" data-act="sound" aria-pressed={sound}>
            {sound ? 'Sound on' : 'Muted · tap for sound'}
          </button>
        )}
        {nextText && (
          <p className="thr-next">
            <b className="t-kicker">Next</b>
            <span>{nextText}</span>
          </p>
        )}
        {hint && <p className="thr-hint t-mono">Tap for details · swipe up for the next hop</p>}
      </footer>
    </article>
  );
});
