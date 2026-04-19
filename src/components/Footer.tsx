import { Link } from "react-router-dom";
import { Github, BarChart3, Shuffle, Disc3, Users2, Tags } from "lucide-react";
import { SiLastdotfm, SiDiscogs } from "react-icons/si";
import { appConfig } from "@/config/app.config";
import { BrandMark } from "./BrandMark";

const externalIcon = (label: string) => {
  if (label === "Last.fm") return <SiLastdotfm className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Discogs") return <SiDiscogs className="h-3.5 w-3.5" aria-hidden />;
  if (label === "GitHub") return <Github className="h-3.5 w-3.5" aria-hidden />;
  return null;
};

const internalIcon = (label: string) => {
  if (label === "Collection Stats") return <BarChart3 className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Random Discovery") return <Shuffle className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Albums") return <Disc3 className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Artists") return <Users2 className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Genres") return <Tags className="h-3.5 w-3.5" aria-hidden />;
  return null;
};

export function Footer() {
  const { footer } = appConfig;
  const currentYear = new Date().getFullYear();

  const textLinks = [
    ...footer.links.about.items,
    ...footer.links.explore.items,
  ];

  return (
    <footer className="mt-24 border-t border-rule-strong bg-paper font-grot">
      <div className="mx-auto w-full max-w-[1640px] px-5 py-6 md:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          {/* Colophon */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ink">
            <BrandMark className="h-[24px] w-[24px] md:h-[28px] md:w-[28px]" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
              © {currentYear}
            </span>
            <div className="flex items-center gap-2.5">
              <span className="text-[16px] font-bold leading-none tracking-[-0.02em] md:text-[17px]">
                russ.fm
              </span>
              <span
                aria-hidden
                className="font-grot text-[20px] font-light leading-none text-ink-dim"
              >
                /
              </span>
              <span className="flex flex-col justify-center font-mono text-[10px] uppercase leading-[1.05] tracking-[0.14em] text-ink-dim">
                <span>personal record</span>
                <span>collection</span>
              </span>
            </div>
          </div>

          {/* Internal links */}
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {textLinks.map((item, i) => {
              const icon = internalIcon(item.label);
              return (
                <Link
                  key={i}
                  to={item.href}
                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 transition-colors hover:text-hl"
                >
                  {icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* External icons */}
          <div className="flex items-center gap-4">
            {footer.links.external.items.map((item, i) => {
              const icon = externalIcon(item.label);
              if (!icon) return null;
              return (
                <a
                  key={i}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.label}
                  className="text-ink-3 transition-colors hover:text-hl"
                >
                  {icon}
                  <span className="sr-only">{item.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
