"""Spotify API service implementation."""

import base64
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from ..base import BaseService, APIError, AuthenticationError
from ...models.enrichment import SpotifyData, ArtistSpotifyData
from ...utils.matching import MusicMatcher, SpotifyMatcher


class SpotifyService(BaseService):
    """Service for interacting with the Spotify Web API."""
    
    BASE_URL = "https://api.spotify.com/v1"
    AUTH_URL = "https://accounts.spotify.com/api/token"
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.client_id = config.get("client_id")
        self.client_secret = config.get("client_secret")
        self.market = config.get("market", "US")  # Default to US market
        self.matcher = MusicMatcher(self.logger)
        
        if not all([self.client_id, self.client_secret]):
            raise AuthenticationError("Spotify API requires client_id and client_secret")
    
    def authenticate(self) -> None:
        """Authenticate using Client Credentials flow."""
        try:
            # Encode credentials
            credentials = f"{self.client_id}:{self.client_secret}"
            credentials_b64 = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Authorization": f"Basic {credentials_b64}",
                "Content-Type": "application/x-www-form-urlencoded",
            }
            
            data = {
                "grant_type": "client_credentials"
            }
            
            response = self._make_request("POST", self.AUTH_URL, headers=headers, data=data)
            token_data = response.json()
            
            self._auth_token = token_data["access_token"]
            expires_in = token_data.get("expires_in", 3600)
            self._token_expires_at = datetime.now() + timedelta(seconds=expires_in - 60)  # Refresh 1 min early
            
            self.logger.info("Spotify access token obtained successfully")
            
        except Exception as e:
            raise AuthenticationError(f"Failed to authenticate with Spotify: {str(e)}")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers."""
        if not self._auth_token:
            self.authenticate()
        
        return {
            "Authorization": f"Bearer {self._auth_token}",
            "User-Agent": "MusicCollectionManager/1.0",
        }
    
    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for a release in Spotify."""
        self.ensure_authenticated()
        
        # Build search query - use simpler approach that works better
        query = f"{artist} {album}"
        params = {
            "q": query,
            "type": "album",
            "market": self.market,
            "limit": 30,
            "offset": 0
        }
        
        # Add optional parameters
        if "market" in kwargs:
            params["market"] = kwargs["market"]
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/search", headers=headers, params=params)
        
        return response.json()
    
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific release."""
        self.ensure_authenticated()
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/albums/{release_id}", headers=headers)
        
        return response.json()
    
    def get_album_by_id(self, album_id: str, market: str = "US") -> Dict[str, Any]:
        """Get album details by Spotify ID."""
        self.ensure_authenticated()
        
        params = {"market": market}
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/albums/{album_id}", headers=headers, params=params)
        
        return response.json()
    
    def get_artist_details(self, artist_id: str) -> Dict[str, Any]:
        """Get detailed information about an artist."""
        self.ensure_authenticated()
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/artists/{artist_id}", headers=headers)
        
        return response.json()
    
    def get_artist_albums(self, artist_id: str, include_groups: str = "album,single", market: str = "US", limit: int = 20) -> Dict[str, Any]:
        """Get an artist's albums."""
        self.ensure_authenticated()
        
        params = {
            "include_groups": include_groups,
            "market": market,
            "limit": limit,
        }
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET", 
            f"{self.BASE_URL}/artists/{artist_id}/albums", 
            headers=headers, 
            params=params
        )
        
        return response.json()
    
    def get_album_tracks(self, album_id: str, market: str = "US", limit: int = 50) -> Dict[str, Any]:
        """Get tracks from an album."""
        self.ensure_authenticated()
        
        params = {
            "market": market,
            "limit": limit,
        }
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET", 
            f"{self.BASE_URL}/albums/{album_id}/tracks", 
            headers=headers, 
            params=params
        )
        
        return response.json()
    
    def search_tracks(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search for tracks."""
        self.ensure_authenticated()
        
        params = {
            "q": query,
            "type": "track",
            "limit": limit,
        }
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/search", headers=headers, params=params)
        
        return response.json()
    
    def create_spotify_enrichment(self, spotify_data: Dict[str, Any]) -> SpotifyData:
        """Create SpotifyData enrichment from raw data."""
        # Handle both album and track data
        if "album_type" in spotify_data:
            # Album data - fetch additional details if we have an ID
            album_id = spotify_data.get("id")
            detailed_data = spotify_data
            
            # Try to get more detailed album info
            if album_id:
                try:
                    detailed_response = self.get_album_by_id(album_id)
                    detailed_data = detailed_response
                except Exception as e:
                    self.logger.warning(f"Failed to get detailed album data: {str(e)}")
            
            # Extract tracks if available
            tracks = []
            track_data = detailed_data.get("tracks", {}).get("items", [])
            for track in track_data:
                tracks.append({
                    "id": track.get("id"),
                    "name": track.get("name"),
                    "duration_ms": track.get("duration_ms"),
                    "track_number": track.get("track_number"),
                    "explicit": track.get("explicit"),
                    "preview_url": track.get("preview_url"),
                    "artists": [{"name": artist.get("name"), "id": artist.get("id")} for artist in track.get("artists", [])]
                })
            
            return SpotifyData(
                id=detailed_data.get("id"),
                url=detailed_data.get("external_urls", {}).get("spotify"),
                preview_url=None,  # Albums don't have preview URLs
                popularity=detailed_data.get("popularity"),
                album_type=detailed_data.get("album_type"),
                total_tracks=detailed_data.get("total_tracks"),
                release_date=detailed_data.get("release_date"),
                release_date_precision=detailed_data.get("release_date_precision"),
                available_markets=detailed_data.get("available_markets", []),
                external_ids=detailed_data.get("external_ids", {}),
                images=detailed_data.get("images", []),
                label=detailed_data.get("label"),
                copyrights=detailed_data.get("copyrights", []),
                tracks=tracks,
                explicit=any(track.get("explicit", False) for track in track_data),
                raw_data=detailed_data,
            )
        else:
            # Track data
            return SpotifyData(
                id=spotify_data.get("id"),
                url=spotify_data.get("external_urls", {}).get("spotify"),
                preview_url=spotify_data.get("preview_url"),
                popularity=spotify_data.get("popularity"),
                available_markets=spotify_data.get("available_markets", []),
                external_ids=spotify_data.get("external_ids", {}),
                explicit=spotify_data.get("explicit"),
                raw_data=spotify_data,
            )
    
    def find_best_match(self, search_results: Dict[str, Any], target_artist: str, target_album: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Find the best matching album from search results using centralized matcher."""
        candidates = SpotifyMatcher.create_candidates(search_results)
        best_match = self.matcher.find_best_match(candidates, target_artist, target_album, **kwargs)
        return best_match.data if best_match else None
    
    def get_external_urls(self, spotify_data: Dict[str, Any]) -> Dict[str, str]:
        """Extract external URLs from Spotify data."""
        external_urls = spotify_data.get("external_urls", {})
        
        # Common external ID mappings
        external_ids = spotify_data.get("external_ids", {})
        
        urls = {}
        if "spotify" in external_urls:
            urls["spotify"] = external_urls["spotify"]
        
        # Add other external IDs if available
        if "isrc" in external_ids:
            urls["isrc"] = external_ids["isrc"]
        if "ean" in external_ids:
            urls["ean"] = external_ids["ean"]
        if "upc" in external_ids:
            urls["upc"] = external_ids["upc"]
        
        return urls
    
    # Artist-specific methods
    
    def search_artist(self, artist_name: str, limit: int = 30) -> Dict[str, Any]:
        """Search for an artist in Spotify."""
        self.ensure_authenticated()
        
        params = {
            "q": artist_name,
            "type": "artist",
            "limit": limit,
        }
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/search",
            headers=headers,
            params=params
        )
        
        return response.json()
    
    def get_artist_by_id(self, artist_id: str) -> Dict[str, Any]:
        """Get artist details by Spotify ID."""
        self.ensure_authenticated()
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/artists/{artist_id}",
            headers=headers
        )
        
        return response.json()
    
    def get_artist_albums(self, artist_id: str, limit: int = 20, album_type: str = "album") -> Dict[str, Any]:
        """Get artist's albums."""
        self.ensure_authenticated()
        
        params = {
            "limit": limit,
            "include_groups": album_type,
        }
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/artists/{artist_id}/albums",
            headers=headers,
            params=params
        )
        
        return response.json()
    
    def get_artist_top_tracks(self, artist_id: str, market: str = "US") -> Dict[str, Any]:
        """Get artist's top tracks."""
        self.ensure_authenticated()
        
        params = {"market": market}
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/artists/{artist_id}/top-tracks",
            headers=headers,
            params=params
        )
        
        return response.json()
    
    def find_best_artist_match(self, search_results: Dict[str, Any], target_artist: str) -> Optional[Dict[str, Any]]:
        """Find the best matching artist from search results."""
        artists = search_results.get("artists", {}).get("items", [])
        
        if not artists:
            return None
        
        target_artist_lower = target_artist.lower()
        best_match = None
        best_score = 0
        
        for artist in artists:
            artist_name = artist.get("name", "").lower()
            popularity = artist.get("popularity", 0)
            
            score = 0
            if target_artist_lower == artist_name:
                score += 10  # Exact match
            elif target_artist_lower in artist_name or artist_name in target_artist_lower:
                score += 5   # Partial match
            
            # Boost score for more popular artists in case of ties
            score += popularity / 100
            
            if score > best_score:
                best_score = score
                best_match = artist
        
        return best_match
    
    def create_artist_enrichment(self, artist_data: Dict[str, Any]) -> ArtistSpotifyData:
        """Create ArtistSpotifyData enrichment from raw data."""
        return ArtistSpotifyData(
            id=artist_data.get("id"),
            url=artist_data.get("external_urls", {}).get("spotify"),
            name=artist_data.get("name"),
            popularity=artist_data.get("popularity"),
            followers=artist_data.get("followers", {}).get("total"),
            genres=artist_data.get("genres", []),
            images=artist_data.get("images", []),
            external_urls=artist_data.get("external_urls", {}),
            raw_data=artist_data,
        )