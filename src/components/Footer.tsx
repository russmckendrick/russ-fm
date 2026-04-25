import { Link } from "react-router-dom";
import { Github, BarChart3, Shuffle, Disc3, Users2, Tags } from "lucide-react";
import { SiLastdotfm, SiDiscogs } from "react-icons/si";
import { appConfig } from "@/config/app.config";
import { BrandMark } from "./BrandMark";

const externalIcon = (label: string) => {
  if (label === "Last.fm") return <SiLastdotfm className="h-4 w-4" aria-hidden />;
  if (label === "Discogs") return <SiDiscogs className="h-4 w-4" aria-hidden />;
  if (label === "GitHub") return <Github className="h-4 w-4" aria-hidden />;
  return null;
};

const internalIcon = (label: string) => {
  if (label === "Collection Stats") return <BarChart3 className="h-4 w-4" aria-hidden />;
  if (label === "Random Discovery") return <Shuffle className="h-4 w-4" aria-hidden />;
  if (label === "Albums") return <Disc3 className="h-4 w-4" aria-hidden />;
  if (label === "Artists") return <Users2 className="h-4 w-4" aria-hidden />;
  if (label === "Genres") return <Tags className="h-4 w-4" aria-hidden />;
  return null;
};

export function Footer() {
  const { footer } = appConfig;
  const currentYear = new Date().getFullYear();

  const internalLinks = [
    ...footer.links.about.items,
    ...footer.links.explore.items,
  ].map((item) => ({
    ...item,
    icon: internalIcon(item.label),
  })).filter((item) => item.icon);

  return (
    <footer className="mt-24 border-t border-rule-strong bg-paper font-grot">
      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-4 px-5 py-5 md:px-8">
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-1.5">
          {internalLinks.map((item, i) => (
            <Link
              key={`internal-${i}`}
              to={item.href}
              aria-label={item.label}
              title={item.label}
              className="inline-flex h-8 w-8 items-center justify-center border border-transparent text-ink-3 transition-[color,border-color] hover:border-rule-strong hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {item.icon}
              <span className="sr-only">{item.label}</span>
            </Link>
          ))}

          {footer.links.external.items.map((item, i) => {
            const icon = externalIcon(item.label);
            if (!icon) return null;
            return (
              <a
                key={`external-${i}`}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={item.label}
                aria-label={item.label}
                className="inline-flex h-8 w-8 items-center justify-center border border-transparent text-ink-3 transition-[color,border-color] hover:border-rule-strong hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {icon}
                <span className="sr-only">{item.label}</span>
              </a>
            );
          })}
        </nav>

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
      </div>
    </footer>
  );
}
