import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme-toggle";
import { Search } from "lucide-react";
import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function Navigation({ searchTerm, setSearchTerm }: NavigationProps) {
  const location = useLocation();

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
                {/* Search bar */}
                <div className="relative hidden md:block">
                  <Search className="h-5 w-5 absolute inset-y-0 my-auto left-2.5" />
                  <Input
                    className="pl-10 flex-1 bg-slate-100/70 dark:bg-slate-800 border-none shadow-none w-[280px] rounded-full"
                    placeholder="Search albums, artists, or genres..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Mobile search button */}
                <Button
                  size="icon"
                  className="bg-muted text-foreground hover:bg-accent shadow-none rounded-full md:hidden"
                >
                  <Search className="!h-5 !w-5" />
                </Button>

                {/* Mobile menu links */}
                <div className="flex md:hidden items-center gap-4">
                  <Link 
                    to="/albums/1" 
                    className={`text-sm font-medium ${
                      location.pathname === '/' || location.pathname.startsWith('/albums') 
                        ? 'text-foreground' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    Albums
                  </Link>
                  <Link 
                    to="/artists/1" 
                    className={`text-sm font-medium ${
                      location.pathname.startsWith('/artists') 
                        ? 'text-foreground' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    Artists
                  </Link>
                </div>

                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}