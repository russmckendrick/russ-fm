export interface LastFmUser {
  username: string;
  sessionKey: string;
  userInfo: {
    playcount: string;
    registered: { unixtime: string };
    url: string;
  };
  userAvatar: string | null;
  lastAlbumArt: string | null;
}

export interface ScrobbleRequest {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
}

export interface AlbumScrobbleRequest {
  artist: string;
  album: string;
  tracks: { title: string; artist?: string }[];
}

export interface ScrobbleResult {
  track: string;
  success: boolean;
  error?: string;
}

export interface AlbumScrobbleResponse {
  success: boolean;
  message: string;
  results: ScrobbleResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface AuthStatus {
  authenticated: boolean;
  user?: LastFmUser;
}

export interface AuthResponse {
  authUrl?: string;
  success?: boolean;
  error?: string;
}