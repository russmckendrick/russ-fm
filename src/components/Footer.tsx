import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { appConfig } from "@/config/app.config";
import { PillLink, Vinyl } from "@/components/player";
import { useFloodValue } from "@/components/player/flood-context";
import { useAlbumColorMap } from "@/hooks/useAlbumColors";
import { excludeBoxsetMembers } from "@/lib/boxsets";
import { useCollection } from "@/lib/collection";
import { shuffleLink, SHUFFLE_PATH } from "@/lib/shuffleLink";
import { floodFor, GROUND, inkOn } from "@/lib/sleeveColour";

const COLUMNS = [
  {
    title: "Collection",
    links: [
      { label: "Albums", href: "/albums/1" },
      { label: "Artists", href: "/artists/1" },
      { label: "Genres", href: "/genres" },
      { label: "Shuffle", href: SHUFFLE_PATH },
    ],
  },
  {
    title: "Browse",
    links: [
      { label: "Overview", href: "/browse" },
      { label: "Labels", href: "/labels" },
      { label: "Decades", href: "/decades" },
      { label: "Countries", href: "/countries" },
    ],
  },
  {
    title: "More",
    links: [
      { label: "Stats", href: "/stats" },
      { label: "Wrapped", href: "/wrapped" },
    ],
  },
];

/** How many recent additions make up the colour strip along the top. */
const STRIP = 40;

export function Footer() {
  const { footer } = appConfig;
  const year = new Date().getFullYear();
  const { pathname } = useLocation();
  const { flood, cover } = useFloodValue();
  const { albums: raw } = useCollection();
  const colourMap = useAlbumColorMap();

  const summary = useMemo(() => {
    if (!raw.length) return null;
    const albums = excludeBoxsetMembers(raw);
    const recent = [...albums].sort((a, b) => b.date_added.localeCompare(a.date_added));
    const first = recent[recent.length - 1]?.date_added;
    return {
      records: albums.length,
      artists: new Set(albums.map((a) => a.release_artist)).size,
      since: first ? new Date(first).toLocaleString("en-GB", { month: "long", year: "numeric" }) : null,
      strip: recent.slice(0, STRIP).map((a) => floodFor(colourMap?.[a.uri_release]).flood),
      latestFlood: recent[0] ? floodFor(colourMap?.[recent[0].uri_release]).flood : null,
    };
  }, [raw, colourMap]);

  // The big record carries the same sleeve as the logo. Without one its label
  // follows the page colour, and plain pages borrow the latest addition's.
  const discLabel = flood !== GROUND ? flood : summary?.latestFlood ?? "var(--neutral-flood)";

  return (
    <footer className="relative mt-24 overflow-hidden bg-[color:var(--ground)] text-[color:var(--cream)]">
      <div className="flex h-1.5" aria-hidden>
        {summary?.strip.map((colour, i) => (
          <span key={i} className="flex-1" style={{ background: colour }} />
        ))}
      </div>

      <span
        className="spin-lazy pointer-events-none absolute -bottom-[160px] -right-[120px] block h-[340px] w-[340px] md:-bottom-[260px] md:-right-[150px] md:h-[560px] md:w-[560px] lg:-bottom-[330px] lg:-right-[170px] lg:h-[760px] lg:w-[760px]"
        aria-hidden
      >
        <Vinyl label={discLabel} cover={cover} spin={false} className="vinyl-lit inset-0">
          {!cover && (
            <span
              className="t-disp -mt-[46%] text-[11px] tracking-[-0.04em] md:text-[18px] lg:text-[24px]"
              style={{ color: discLabel.startsWith("#") ? inkOn(discLabel) : "var(--ground)" }}
            >
              russ.fm
            </span>
          )}
        </Vinyl>
      </span>

      <div className="relative mx-auto flex w-full max-w-[1640px] flex-col gap-12 px-5 pb-56 pt-14 md:gap-14 md:px-10 md:pb-16 md:pt-20 lg:px-14">
        <div className="flex flex-col gap-5">
          <Link to="/" className="t-disp self-start text-[64px] tracking-[-0.045em] md:text-[124px]">
            russ.fm
          </Link>
          {summary && (
            <span className="t-mono text-[12px] font-bold uppercase text-[color:var(--cream-dim)] md:text-[13px]">
              {summary.records.toLocaleString()} records · {summary.artists.toLocaleString()} artists
              {summary.since && <> · collecting since {summary.since}</>}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-10 sm:flex-row sm:flex-wrap sm:gap-x-16 md:max-w-[62%] lg:max-w-none lg:gap-x-[72px]">
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-10 sm:flex sm:gap-12">
            {COLUMNS.map((column) => (
              <div key={column.title} className="flex flex-col gap-3.5">
                <span className="t-kicker text-[color:var(--cream-dim)]">{column.title}</span>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((item) => (
                    <li key={item.href}>
                      <Link
                        {...(item.href === SHUFFLE_PATH ? shuffleLink(pathname) : { to: item.href })}
                        className="text-[17px] font-bold opacity-90 hover:opacity-100"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="flex flex-col gap-3.5">
            <span className="t-kicker text-[color:var(--cream-dim)]">Elsewhere</span>
            <ul className="flex flex-wrap gap-2.5 sm:flex-col sm:items-start">
              {footer.links.external.items.map((item) => (
                <li key={item.href}>
                  <PillLink to={item.href} size="sm" className="border-[color:var(--cream-rule)]">
                    {item.label}
                  </PillLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <span className="text-[13px] text-[color:var(--cream-dim)]">
          Data from Discogs, Last.fm, Spotify and Apple Music · © {year}
        </span>
      </div>
    </footer>
  );
}
