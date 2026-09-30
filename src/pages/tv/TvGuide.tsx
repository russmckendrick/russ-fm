import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FloodBand, useRecordsFlood } from '@/components/player';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { floodFor } from '@/lib/sleeveColour';
import { onAir, slotsBetween, videoPath, type TvArtistListing, type TvChannel } from '@/lib/tv';
import { cn } from '@/lib/utils';
import { TvArtistChannels } from './TvArtistChannels';

const WINDOW_MIN = 30;
const MAX_AHEAD = 6; // half hours

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * The TV guide: every channel's running order for a half hour, each programme
 * block in its sleeve's colour, with a line at the current time. Earlier and
 * later half hours are a button away. Below it, every artist's own channel.
 */
export function TvGuide({ channels, artists, videoCount }: { channels: TvChannel[]; artists: TvArtistListing[]; videoCount: number }) {
  const colours = useAlbumColorMap();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const [page, setPage] = useState(0);
  const half = WINDOW_MIN * 60_000;
  const from = Math.floor(now / half) * half + page * half;
  const to = from + half;

  // The band takes the colour of what is on the first channel right now.
  const lead = channels[0]?.items[onAir(channels[0], now).index];
  const band = useRecordsFlood([lead?.album.uri_release]);

  const rows = useMemo(
    () => channels.map(ch => ({ ch, slots: slotsBetween(ch, from, to) })),
    [channels, from, to],
  );
  const ticks = [0, 5, 10, 15, 20, 25].map(m => from + m * 60_000);
  const nowPct = ((now - from) / half) * 100;
  const hours = Math.round(channels.reduce((n, c) => n + c.loop, 0) / 3600);

  return (
    <>
      <FloodBand flood={band}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="t-disp m-0 text-[44px] md:text-[64px] lg:text-[96px]">Guide</h1>
          <span className="t-mono text-[13px] text-[color:var(--cream-dim)]">
            {channels.length} channels · {artists.length.toLocaleString('en-GB')} artist channels · {videoCount.toLocaleString('en-GB')} videos · {hours.toLocaleString('en-GB')} hours
          </span>
        </div>
      </FloodBand>

      <div className="mx-auto w-full max-w-[1640px] px-5 pb-16 pt-8 md:px-10 lg:px-14">
        <div className="mb-5 flex items-center gap-3">
          <button type="button" className="icon-btn bg-[color:var(--ground-3)]" onClick={() => setPage(p => p - 1)} disabled={page <= 0} aria-label="Earlier">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="t-mono min-w-[140px] text-center text-[14px] tabular-nums">
            {time(from)} – {time(to)}
          </span>
          <button type="button" className="icon-btn bg-[color:var(--ground-3)]" onClick={() => setPage(p => p + 1)} disabled={page >= MAX_AHEAD} aria-label="Later">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          {page !== 0 && (
            <button type="button" className="pill pill-sm" onClick={() => setPage(0)}>
              Now
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="relative w-full min-w-[980px]">
            {/* Time ruler */}
            <div className="grid grid-cols-[200px_1fr] gap-2.5 md:grid-cols-[260px_1fr]">
              <span />
              <div className="relative h-7">
                {ticks.map(t => (
                  <span
                    key={t}
                    className="t-mono absolute top-0 border-l border-[color:var(--cream-rule)] pl-2 text-[12px] text-[color:var(--cream-dim)]"
                    style={{ left: `${((t - from) / half) * 100}%` }}
                  >
                    {time(t)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {rows.map(({ ch, slots }) => (
                <div key={ch.slug} className="grid grid-cols-[200px_1fr] gap-2.5 md:grid-cols-[260px_1fr]">
                  <Link to={`/tv/${ch.slug}`} className="flex h-14 items-center gap-3 pl-1 hover:underline">
                    <span className="t-cond w-10 text-[34px] leading-none">{ch.number}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-bold">{ch.name}</span>
                      <span className="t-mono text-[11px] text-[color:var(--cream-dim)]">{ch.items.length.toLocaleString('en-GB')} videos</span>
                    </span>
                  </Link>
                  <div className="relative h-14 overflow-hidden">
                    {slots.map(s => {
                      const f = floodFor(colours?.[s.item.album.uri_release]);
                      const left = Math.max(0, ((s.start - from) / half) * 100);
                      const right = Math.min(100, ((s.end - from) / half) * 100);
                      const live = s.start <= now && now < s.end;
                      return (
                        <Link
                          key={`${s.index}-${s.start}`}
                          to={live ? `/tv/${ch.slug}` : videoPath(ch.slug, s.item)}
                          className={cn('tv-slot', s.end <= now && 'opacity-40', live && 'tv-slot-live')}
                          style={{ left: `${left}%`, width: `calc(${right - left}% - 4px)`, background: f.flood, color: f.ink }}
                          title={`${time(s.start)} ${s.item.artist} – ${s.item.title}`}
                        >
                          <span className="truncate text-[12px] font-bold">{s.item.artist}</span>
                          <span className="t-cond truncate text-[20px] leading-none">{s.item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {nowPct >= 0 && nowPct <= 100 && (
              <div className="pointer-events-none absolute inset-y-0 left-[210px] right-0 md:left-[270px]">
                <div className="absolute bottom-0 top-7 w-0.5 bg-[color:var(--cream)]" style={{ left: `${nowPct}%` }} />
                <span
                  className="t-mono absolute top-0 -translate-x-1/2 rounded-full bg-[color:var(--cream)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--ground)]"
                  style={{ left: `${nowPct}%` }}
                >
                  {time(now)}
                </span>
              </div>
            )}
          </div>
        </div>

        <TvArtistChannels artists={artists} />
      </div>
    </>
  );
}
