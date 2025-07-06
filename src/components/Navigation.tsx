import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme-toggle";
import { Search, Music, Users } from "lucide-react";
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
              <div className="flex items-center gap-2 md:gap-6">
            <Link to="/albums/1">
              <Logo className="shrink-0" />
            </Link>

            <div className="relative hidden md:block">
              <Search className="h-5 w-5 absolute inset-y-0 my-auto left-2.5" />
              <Input
                className="pl-10 flex-1 bg-slate-100/70 dark:bg-slate-800 border-none shadow-none w-[280px] rounded-full"
                placeholder="Search albums, artists, or genres..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              </div>
              </div>

              <div className="flex items-center gap-2">
            <Button
              size="icon"
              className="bg-muted text-foreground hover:bg-accent shadow-none rounded-full md:hidden"
            >
              <Search className="!h-5 !w-5" />
            </Button>
            <Link to="/albums/1">
              <Button
                variant={location.pathname === '/' || location.pathname.startsWith('/albums') ? 'default' : 'outline'}
                className="hidden sm:inline-flex rounded-full"
              >
                <Music className="h-4 w-4 mr-2" />
                Albums
              </Button>
            </Link>
            <Link to="/artists/1">
              <Button
                variant={location.pathname.startsWith('/artists') ? 'default' : 'outline'}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Artists
              </Button>
            </Link>
            <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}