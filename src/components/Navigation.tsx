import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Menu, X, ChevronDown, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";
import { useFloodValue } from "./player/flood-context";
import { SpinningMark } from "./player/SpinningMark";
import { BrowseMenuCards } from "./browse/BrowseMenu";
import { CREAM, GROUND, INK } from "@/lib/sleeveColour";
import { excludeBoxsetMembers } from "@/lib/boxsets";
import { FACETS } from "@/lib/browseFacets";
import { groupByFacet } from "@/components/browse/facetSleeves";
import { useCollection } from "@/lib/collection";
import { shuffleLink, SHUFFLE_PATH, SHUFFLE_PATHS } from "@/lib/shuffleLink";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type NavItem = {
  path: string;
  label: string;
  activePrefix?: string | string[];
  /** Key into the mobile menu's counts. */
  count?: "records" | "artists" | "genres" | "labels" | "decades" | "countries";
};

const PRIMARY: NavItem[] = [
  { path: "/", label: "Home" },
  { path: "/albums/1", label: "Albums", activePrefix: ["/albums", "/album/"], count: "records" },
  { path: "/artists/1", label: "Artists", activePrefix: ["/artists", "/artist/"], count: "artists" },
  { path: "/genres", label: "Genres", activePrefix: "/genres", count: "genres" },
];

const BROWSE: NavItem[] = [
  { path: "/browse", label: "Overview", activePrefix: "/browse" },
  { path: "/labels", label: "Labels", activePrefix: ["/labels", "/label/"], count: "labels" },
  { path: "/decades", label: "Decades", activePrefix: ["/decades", "/decade/"], count: "decades" },
  { path: "/countries", label: "Countries", activePrefix: ["/countries", "/country/"], count: "countries" },
];

const MORE: NavItem[] = [
  { path: "/stats", label: "Stats", activePrefix: "/stats" },
  { path: "/wrapped", label: "Wrapped", activePrefix: "/wrapped" },
];

const ALL_MOBILE: NavItem[] = [...PRIMARY, ...BROWSE, ...MORE, { path: SHUFFLE_PATH, label: "Shuffle", activePrefix: SHUFFLE_PATHS }];

/** Scroll distance after which the header leaves the hero flood for the dark base. */
const SOLID_AFTER = 120;

export function Navigation() {
  const location = useLocation();
  const { flood, ink, cover } = useFloodValue();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
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

  // Keyed on every navigation, not just path changes, so a Shuffle link that
  // stays on the Shuffle page still closes the menus.
  useEffect(() => {
    setMenuOpen(false);
    setBrowseOpen(false);
  }, [location.key]);

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
  const bg = menuOpen ? flood : scrolled ? "color-mix(in oklab, var(--ground) 97%, transparent)" : flood;
  const fg = menuOpen ? ink : scrolled ? CREAM : ink;
  const browseActive = BROWSE.some(isActive);
  const hasFlood = flood !== GROUND;
  // The logo's label is the page colour; on plain pages it is cream.
  const markLabel = hasFlood ? flood : CREAM;
  // The current page's pill: ink on the flood, then the flood itself once the
  // header has scrolled onto the dark ground, so the colour follows you down.
  const activePill = scrolled && !menuOpen
    ? { background: hasFlood ? flood : CREAM, color: hasFlood ? ink : INK }
    : { background: fg, color: hasFlood ? flood : "var(--ground)" };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-[background-color,color,box-shadow] duration-700",
          solid && !menuOpen && "shadow-[0_1px_0_rgba(251,247,239,.08)]",
        )}
        style={{ background: bg, color: fg }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1640px] items-center gap-5 px-5 md:h-[84px] md:px-10 lg:px-14 xl:gap-7">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 md:gap-3" aria-label="russ.fm — home">
            <SpinningMark size={isCompact ? 36 : 44} label={markLabel} cover={cover} />
            <span className="t-disp text-[22px] tracking-[-0.04em] md:text-[26px]">russ.fm</span>
          </Link>

          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 xl:flex">
            {PRIMARY.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} activeStyle={activePill} />
            ))}
            <DropdownMenu open={browseOpen} onOpenChange={setBrowseOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-10 items-center gap-1 rounded-full border-2 px-4 text-[15px] font-bold transition-[opacity,background-color,color,border-color] duration-300",
                    browseOpen ? "border-current opacity-100" : "border-transparent",
                    !browseOpen && !browseActive && "opacity-70 hover:opacity-100",
                  )}
                  style={browseActive && !browseOpen ? activePill : undefined}
                >
                  Browse
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", browseOpen && "rotate-180")} aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={12}
                collisionPadding={24}
                className="w-[min(1040px,calc(100vw-48px))] rounded-[26px] border-0 bg-[color:var(--ground-2)] p-3 text-[color:var(--cream)] shadow-[0_40px_80px_-24px_rgba(0,0,0,.7)]"
              >
                <BrowseMenuCards isActive={(path) => location.pathname.startsWith(path)} />
              </DropdownMenuContent>
            </DropdownMenu>
            {MORE.map((item) => (
              <NavLink key={item.path} item={item} active={isActive(item)} activeStyle={activePill} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <div className="relative hidden xl:block">
              <label className="flex h-11 w-[240px] items-center gap-2.5 rounded-full border-2 border-current px-4 opacity-90 focus-within:opacity-100 2xl:w-[300px]">
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

            <Link {...shuffleLink(location.pathname)} className="pill pill-sm hidden md:inline-flex" aria-label="Shuffle — a random record">
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
              className={cn("icon-btn border-2 border-current xl:hidden", menuOpen && "border-transparent")}
              style={menuOpen ? { background: ink, color: flood === GROUND ? "var(--ground-2)" : flood } : undefined}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <MobileMenu
          background={flood === GROUND ? "var(--ground-2)" : flood}
          ink={ink}
          isActive={isActive}
        />
      )}

      <MobileSearchModal isOpen={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
    </>
  );
}

type Counts = Record<NonNullable<NavItem["count"]>, number>;

/** Counts beside each menu entry. Built only while the menu is open. */
function useMenuCounts(): Counts | null {
  const { albums: raw } = useCollection();
  return useMemo(() => {
    if (!raw.length) return null;
    const albums = excludeBoxsetMembers(raw);
    return {
      records: albums.length,
      artists: new Set(albums.map((a) => a.release_artist)).size,
      genres: groupByFacet(FACETS.genre, albums).size,
      labels: groupByFacet(FACETS.label, albums).size,
      decades: groupByFacet(FACETS.decade, albums).size,
      countries: groupByFacet(FACETS.country, albums).size,
    };
  }, [raw]);
}

function MobileMenu({ background, ink, isActive }: { background: string; ink: string; isActive: (item: NavItem) => boolean }) {
  const counts = useMenuCounts();
  const { pathname } = useLocation();
  return (
    <div className="flood-surface fixed inset-0 z-40 overflow-y-auto pt-16 md:pt-[84px] xl:hidden" style={{ background, color: ink }}>
      <nav aria-label="Menu" className="mx-auto flex max-w-[720px] flex-col px-5 pb-16 pt-4 md:px-10">
        {ALL_MOBILE.map((item) => {
          const active = isActive(item);
          const count = item.count && counts ? counts[item.count] : null;
          return (
            <Link
              key={item.path}
              {...(item.path === SHUFFLE_PATH ? shuffleLink(pathname) : { to: item.path })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-b py-3.5 md:py-4",
                active ? "opacity-100" : "opacity-75 hover:opacity-100",
              )}
              style={{ borderColor: "currentColor", borderBottomWidth: 1 }}
            >
              {active && <SpinningMark size={30} label={CREAM} className="md:h-10 md:w-10" />}
              <span className="t-disp flex-1 text-[32px] md:text-[48px]">{item.label}</span>
              {count != null && <span className="t-mono text-[12px] font-bold md:text-[14px]">{count.toLocaleString()}</span>}
            </Link>
          );
        })}
        <div className="mt-8 md:hidden">
          <UserProfileMenu />
        </div>
      </nav>
    </div>
  );
}

function NavLink({ item, active, activeStyle }: { item: NavItem; active: boolean; activeStyle: { background: string; color: string } }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-full px-4 text-[15px] font-bold transition-[opacity,background-color,color] duration-300",
        !active && "opacity-70 hover:opacity-100",
      )}
      style={active ? activeStyle : undefined}
    >
      {item.label}
    </Link>
  );
}
