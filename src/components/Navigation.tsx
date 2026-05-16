import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Search,
  Menu,
  X,
  ChevronDown,
  type LucideIcon,
  House,
  Disc3,
  Users2,
  Tags,
  BarChart3,
  Shuffle,
  Radar,
  Sparkles,
  LibraryBig,
  CalendarDays,
  Globe2,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./theme-toggle";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type NavItem = {
  path: string;
  label: string;
  activePrefix?: string | string[];
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Home", icon: House },
  { path: "/albums/1", label: "Albums", activePrefix: "/albums", icon: Disc3 },
  { path: "/artists/1", label: "Artists", activePrefix: "/artists", icon: Users2 },
];

const BROWSE_NAV_ITEMS: NavItem[] = [
  { path: "/browse", label: "Catalogue overview", activePrefix: "/browse", icon: LibraryBig },
  { path: "/genres", label: "Genres", activePrefix: "/genres", icon: Tags },
  { path: "/labels", label: "Labels", activePrefix: ["/labels", "/label/"], icon: Tag },
  { path: "/decades", label: "Decades", activePrefix: ["/decades", "/decade/"], icon: CalendarDays },
  { path: "/countries", label: "Countries", activePrefix: ["/countries", "/country/"], icon: Globe2 },
];

const EXPLORE_NAV_ITEMS: NavItem[] = [
  { path: "/stats", label: "Stats", icon: BarChart3 },
  { path: "/random", label: "Random", icon: Shuffle },
  { path: "/wrapped", label: "Wrapped", activePrefix: "/wrapped", icon: Sparkles },
];

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Catalogue",
    icon: LibraryBig,
    items: BROWSE_NAV_ITEMS,
  },
  {
    label: "Insights",
    icon: Radar,
    items: EXPLORE_NAV_ITEMS,
  },
];

const COMPACT_NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  { label: "Main", items: PRIMARY_NAV_ITEMS },
  { label: "Catalogue", items: BROWSE_NAV_ITEMS },
  { label: "Insights", items: EXPLORE_NAV_ITEMS },
];

const COMPACT_NAV_ITEMS = COMPACT_NAV_SECTIONS.flatMap((section) => section.items);

const DESKTOP_NAV_LINK_CLASS =
  "group inline-flex h-10 items-center gap-1.5 border-b px-1 py-2.5 font-display text-[13px] uppercase leading-none transition-[color,border-color,opacity] duration-200";

const DESKTOP_NAV_INACTIVE_CLASS =
  "border-transparent text-ink-3 hover:border-rule-strong hover:text-ink data-[state=open]:border-rule-strong data-[state=open]:text-ink";

const DESKTOP_NAV_ACTIVE_CLASS = "border-ink text-ink";

function navItemIndex(item: NavItem) {
  return String(COMPACT_NAV_ITEMS.findIndex((candidate) => candidate.path === item.path) + 1).padStart(2, "0");
}

function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <Icon
      className={cn(
        "h-3.5 w-3.5 transition-colors",
        active ? "text-ink" : "text-ink-dim group-hover:text-ink-2",
      )}
      aria-hidden
    />
  );
}

function DesktopNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      className={cn(
        DESKTOP_NAV_LINK_CLASS,
        active ? DESKTOP_NAV_ACTIVE_CLASS : DESKTOP_NAV_INACTIVE_CLASS,
      )}
    >
      <NavIcon icon={item.icon} active={active} />
      {item.label}
    </Link>
  );
}

function DesktopNavDropdown({
  section,
  active,
  isActive,
}: {
  section: NavSection;
  active: boolean;
  isActive: (item: NavItem) => boolean;
}) {
  const SectionIcon = section.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            DESKTOP_NAV_LINK_CLASS,
            active ? DESKTOP_NAV_ACTIVE_CLASS : DESKTOP_NAV_INACTIVE_CLASS,
          )}
        >
          <NavIcon icon={SectionIcon} active={active} />
          {section.label}
          <ChevronDown
            className="h-3.5 w-3.5 text-ink-dim transition-transform duration-200 group-data-[state=open]:rotate-180 group-hover:text-ink-2"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={8}
        className="min-w-[248px] rounded-none border-rule-strong bg-paper p-0 text-ink shadow-[0_28px_56px_-26px_rgba(14,13,11,0.45)]"
      >
        <DropdownMenuLabel className="px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-ink-dim">
          {section.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0 bg-rule" />
        {section.items.map((item) => {
          const itemActive = isActive(item);
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.path}
              asChild
              className="cursor-pointer rounded-none p-0 focus:bg-paper-2 focus:text-ink"
            >
              <Link
                to={item.path}
                aria-current={itemActive ? "page" : undefined}
                className={cn(
                  "group flex w-full items-center justify-between gap-5 border-b border-rule px-3 py-3 font-display text-[13px] uppercase leading-none last:border-b-0",
                  itemActive ? "text-ink" : "text-ink-3",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-colors",
                      itemActive ? "text-ink" : "text-ink-dim group-hover:text-ink-2",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-mono text-[10px] font-normal tracking-[0.08em] text-ink-dim" aria-hidden>
                  {navItemIndex(item)}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompactMenuSection({
  label,
  items,
  isActive,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  onNavigate: () => void;
}) {
  return (
    <section>
      <h2 className="border-b border-rule pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </h2>
      <ul className="flex flex-col">
        {items.map((item) => {
          const on = isActive(item);
          const Icon = item.icon;
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between border-b border-rule py-4 font-grot text-[20px] font-semibold tracking-[-0.015em] md:text-[22px]",
                  on ? "text-ink" : "text-ink-3",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      on ? "text-ink" : "text-ink-dim",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-dim"
                  aria-hidden
                >
                  {navItemIndex(item)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkCompactHeader = () => {
      const compact = window.innerWidth < 1280;
      setIsCompactHeader(compact);

      if (compact) {
        setSearchOverlayOpen(false);
      } else {
        setMobileMenuOpen(false);
        setMobileSearchOpen(false);
      }
    };

    checkCompactHeader();
    window.addEventListener("resize", checkCompactHeader);
    return () => window.removeEventListener("resize", checkCompactHeader);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // `/` focuses the desktop search input (editorial convention). Ignored
  // while typing in an input, or when a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      if (isCompactHeader) setMobileSearchOpen(true);
      else searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCompactHeader]);

  const isActive = (item: NavItem) => {
    if (item.activePrefix) {
      const prefixes = Array.isArray(item.activePrefix) ? item.activePrefix : [item.activePrefix];
      return prefixes.some((p) => location.pathname.startsWith(p));
    }
    return (
      location.pathname === item.path ||
      (item.path === "/" && location.pathname === "/home")
    );
  };

  const openSearch = () => {
    if (isCompactHeader) {
      setSearchOverlayOpen(false);
      setMobileSearchOpen(true);
    } else {
      setSearchOverlayOpen(true);
    }
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
        <div className="mx-auto grid w-full max-w-[1640px] grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 md:gap-6 md:px-8 md:py-5 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-8">
          {/* --- Brand ------------------------------------------------ */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3 text-ink transition-opacity hover:opacity-80 md:gap-3.5"
            aria-label="russ.fm — home"
          >
            <BrandMark />
            <span
              className="font-grot text-[27px] font-black uppercase leading-none tracking-[0] md:text-[31px]"
              style={{ fontVariationSettings: '"wdth" 62, "wght" 900' }}
            >
              RUSS.FM
            </span>
            <span className="hidden items-center gap-3 2xl:flex">
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
            className="hidden min-w-0 justify-center xl:flex"
          >
            <ul className="flex min-w-0 items-center justify-center gap-5">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <li key={item.path}>
                  <DesktopNavLink item={item} active={isActive(item)} />
                </li>
              ))}
              {NAV_SECTIONS.map((section) => (
                <li key={section.label}>
                  <DesktopNavDropdown
                    section={section}
                    active={section.items.some(isActive)}
                    isActive={isActive}
                  />
                </li>
              ))}
            </ul>
          </nav>

          {/* --- Right actions ---------------------------------------- */}
          <div className="flex shrink-0 items-center justify-end gap-2 justify-self-end">
            {/* Desktop search input */}
            <div className="relative hidden xl:block">
              <label
                className={cn(
                  "flex items-center gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em]",
                  "w-[220px] 2xl:w-[300px]",
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

            {/* Compact search button */}
            <button
              type="button"
              aria-label="Search"
              onClick={openSearch}
              className="flex h-9 w-9 items-center justify-center border border-rule text-ink transition-[color,background-color,border-color] duration-200 hover:bg-paper-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink xl:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            <div className="hidden items-center gap-2 md:flex">
              <UserProfileMenu />
              <ThemeToggle />
            </div>

            {/* Compact menu toggle */}
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center border border-rule text-ink transition-[color,background-color,border-color] duration-200 hover:bg-paper-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink xl:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* --- Compact menu overlay ------------------------------------- */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-paper pt-[72px] md:pt-[82px] xl:hidden">
          <div className="border-b border-rule" />
          <nav
            aria-label="Compact"
            className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-7 overflow-y-auto px-5 py-6 md:px-8"
          >
            {COMPACT_NAV_SECTIONS.map((section) => (
              <CompactMenuSection
                key={section.label}
                label={section.label}
                items={section.items}
                isActive={isActive}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            ))}
            <div className="mt-1 flex items-center justify-between gap-3 md:hidden">
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

      {/* Compact search modal is a full-viewport sheet below xl. */}
      <MobileSearchModal
        isOpen={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
      />
    </>
  );
}
