import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";

type NavItem = { path: string; label: string; activePrefix?: string };

/** Spinning-record brand glyph. Crimson to keep the accent role the old
 *  `◉` used to play; honours `prefers-reduced-motion` by pausing. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="grid h-[22px] w-[22px] shrink-0 place-items-center text-hl motion-safe:animate-spin-slow"
    >
      <svg viewBox="0 0 512 512" className="h-full w-full fill-current">
        <path d="M256,0C114.837,0,0,114.837,0,256s114.837,256,256,256s256-114.837,256-256S397.163,0,256,0z M256,490.667c-129.387,0-234.667-105.28-234.667-234.667S126.613,21.333,256,21.333S490.667,126.613,490.667,256S385.387,490.667,256,490.667z" />
        <path d="M458.667,245.333c-5.888,0-10.667,4.779-10.667,10.667c0,105.856-86.144,192-192,192c-5.888,0-10.667,4.779-10.667,10.667s4.779,10.667,10.667,10.667c117.632,0,213.333-95.701,213.333-213.333C469.333,250.112,464.555,245.333,458.667,245.333z" />
        <path d="M256,64c5.888,0,10.667-4.779,10.667-10.667S261.888,42.667,256,42.667C138.368,42.667,42.667,138.368,42.667,256c0,5.888,4.779,10.667,10.667,10.667S64,261.888,64,256C64,150.144,150.144,64,256,64z" />
        <path d="M245.333,373.333c0,5.888,4.779,10.667,10.667,10.667c70.592,0,128-57.408,128-128c0-5.888-4.779-10.667-10.667-10.667c-5.888,0-10.667,4.779-10.667,10.667c0,58.816-47.851,106.667-106.667,106.667C250.112,362.667,245.333,367.445,245.333,373.333z" />
        <path d="M256,405.333c-5.888,0-10.667,4.779-10.667,10.667c0,5.888,4.779,10.667,10.667,10.667c94.101,0,170.667-76.565,170.667-170.667c0-5.888-4.779-10.667-10.667-10.667c-5.888,0-10.667,4.779-10.667,10.667C405.333,338.347,338.347,405.333,256,405.333z" />
        <path d="M256,106.667c5.888,0,10.667-4.779,10.667-10.667S261.888,85.333,256,85.333c-94.101,0-170.667,76.565-170.667,170.667c0,5.888,4.779,10.667,10.667,10.667s10.667-4.779,10.667-10.667C106.667,173.653,173.653,106.667,256,106.667z" />
        <path d="M320,256c0-35.285-28.715-64-64-64s-64,28.715-64,64s28.715,64,64,64S320,291.285,320,256z M213.333,256c0-23.531,19.136-42.667,42.667-42.667s42.667,19.136,42.667,42.667S279.531,298.667,256,298.667S213.333,279.531,213.333,256z" />
        <path d="M277.333,256c0-11.776-9.557-21.333-21.333-21.333s-21.333,9.557-21.333,21.333s9.557,21.333,21.333,21.333S277.333,267.776,277.333,256z" />
        <path d="M266.667,138.667c0-5.888-4.779-10.667-10.667-10.667c-70.592,0-128,57.408-128,128c0,5.888,4.779,10.667,10.667,10.667s10.667-4.779,10.667-10.667c0-58.816,47.851-106.667,106.667-106.667C261.888,149.333,266.667,144.555,266.667,138.667z" />
      </svg>
    </span>
  );
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Home" },
  { path: "/albums/1", label: "Albums", activePrefix: "/albums" },
  { path: "/artists/1", label: "Artists", activePrefix: "/artists" },
  { path: "/genres", label: "Genres", activePrefix: "/genres" },
  { path: "/stats", label: "Stats" },
  { path: "/random", label: "Random" },
  { path: "/wrapped", label: "Wrapped", activePrefix: "/wrapped" },
];

export function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // `/` focuses the desktop search input (editorial convention). Ignored
  // while typing in an input, or when a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      if (isMobile) setMobileSearchOpen(true);
      else searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);

  const isActive = (item: NavItem) => {
    if (item.activePrefix) return location.pathname.startsWith(item.activePrefix);
    return (
      location.pathname === item.path ||
      (item.path === "/" && location.pathname === "/home")
    );
  };

  const openSearch = () => {
    if (isMobile) setMobileSearchOpen(true);
    else setSearchOverlayOpen(true);
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full",
          "bg-paper border-b border-rule",
          "font-grot"
        )}
      >
        <div className="mx-auto flex w-full max-w-[1640px] items-center gap-6 px-5 py-3 md:gap-8 md:px-8 md:py-3.5">
          {/* --- Brand ------------------------------------------------ */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 text-ink hover:text-ink"
            aria-label="russ.fm — home"
          >
            <BrandMark />
            <span className="text-[18px] font-bold leading-none tracking-[-0.02em]">
              russ.fm
            </span>
            <span className="hidden font-mono text-[10px] uppercase leading-[1.1] tracking-[0.08em] text-ink-dim lg:block">
              / personal record
              <br />
              collection
            </span>
          </Link>

          {/* --- Nav pill --------------------------------------------- */}
          <nav
            aria-label="Primary"
            className="hidden flex-1 justify-center md:flex"
          >
            <ul className="flex items-center gap-0.5 border border-rule p-[3px]">
              {NAV_ITEMS.map((item) => {
                const on = isActive(item);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "block px-3.5 py-2 text-[12.5px] font-medium leading-none tracking-[-0.005em] transition-colors",
                        on
                          ? "bg-ink text-paper"
                          : "text-ink-3 hover:bg-paper-2 hover:text-ink"
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* --- Right actions ---------------------------------------- */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Desktop search input */}
            <div className="relative hidden md:block">
              <label
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-[12.5px]",
                  "w-[260px] xl:w-[320px]",
                  searchOverlayOpen
                    ? "border-x border-t border-rule-strong bg-paper"
                    : "border border-rule focus-within:border-rule-strong",
                  "text-ink"
                )}
              >
                <Search className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  placeholder="Search records, artists, tracks…"
                  onFocus={() => setSearchOverlayOpen(true)}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (!searchOverlayOpen) setSearchOverlayOpen(true);
                  }}
                  className="min-w-0 flex-1 bg-transparent leading-none text-ink outline-none placeholder:text-ink-dim"
                  aria-label="Search"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="text-ink-dim transition-colors hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="border border-rule px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-dim">
                    /
                  </kbd>
                )}
              </label>

              <SearchOverlay
                isVisible={searchOverlayOpen}
                onClose={() => {
                  setSearchOverlayOpen(false);
                  setSearchTerm("");
                }}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                anchorRef={searchInputRef}
              />
            </div>

            {/* Mobile search button */}
            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="flex h-9 w-9 items-center justify-center border border-rule text-ink hover:bg-paper-2 md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            <div className="hidden items-center gap-2 md:flex">
              <UserProfileMenu />
              <ThemeToggle />
            </div>

            {/* Mobile menu toggle */}
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center border border-rule text-ink hover:bg-paper-2 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* --- Mobile menu overlay --------------------------------------- */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-paper pt-16 md:hidden">
          <div className="border-b border-rule" />
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item) => {
                const on = isActive(item);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between border-b border-rule py-4 font-grot text-[20px] font-semibold tracking-[-0.015em]",
                        on ? "text-ink" : "text-ink-3"
                      )}
                    >
                      <span>{item.label}</span>
                      <span
                        className="font-mono text-[10px] tracking-[0.08em] text-ink-dim"
                        aria-hidden
                      >
                        {String(NAV_ITEMS.indexOf(item) + 1).padStart(2, "0")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                Session
              </span>
              <div className="flex items-center gap-2">
                <UserProfileMenu />
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Mobile search modal is a full-viewport sheet */}
      <MobileSearchModal
        isOpen={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
      />
    </>
  );
}
