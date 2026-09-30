import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { preloadAlbumColors } from '@/hooks/useAlbumColors';
import { usePageTitle } from '@/hooks/usePageTitle';
import { loadCollection } from '@/lib/collection';
import { useTv } from '@/components/tv/tv-context';
import type { Album } from '@/types/album';
import {
  artistChannel,
  artistChannelList,
  buildChannels,
  countVideos,
  loadTv,
  TV_LATEST,
  videoIdFromParam,
  videoPath,
  type TvChannel,
  type TvData,
} from '@/lib/tv';
import { TvScene } from './tv/TvScene';
import { TvGuide } from './tv/TvGuide';

type Status = 'loading' | 'ready' | 'error';

interface TvSource {
  tv: TvData;
  albums: Album[];
  channels: TvChannel[];
}

let sourceCache: TvSource | null = null;

/** tv.json + the collection, built into channels once per tab. */
function useChannels(): { source: TvSource | null; channels: TvChannel[] | null; status: Status; retry: () => void } {
  const [source, setSource] = useState<TvSource | null>(sourceCache);
  const [status, setStatus] = useState<Status>(sourceCache ? 'ready' : 'loading');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([loadTv(), loadCollection(), preloadAlbumColors()])
      .then(([tv, albums]) => {
        sourceCache = { tv, albums, channels: buildChannels(tv, albums) };
        setSource(sourceCache);
        setStatus('ready');
      })
      .catch(err => {
        console.error('Error loading TV:', err);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!sourceCache) load();
  }, [load]);

  return { source, channels: source?.channels ?? null, status, retry: load };
}

/**
 * /tv, /tv/:channel and /tv/:channel/:video (a shareable link to one video;
 * the page keeps the URL on whatever is playing).
 */
export function TvPage() {
  const { channel: slug, video } = useParams<{ channel: string; video: string }>();
  const { channels, status, retry } = useChannels();
  const tv = useTv();
  const channel = channels?.find(c => c.slug === (slug ?? TV_LATEST)) ?? null;
  const videoCount = useMemo(() => (channels ? countVideos(channels) : 0), [channels]);

  const playing = tv.channel && tv.channel.slug === channel?.slug ? tv.item : null;
  usePageTitle(
    playing ? `${playing.title} – ${playing.artist} | TV | Russ.fm` : channel ? `${channel.name} | TV | Russ.fm` : 'TV | Russ.fm',
  );

  // Plain /tv (the nav's TV link) goes back to whatever is already on, unless
  // that is a record's own channel (album page mini TV), which has no page here.
  if (!slug && tv.active && tv.channel && !tv.channel.home && tv.item) return <Navigate to={videoPath(tv.channel.slug, tv.item)} replace />;
  if (status === 'error') return <TvMessage title="The TV didn't load" retry={retry} />;
  if (!channels) return <TvLoading />;
  if (!channel) return channels.length ? <Navigate to="/tv" replace /> : <TvMessage title="No videos yet" />;

  return (
    <PageContainer variant="hero">
      <TvScene channels={channels} channel={channel} videoId={videoIdFromParam(video)} videoCount={videoCount} />
    </PageContainer>
  );
}

/**
 * /tv/artist/:artist and /tv/artist/:artist/:video: one artist's videos on
 * their own channel, linked from their artist page.
 */
export function TvArtistPage() {
  const { artist: slug = '', video } = useParams<{ artist: string; video: string }>();
  const { source, channels, status, retry } = useChannels();
  const tv = useTv();
  const channel = useMemo(() => (source ? artistChannel(source.tv, source.albums, slug) : null), [source, slug]);
  const videoCount = useMemo(() => (channels ? countVideos(channels) : 0), [channels]);

  const playing = tv.channel && tv.channel.slug === channel?.slug ? tv.item : null;
  usePageTitle(
    playing ? `${playing.title} – ${playing.artist} | ${channel!.name} on TV | Russ.fm` : channel ? `${channel.name} on TV | Russ.fm` : 'TV | Russ.fm',
  );

  if (status === 'error') return <TvMessage title="The TV didn't load" retry={retry} />;
  if (!channels) return <TvLoading />;
  if (!channel) return <TvMessage title="No videos for this artist yet" link={{ to: `/artist/${slug}`, label: 'Back to the artist' }} />;

  return (
    <PageContainer variant="hero">
      <TvScene channels={channels} channel={channel} videoId={videoIdFromParam(video)} videoCount={videoCount} />
    </PageContainer>
  );
}

/** /tv/guide: what is on every channel. */
export function TvGuidePage() {
  const { source, channels, status, retry } = useChannels();
  const artists = useMemo(() => (source ? artistChannelList(source.tv, source.albums) : []), [source]);
  usePageTitle('TV guide | Russ.fm');

  if (status === 'error') return <TvMessage title="The guide didn't load" retry={retry} />;
  if (!channels) return <TvLoading />;

  return (
    <PageContainer variant="hero">
      <TvGuide channels={channels} artists={artists} videoCount={countVideos(channels)} />
    </PageContainer>
  );
}

function TvLoading() {
  return (
    <PageContainer variant="hero">
      <div className="h-[340px] animate-pulse bg-[color:var(--ground-2)] sm:h-[440px] lg:h-[clamp(540px,72vh,800px)]" aria-label="Loading TV" />
    </PageContainer>
  );
}

function TvMessage({ title, retry, link }: { title: string; retry?: () => void; link?: { to: string; label: string } }) {
  return (
    <PageContainer>
      <div className="flex min-h-[50vh] flex-col items-start justify-center gap-6">
        <h1 className="t-disp m-0 text-[34px] md:text-[48px]">{title}</h1>
        {retry && (
          <button type="button" onClick={retry} className="pill pill-solid pill-lg" style={{ background: 'var(--cream)', color: 'var(--ground)' }}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        )}
        {link && (
          <Link to={link.to} className="pill">
            {link.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </PageContainer>
  );
}
