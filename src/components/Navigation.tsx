import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme-toggle";
import { SearchOverlay } from "./SearchOverlay";
import { MobileSearchModal } from "./MobileSearchModal";
import { UserProfileMenu } from "./UserProfileMenu";
import { Search, Menu, X, Home, Disc, Mic2, BarChart2, Shuffle, Gift } from "lucide-react";
import { Link, useLocation } from 'react-router-dom';
import { cn } from "@/lib/utils";

export function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Mobile detection & Scroll handler
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    const handleScroll = () => setScrolled(window.scrollY > 20);

    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleSearchFocus = () => {
    if (isMobile) {
      setMobileSearchOpen(true);
    } else {
      setSearchOverlayOpen(true);
    }
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/albums/1', label: 'Albums', icon: Disc, activePrefix: '/albums' },
    { path: '/artists/1', label: 'Artists', icon: Mic2, activePrefix: '/artists' },
    { path: '/stats', label: 'Stats', icon: BarChart2 },
    { path: '/random', label: 'Random', icon: Shuffle },
    { path: '/wrapped', label: 'Wrapped', icon: Gift, activePrefix: '/wrapped' },
  ];

  const isActive = (path: string, prefix?: string) => {
    if (prefix) return location.pathname.startsWith(prefix);
    return location.pathname === path || (path === '/' && location.pathname === '/home');
  };

  return (
    <>
      {/* Desktop Navigation - Floating Island */}
      <div className={cn(
        "fixed top-0 inset-x-0 z-50 flex justify-center transition-all duration-300 pointer-events-none",
        scrolled ? "pt-4" : "pt-6"
      )}>
        <nav className={cn(
          "pointer-events-auto flex items-center justify-between px-2 py-2 rounded-full border transition-all duration-300 mx-4",
          "backdrop-blur-xl shadow-lg",
          scrolled
            ? "w-auto px-6 h-14 bg-background/80 border-border/50"
            : "w-full max-w-5xl h-16 px-6 bg-background/70 border-white/10"
        )}>
          {/* Logo Section */}
          <Link to="/" className="flex items-center gap-2 mr-8">
            <Logo className="h-8 w-8" />
            <span className={cn(
              "font-bold text-lg tracking-tight transition-all duration-300",
              scrolled ? "hidden lg:block" : "block"
            )}>
              Russ.fm
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                  "hover:bg-secondary/80 hover:text-foreground",
                  isActive(item.path, item.activePrefix)
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-secondary/80"
              onClick={handleSearchFocus}
            >
              <Search className="h-4 w-4" />
            </Button>

            <div className="hidden md:block w-px h-6 bg-border mx-1" />

            <div className="hidden md:flex items-center gap-2">
              <UserProfileMenu />
              <ThemeToggle />
            </div>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-full"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </nav>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-24 px-6 md:hidden animate-in fade-in slide-in-from-top-10 duration-200">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl text-lg font-medium transition-colors",
                  isActive(item.path, item.activePrefix)
                    ? "bg-secondary text-foreground"
                    : "hover:bg-secondary/50 text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}

            <div className="h-px bg-border my-4" />

            <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30">
              <span className="font-medium">Theme</span>
              <ThemeToggle />
            </div>

            <div className="p-4">
              <UserProfileMenu />
            </div>
          </div>
        </div>
      )}

      {/* Search Components */}
      <SearchOverlay
        isVisible={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
      />
      <MobileSearchModal
        isOpen={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
      />
    </>
  );
}