import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Menu, X, ChevronDown, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";
import { useFloodValue } from "./player/flood-context";
import { CREAM, GROUND } from "@/lib/sleeveColour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type NavItem = {
  path: string;
  label: string;
  activePrefix?: string | string[];
};

const PRIMARY: NavItem[] = [
  { path: "/", label: "Home" },
  { path: "/albums/1", label: "Albums", activePrefix: "/albums" },
  { path: "/artists/1", label: "Artists", activePrefix: "/artists" },
  { path: "/genres", label: "Genres", activePrefix: "/genres" },
];

const BROWSE: NavItem[] = [
  { path: "/browse", label: "Overview", activePrefix: "/browse" },
  { path: "/labels", label: "Labels", activePrefix: ["/labels", "/label/"] },
  { path: "/decades", label: "Decades", activePrefix: ["/decades", "/decade/"] },
  { path: "/countries", label: "Countries", activePrefix: ["/countries", "/country/"] },
];

const MORE: NavItem[] = [
  { path: "/stats", label: "Stats", activePrefix: "/stats" },
  { path: "/wrapped", label: "Wrapped", activePrefix: "/wrapped" },
];

const ALL_MOBILE: NavItem[] = [...PRIMARY, ...BROWSE, ...MORE, { path: "/random", label: "Shuffle", activePrefix: "/random" }];

/** Scroll distance after which the header leaves the hero flood for the dark base. */
const SOLID_AFTER = 120;

export function Navigation() {
  const location = useLocation();
  const { flood, ink } = useFloodValue();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => {
      const compact = window.innerWidth < 1280;
      setIsCompact(compact);
      if (compact) setSearchOverlayOpen(false);
      else {
        setMenuOpen(false);
        setMobileSearchOpen(false);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SOLID_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // `/` focuses search. Ignored while typing or with a modifier held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      if (isCompact) setMobileSearchOpen(true);
      else searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCompact]);

  const isActive = (item: NavItem) => {
    if (item.activePrefix) {
      const prefixes = Array.isArray(item.activePrefix) ? item.activePrefix : [item.activePrefix];
      return prefixes.some((p) => location.pathname.startsWith(p));
    }
    return location.pathname === item.path || (item.path === "/" && location.pathname === "/home");
  };

  const solid = scrolled || menuOpen;
  const bg = menuOpen ? flood : scrolled ? "rgba(14,13,12,.97)" : flood;
  const fg = menuOpen ? ink : scrolled ? CREAM : ink;
  const browseActive = BROWSE.some(isActive);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-[background-color,color,box-shadow] duration-700",
          solid && !menuOpen && "shadow-[0_1px_0_rgba(251,247,239,.08)]",
        )}
        style={{ background: bg, color: fg }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1640px] items-center gap-6 px-5 md:h-[84px] md:px-10 lg:px-14 xl:gap-9">
          <Link to="/" className="t-disp shrink-0 text-[22px] tracking-[-0.04em] md:text-[26px]" aria-label="russ.fm — home">
            russ.fm
          </Link>

          <nav aria-label="Primary" className="hidden flex-1 items-center gap-7 xl:flex">
            {PRIMARY.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} />
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 text-[15px] font-bold transition-opacity",
                    browseActive ? "opacity-100 underline decoration-2 underline-offset-8" : "opacity-70 hover:opacity-100",
                  )}
                >
                  Browse
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={14}
                className="min-w-[220px] rounded-2xl border-0 bg-[color:var(--ground-2)] p-2 text-[color:var(--cream)] shadow-[0_30px_60px_-20px_rgba(0,0,0,.7)]"
              >
                {BROWSE.map((item) => (
                  <DropdownMenuItem key={item.path} asChild className="cursor-pointer rounded-xl px-3 py-3 text-[15px] font-bold focus:bg-[color:var(--ground-3)] focus:text-[color:var(--cream)]">
                    <Link to={item.path} aria-current={isActive(item) ? "page" : undefined}>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {MORE.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <div className="relative hidden xl:block">
              <label className="flex h-11 w-[260px] items-center gap-2.5 rounded-full border-2 border-current px-4 opacity-90 focus-within:opacity-100 2xl:w-[320px]">
                <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  placeholder="Search the collection"
                  onFocus={() => setSearchOverlayOpen(true)}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (!searchOverlayOpen) setSearchOverlayOpen(true);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-current placeholder:opacity-60"
                  aria-label="Search the collection"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <kbd className="t-mono rounded border border-current px-1.5 text-[11px] opacity-60">/</kbd>
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

            <Link to="/random" className="pill pill-sm hidden md:inline-flex" aria-label="Shuffle — a random record">
              <Shuffle className="h-4 w-4" aria-hidden />
              Shuffle
            </Link>

            <button
              type="button"
              aria-label="Search"
              onClick={() => setMobileSearchOpen(true)}
              className="icon-btn border-2 border-current xl:hidden"
            >
              <Search className="h-5 w-5" />
            </button>

            <div className="hidden md:block">
              <UserProfileMenu />
            </div>

            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="icon-btn border-2 border-current xl:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="flood-surface fixed inset-0 z-40 overflow-y-auto pt-16 md:pt-[84px] xl:hidden"
          style={{ background: flood === GROUND ? "var(--ground-2)" : flood, color: ink }}
        >
          <nav aria-label="Menu" className="mx-auto flex max-w-[720px] flex-col px-5 pb-16 pt-6 md:px-10">
            {ALL_MOBILE.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive(item) ? "page" : undefined}
                className={cn(
                  "t-disp border-b py-4 text-[38px] md:text-[52px]",
                  isActive(item) ? "opacity-100" : "opacity-70 hover:opacity-100",
                )}
                style={{ borderColor: "currentColor", borderBottomWidth: 1 }}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-8 md:hidden">
              <UserProfileMenu />
            </div>
          </nav>
        </div>
      )}

      <MobileSearchModal isOpen={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-[15px] font-bold transition-opacity",
        active ? "opacity-100 underline decoration-2 underline-offset-8" : "opacity-70 hover:opacity-100",
      )}
    >
      {item.label}
    </Link>
  );
}
