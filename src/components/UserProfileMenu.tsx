import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { LastFmAuthDialog } from './LastFmAuthDialog';
import { User, ExternalLink, LogOut } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';

/**
 * Last.fm account control for the navigation. Sits on the nav's flood colour,
 * so the round button borrows currentColor like the other header icon buttons.
 */
export function UserProfileMenu() {
  const { isAuthenticated, user, isLoading, logout } = useLastFmAuth();

  if (isLoading) {
    return (
      <button type="button" disabled className="icon-btn border-2 border-current opacity-60" aria-label="Checking Last.fm connection">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden />
      </button>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <LastFmAuthDialog>
        <button type="button" className="icon-btn border-2 border-current" aria-label="Connect to Last.fm" title="Connect to Last.fm">
          <SiLastdotfm className="h-5 w-5" aria-hidden />
        </button>
      </LastFmAuthDialog>
    );
  }

  const plays = parseInt(user.userInfo.playcount, 10);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="icon-btn border-2 border-current p-[3px]"
          aria-label={`Last.fm account: ${user.username}`}
        >
          <Avatar className="h-full w-full">
            <AvatarImage src={user.userAvatar || user.lastAlbumArt || undefined} alt="" />
            <AvatarFallback className="bg-[color:var(--ground-3)] text-[color:var(--cream)]">
              <User className="h-4 w-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" sideOffset={10} forceMount>
        <DropdownMenuLabel className="flex flex-col gap-1.5 px-3 py-3 normal-case tracking-normal">
          <span className="t-dispn truncate text-[18px] leading-none text-[color:var(--cream)]">{user.username}</span>
          {Number.isFinite(plays) && (
            <span className="t-mono text-[12px] font-normal text-[color:var(--cream-dim)]">
              {plays.toLocaleString()} plays
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href={user.userInfo.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span>Last.fm profile</span>
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
