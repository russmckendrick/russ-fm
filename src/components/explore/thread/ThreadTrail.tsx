import { useLayoutEffect, useRef } from 'react';
import type { Explore } from '@/lib/explore/data';
import type { ThreadNode } from '@/lib/explore/thread';
import { entityName, thumbUrl } from '@/lib/explore/threadCards';

interface ThreadTrailProps {
  d: Explore;
  /** The trail up to the furthest card visited. */
  nodes: ThreadNode[];
  cur: number;
  /** Column (desktop) or row (phone): which way to keep the current step in view. */
  vertical: boolean;
  onJump: (k: number) => void;
  onCopy: () => void;
}

/**
 * The path so far: a row of avatars and sleeves over the feed on phones, a
 * column with each hop's reason on desktop. Every step jumps back to its card.
 */
export function ThreadTrail({ d, nodes, cur, vertical, onJump, onCopy }: ThreadTrailProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const here = list?.querySelector<HTMLElement>('.is-here');
    if (!list || !here) return;
    const a = here.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    if (vertical) list.scrollTop += a.top + a.height / 2 - (b.top + b.height / 2);
    else list.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [cur, nodes.length, vertical]);

  const hops = nodes.length - 1;
  return (
    <nav className="thr-trail" aria-label="Trail so far">
      <div className="thr-trail-head">
        <span className="thr-trail-title t-kicker">Trail</span>
        <span className="thr-trail-count t-mono">
          {hops} {hops === 1 ? 'hop' : 'hops'}
        </span>
        <button type="button" className="pill pill-sm thr-copy" onClick={onCopy} title="Copy a link to this trail (C)">
          Copy link
        </button>
      </div>
      <ol ref={listRef} className="thr-trail-list">
        {nodes.map((n, k) => {
          const name = entityName(d, n);
          return (
            <li key={n.id}>
              <button
                type="button"
                className={`thr-crumb${k === cur ? ' is-here' : k > cur ? ' is-ahead' : ''}`}
                onClick={() => onJump(k)}
                aria-current={k === cur ? 'step' : undefined}
                aria-label={`${k === 0 ? 'Start' : `Hop ${k}`}: ${name}`}
                title={name}
              >
                <span className={`thr-crumb-th${n.kind === 'r' ? ' is-sq' : ''}`}>
                  <img src={thumbUrl(d, n)} alt="" loading="lazy" />
                </span>
                <span className="thr-crumb-tx">
                  <span className="thr-crumb-n">{name}</span>
                  <span className="thr-crumb-w">{k === 0 ? 'Start' : n.via.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="thr-trail-keys t-mono">
        ↑ ↓ hop · ← → branch
        <br />
        Enter details · C copy link · M sound
      </p>
    </nav>
  );
}
