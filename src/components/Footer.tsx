import { Link } from "react-router-dom";
import { appConfig } from "@/config/app.config";
import { PillLink } from "@/components/player";

const FOOTER_LINKS = [
  { label: "Albums", href: "/albums/1" },
  { label: "Artists", href: "/artists/1" },
  { label: "Genres", href: "/genres" },
  { label: "Browse", href: "/browse" },
  { label: "Stats", href: "/stats" },
  { label: "Wrapped", href: "/wrapped" },
  { label: "Shuffle", href: "/random" },
];

export function Footer() {
  const { footer } = appConfig;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-[color:var(--cream-rule)] bg-[color:var(--ground)] text-[color:var(--cream)]">
      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-10 px-5 py-12 md:px-10 lg:flex-row lg:items-end lg:justify-between lg:px-14 lg:py-16">
        <div className="flex flex-col gap-4">
          <Link to="/" className="t-disp text-[40px] tracking-[-0.04em] md:text-[56px]">
            russ.fm
          </Link>
          <span className="text-[14px] text-[color:var(--cream-dim)]">
            Data from Discogs, Last.fm, Spotify and Apple Music · © {year}
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-6 md:flex-row md:gap-12">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4 md:grid-cols-4">
            {FOOTER_LINKS.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className="text-[15px] font-bold opacity-80 hover:opacity-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-3">
            {footer.links.external.items.map((item) => (
              <li key={item.href}>
                <PillLink to={item.href} size="sm" arrow={false} className="border-[color:var(--cream-rule)]">
                  {item.label}
                </PillLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
