import { Link } from "react-router-dom";
import { Github } from "lucide-react";
import { SiLastdotfm, SiDiscogs } from "react-icons/si";
import { appConfig } from "@/config/app.config";

const externalIcon = (label: string) => {
  if (label === "Last.fm") return <SiLastdotfm className="h-3.5 w-3.5" aria-hidden />;
  if (label === "Discogs") return <SiDiscogs className="h-3.5 w-3.5" aria-hidden />;
  if (label === "GitHub") return <Github className="h-3.5 w-3.5" aria-hidden />;
  return null;
};

export function Footer() {
  const { footer } = appConfig;

  const textLinks = [
    ...footer.links.about.items,
    ...footer.links.explore.items,
  ];

  return (
    <footer className="mt-24 border-t border-rule-strong bg-paper font-grot">
      <div className="mx-auto w-full max-w-[1640px] px-5 py-6 md:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          {/* Colophon */}
          <div className="flex items-baseline gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
            <span className="text-hl" aria-hidden>◉</span>
            <span>
              © {footer.copyright.year} RUSS.FM
              <span className="mx-2 text-rule-strong">·</span>
              A personal record collection
            </span>
          </div>

          {/* Internal links */}
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {textLinks.map((item, i) => (
              <Link
                key={i}
                to={item.href}
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 hover:text-hl"
              >
                {item.label}
              </Link>
            ))}
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
