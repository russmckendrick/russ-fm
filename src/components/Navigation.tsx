import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Search,
  Menu,
  X,
  type LucideIcon,
  House,
  Disc3,
  Users2,
  Tags,
  BarChart3,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./theme-toggle";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";

type NavItem = {
  path: string;
  label: string;
  activePrefix?: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Home", icon: House },
  { path: "/albums/1", label: "Albums", activePrefix: "/albums", icon: Disc3 },
  { path: "/artists/1", label: "Artists", activePrefix: "/artists", icon: Users2 },
  { path: "/genres", label: "Genres", activePrefix: "/genres", icon: Tags },
  { path: "/stats", label: "Stats", icon: BarChart3 },
  { path: "/random", label: "Random", icon: Shuffle },
  { path: "/wrapped", label: "Wrapped", activePrefix: "/wrapped", icon: Sparkles },
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
            className="flex shrink-0 items-center gap-3 text-ink hover:text-ink md:gap-3.5"
            aria-label="russ.fm — home"
          >
            <BrandMark />
            <span className="text-[18px] font-bold leading-none tracking-[-0.02em]">
              russ.fm
            </span>
            <span className="hidden items-center gap-3 lg:flex">
              <span
                aria-hidden
                className="font-grot text-[22px] font-light leading-none text-ink-dim"
              >
                /
              </span>
              <span className="flex flex-col justify-center font-mono text-[10px] uppercase leading-[1.08] tracking-[0.14em] text-ink-dim">
                <span>personal record</span>
                <span>collection</span>
              </span>
            </span>
          </Link>

          {/* --- Nav rail --------------------------------------------- */}
          <nav
            aria-label="Primary"
            className="hidden flex-1 justify-center md:flex"
          >
            <ul className="flex items-center gap-4 xl:gap-5">
              {NAV_ITEMS.map((item) => {
                const on = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "group inline-flex items-center gap-2 border-b px-1 py-2.5 text-[12.5px] font-medium leading-none tracking-[-0.005em] transition-all",
                        on
                          ? "border-ink text-ink"
                          : "border-transparent text-ink-3 hover:border-rule-strong hover:text-ink"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 transition-colors",
                          on
                            ? "text-ink"
                            : "text-ink-dim group-hover:text-ink-2",
                        )}
                        aria-hidden
                      />
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
                const Icon = item.icon;
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
                      <span className="flex items-center gap-3">
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px]",
                            on ? "text-ink" : "text-ink-dim",
                          )}
                          aria-hidden
                        />
                        <span>{item.label}</span>
                      </span>
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
