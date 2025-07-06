import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme-toggle";
import { Search, Menu, X } from "lucide-react";
import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function Navigation({ searchTerm, setSearchTerm }: NavigationProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-0">
      <div className="fixed top-6 inset-x-0 z-50">
        <div className="container mx-auto px-4">
          <nav className="h-16 bg-background border dark:border-slate-700/70 rounded-full">
            <div className="h-full flex items-center justify-between px-6">
              <div className="flex items-center gap-8">
                <Link to="/albums/1">
                  <Logo className="shrink-0" />
                </Link>

                {/* Center navigation links */}
                <div className="hidden md:flex items-center gap-6">
                  <Link 
                    to="/albums/1" 
                    className={`text-sm font-medium transition-colors hover:text-primary ${
                      location.pathname === '/' || location.pathname.startsWith('/albums') 
                        ? 'text-foreground' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    Albums
                  </Link>
                  <Link 
                    to="/artists/1" 
                    className={`text-sm font-medium transition-colors hover:text-primary ${
                      location.pathname.startsWith('/artists') 
                        ? 'text-foreground' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    Artists
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Desktop Search bar */}
                <div className="relative hidden md:block">
                  <Search className="h-5 w-5 absolute inset-y-0 my-auto left-2.5" />
                  <Input
                    className="pl-10 flex-1 bg-slate-100/70 dark:bg-slate-800 border-none shadow-none w-[280px] rounded-full"
                    placeholder="Search albums, artists, or genres..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Desktop Theme Toggle */}
                <div className="hidden md:block">
                  <ThemeToggle />
                </div>

                {/* Mobile Burger Menu Button */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden rounded-full"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </nav>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-2 bg-background border dark:border-slate-700/70 rounded-lg shadow-lg">
              <div className="p-4 space-y-4">
                {/* Mobile Search */}
                <div className="relative">
                  <Search className="h-5 w-5 absolute inset-y-0 my-auto left-2.5" />
                  <Input
                    className="pl-10 w-full bg-slate-100/70 dark:bg-slate-800 border-none shadow-none rounded-full"
                    placeholder="Search albums, artists, or genres..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Mobile Navigation Links */}
                <div className="space-y-2">
                  <Link
                    to="/albums/1"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted ${
                      location.pathname === '/' || location.pathname.startsWith('/albums')
                        ? 'text-foreground bg-muted'
                        : 'text-muted-foreground'
                    }`}
                  >
                    Albums
                  </Link>
                  <Link
                    to="/artists/1"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-muted ${
                      location.pathname.startsWith('/artists')
                        ? 'text-foreground bg-muted'
                        : 'text-muted-foreground'
                    }`}
                  >
                    Artists
                  </Link>
                </div>

                {/* Mobile Theme Toggle */}
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm font-medium">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}