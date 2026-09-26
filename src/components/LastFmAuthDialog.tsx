import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useLastFmAuth } from '../hooks/useLastFmAuth';
import { ExternalLink, User, LogOut } from 'lucide-react';
import { SiLastdotfm } from 'react-icons/si';

interface LastFmAuthDialogProps {
  children: React.ReactNode;
}

const CREAM_PILL = { background: 'var(--cream)', color: 'var(--ground)' };

export function LastFmAuthDialog({ children }: LastFmAuthDialogProps) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user, isLoading, error, login, logout } = useLastFmAuth();

  const handleLogin = async () => {
    await login();
    // Dialog stays open to show the auth status.
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Last.fm</DialogTitle>
            <DialogDescription>Checking your connection…</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6" aria-hidden>
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--cream)] border-t-transparent motion-reduce:animate-none" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const plays = user ? parseInt(user.userInfo.playcount, 10) : NaN;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <SiLastdotfm className="h-6 w-6 shrink-0" aria-hidden />
            Last.fm
          </DialogTitle>
          <DialogDescription>
            {isAuthenticated
              ? 'Connected. Records you play here are scrobbled to your account.'
              : 'Connect your Last.fm account to scrobble records from the collection.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div role="alert" className="rounded-xl bg-[#5a1a14] px-4 py-3 text-[14px] text-[color:var(--cream)]">
            {error}
          </div>
        )}

        {isAuthenticated && user ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4 rounded-2xl bg-[color:var(--ground-3)] p-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={user.userAvatar || user.lastAlbumArt || undefined} alt="" />
                <AvatarFallback className="bg-[color:var(--ground)] text-[color:var(--cream)]">
                  <User className="h-6 w-6" aria-hidden />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="t-dispn truncate text-[18px] leading-tight">{user.username}</p>
                {Number.isFinite(plays) && (
                  <p className="t-mono mt-1 text-[12px] text-[color:var(--cream-dim)]">{plays.toLocaleString()} plays</p>
                )}
              </div>
              <a
                href={user.userInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-btn border-2 border-[color:var(--cream-rule)] hover:border-[color:var(--cream)]"
                aria-label={`Open ${user.username} on Last.fm`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setOpen(false)} className="pill pill-solid flex-1" style={CREAM_PILL}>
                Done
              </button>
              <button type="button" onClick={handleLogout} className="pill">
                <LogOut className="h-4 w-4" aria-hidden />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleLogin} className="pill pill-solid pill-lg flex-1" style={CREAM_PILL}>
              <SiLastdotfm className="h-5 w-5" aria-hidden />
              Connect Last.fm
            </button>
            <button type="button" onClick={() => setOpen(false)} className="pill pill-lg">
              Cancel
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
