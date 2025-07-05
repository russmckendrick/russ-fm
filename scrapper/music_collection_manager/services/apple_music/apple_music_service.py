"""Apple Music API service implementation."""

import jwt
import time
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote_plus

from ..base import BaseService, APIError, AuthenticationError
from ...models.enrichment import AppleMusicData, ArtistAppleMusicData
from ...utils.matching import MusicMatcher, AppleMusicMatcher


class AppleMusicService(BaseService):
    """Service for interacting with the Apple Music API."""
    
    BASE_URL = "https://api.music.apple.com/v1"
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.key_id = config.get("key_id")
        self.team_id = config.get("team_id")
        self.private_key_path = config.get("private_key_path")
        self.storefront = config.get("storefront", "us")
        
        if not all([self.key_id, self.team_id, self.private_key_path]):
            raise AuthenticationError("Apple Music API requires key_id, team_id, and private_key_path")
        
        self._load_private_key()
        self.matcher = MusicMatcher(self.logger)
    
    def _load_private_key(self) -> None:
        """Load the private key from file."""
        try:
            key_path = Path(self.private_key_path)
            if not key_path.is_absolute():
                # Resolve relative path from current working directory
                key_path = Path.cwd() / key_path
            
            if not key_path.exists():
                raise FileNotFoundError(f"Private key file not found: {key_path}")
            
            with open(key_path, 'r') as f:
                self.private_key = f.read()
        except Exception as e:
            raise AuthenticationError(f"Failed to load private key: {str(e)}")
    
    def _encode_search_term(self, term: str) -> str:
        """
        Properly encode search terms for Apple Music API.
        Apple Music API is more sensitive to URL encoding than other services.
        """
        if not term:
            return ""
        
        # Use quote_plus which converts spaces to + and properly encodes special characters
        # This matches Apple's documentation for URL encoding
        return quote_plus(term, safe='')
    
    def _normalize_search_term(self, term: str) -> str:
        """
        Normalize search term by removing or replacing problematic characters.
        This is used as a fallback when the original term fails.
        """
        if not term:
            return ""
        
        # Common character replacements for search fallback
        replacements = {
            'ü': 'u', 'ö': 'o', 'ä': 'a', 'ß': 'ss',
            'Ü': 'U', 'Ö': 'O', 'Ä': 'A',
            'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
            'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
            'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a',
            'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A',
            'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
            'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
            'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o',
            'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Õ': 'O',
            'ú': 'u', 'ù': 'u', 'û': 'u',
            'Ú': 'U', 'Ù': 'U', 'Û': 'U',
            'ñ': 'n', 'Ñ': 'N',
            'ç': 'c', 'Ç': 'C',
        }
        
        normalized = term
        for original, replacement in replacements.items():
            normalized = normalized.replace(original, replacement)
        
        return normalized
    
    def authenticate(self) -> None:
        """Generate JWT token for Apple Music API."""
        try:
            # JWT payload
            payload = {
                'iss': self.team_id,
                'iat': int(time.time()),
                'exp': int(time.time()) + 3600 * 12,  # 12 hours
            }
            
            # JWT header
            headers = {
                'kid': self.key_id,
                'alg': 'ES256'
            }
            
            # Generate JWT
            token = jwt.encode(payload, self.private_key, algorithm='ES256', headers=headers)
            
            self._auth_token = token
            self._token_expires_at = datetime.now() + timedelta(hours=11)  # Refresh before expiry
            
            self.logger.info("Apple Music JWT token generated successfully")
            
        except Exception as e:
            raise AuthenticationError(f"Failed to generate Apple Music JWT: {str(e)}")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers."""
        if not self._auth_token:
            self.authenticate()
        
        return {
            "Authorization": f"Bearer {self._auth_token}",
            "User-Agent": "MusicCollectionManager/1.0",
        }
    
    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for a release in Apple Music."""
        self.ensure_authenticated()
        
        # Build search query and try original encoding first
        query = f"{artist} {album}"
        
        try:
            encoded_term = self._encode_search_term(query)
            
            # Build URL manually to avoid double encoding
            base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
            url = f"{base_url}?term={encoded_term}&types=albums&limit=10"
            
            # Add optional parameters
            if "country" in kwargs:
                url += f"&country={kwargs['country']}"
            
            headers = self._get_auth_headers()
            response = self._make_request("GET", url, headers=headers)
            
            return response.json()
            
        except Exception as e:
            # If the original search fails, try with normalized characters
            self.logger.warning(f"Apple Music album search failed for '{query}': {str(e)}")
            
            # Try with normalized characters
            normalized_artist = self._normalize_search_term(artist)
            normalized_album = self._normalize_search_term(album)
            normalized_query = f"{normalized_artist} {normalized_album}"
            
            if normalized_query != query:
                self.logger.info(f"Trying normalized album search: '{normalized_query}'")
                try:
                    encoded_term = self._encode_search_term(normalized_query)
                    base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
                    url = f"{base_url}?term={encoded_term}&types=albums&limit=10"
                    
                    if "country" in kwargs:
                        url += f"&country={kwargs['country']}"
                    
                    headers = self._get_auth_headers()
                    response = self._make_request("GET", url, headers=headers)
                    
                    result = response.json()
                    self.logger.info(f"Normalized album search succeeded for '{normalized_query}'")
                    return result
                    
                except Exception as e2:
                    self.logger.warning(f"Normalized album search also failed: {str(e2)}")
            
            # Return empty result if both attempts fail
            return {"results": {"albums": {"data": []}}}
    
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific release."""
        self.ensure_authenticated()
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/catalog/{self.storefront}/albums/{release_id}",
            headers=headers
        )
        
        return response.json()
    
    def get_album_by_id(self, album_id: str, include_tracks: bool = True) -> Dict[str, Any]:
        """Get album details by Apple Music ID."""
        self.ensure_authenticated()
        
        params = {}
        if include_tracks:
            params["include"] = "tracks"
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/catalog/{self.storefront}/albums/{album_id}",
            headers=headers,
            params=params
        )
        
        return response.json()
    
    def get_artist_details(self, artist_id: str) -> Dict[str, Any]:
        """Get detailed information about an artist."""
        self.ensure_authenticated()
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/catalog/{self.storefront}/artists/{artist_id}",
            headers=headers
        )
        
        return response.json()
    
    def search_catalog(self, query: str, types: str = "albums,artists,songs", limit: int = 25) -> Dict[str, Any]:
        """Search Apple Music catalog."""
        self.ensure_authenticated()
        
        try:
            # Encode the search term properly
            encoded_term = self._encode_search_term(query)
            
            # Build URL manually to avoid double encoding
            base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
            url = f"{base_url}?term={encoded_term}&types={types}&limit=30&offset=0"
            
            headers = self._get_auth_headers()
            response = self._make_request("GET", url, headers=headers)
            
            return response.json()
            
        except Exception as e:
            # If the original search fails, try with normalized characters
            self.logger.warning(f"Apple Music catalog search failed for '{query}': {str(e)}")
            
            normalized_query = self._normalize_search_term(query)
            if normalized_query != query:
                self.logger.info(f"Trying normalized catalog search: '{normalized_query}'")
                try:
                    encoded_term = self._encode_search_term(normalized_query)
                    base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
                    url = f"{base_url}?term={encoded_term}&types={types}&limit=30&offset=0"
                    
                    headers = self._get_auth_headers()
                    response = self._make_request("GET", url, headers=headers)
                    
                    result = response.json()
                    self.logger.info(f"Normalized catalog search succeeded for '{normalized_query}'")
                    return result
                    
                except Exception as e2:
                    self.logger.warning(f"Normalized catalog search also failed: {str(e2)}")
            
            # Return empty result if both attempts fail
            return {"results": {}}
    
    def get_high_res_artwork(self, artwork_url: str, size: int = 2000) -> str:
        """Get high resolution artwork URL."""
        if not artwork_url:
            return ""
        
        # Apple Music artwork URLs can be modified for different sizes
        # Replace {w}x{h} with desired dimensions
        if "{w}x{h}" in artwork_url:
            return artwork_url.replace("{w}x{h}", f"{size}x{size}")
        elif "{w}" in artwork_url and "{h}" in artwork_url:
            return artwork_url.replace("{w}", str(size)).replace("{h}", str(size))
        
        return artwork_url
    
    def create_apple_music_enrichment(self, apple_data: Dict[str, Any]) -> AppleMusicData:
        """Create AppleMusicData enrichment from raw data."""
        attributes = apple_data.get("attributes", {})
        
        # Get artwork URL
        artwork_url = ""
        artwork = attributes.get("artwork", {})
        if artwork:
            url_template = artwork.get("url", "")
            if url_template:
                artwork_url = self.get_high_res_artwork(url_template)
        
        return AppleMusicData(
            id=apple_data.get("id"),
            url=attributes.get("url"),
            artwork_url=artwork_url,
            preview_url=attributes.get("previews", [{}])[0].get("url") if attributes.get("previews") else None,
            copyright=attributes.get("copyright"),
            editorial_notes=attributes.get("editorialNotes", {}).get("standard"),
            is_complete=attributes.get("isComplete", False),
            content_rating=attributes.get("contentRating"),
            raw_data=apple_data,
        )
    
    def find_best_match(self, search_results: Dict[str, Any], target_artist: str, target_album: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Find the best matching album from search results using centralized matcher."""
        candidates = AppleMusicMatcher.create_candidates(search_results)
        best_match = self.matcher.find_best_match(candidates, target_artist, target_album, **kwargs)
        return best_match.data if best_match else None
    
    # Artist-specific methods
    
    def search_artist(self, artist_name: str, limit: int = 30) -> Dict[str, Any]:
        """Search for an artist in Apple Music."""
        self.ensure_authenticated()
        
        # Try original search term first
        try:
            # Encode the search term properly
            encoded_term = self._encode_search_term(artist_name)
            
            # Build URL manually to avoid double encoding
            base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
            url = f"{base_url}?term={encoded_term}&types=artists"
            
            headers = self._get_auth_headers()
            response = self._make_request("GET", url, headers=headers)
            
            return response.json()
            
        except Exception as e:
            # If the original search fails, try with normalized characters
            self.logger.warning(f"Apple Music search failed for '{artist_name}': {str(e)}")
            
            # Try with normalized characters (removing special characters)
            normalized_name = self._normalize_search_term(artist_name)
            if normalized_name != artist_name:
                self.logger.info(f"Trying normalized search term: '{normalized_name}'")
                try:
                    encoded_term = self._encode_search_term(normalized_name)
                    base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
                    url = f"{base_url}?term={encoded_term}&types=artists"
                    
                    headers = self._get_auth_headers()
                    response = self._make_request("GET", url, headers=headers)
                    
                    result = response.json()
                    self.logger.info(f"Normalized search succeeded for '{normalized_name}'")
                    return result
                    
                except Exception as e2:
                    self.logger.warning(f"Normalized search also failed: {str(e2)}")
            
            # Return empty result if both attempts fail
            return {"results": {"artists": {"data": []}}}
    
    def get_artist_by_id(self, artist_id: str, include_albums: bool = False) -> Dict[str, Any]:
        """Get artist details by Apple Music ID."""
        self.ensure_authenticated()
        
        params = {}
        if include_albums:
            params["include"] = "albums"
        
        headers = self._get_auth_headers()
        response = self._make_request(
            "GET",
            f"{self.BASE_URL}/catalog/{self.storefront}/artists/{artist_id}",
            headers=headers,
            params=params
        )
        
        return response.json()
    
    def find_best_artist_match(self, search_results: Dict[str, Any], target_artist: str) -> Optional[Dict[str, Any]]:
        """Find the best matching artist from search results."""
        artists = search_results.get("results", {}).get("artists", {}).get("data", [])
        
        if not artists:
            return None
        
        target_artist_lower = target_artist.lower()
        best_match = None
        best_score = 0
        
        for artist in artists:
            attributes = artist.get("attributes", {})
            artist_name = attributes.get("name", "").lower()
            
            score = 0
            if target_artist_lower == artist_name:
                score += 10  # Exact match
            elif target_artist_lower in artist_name or artist_name in target_artist_lower:
                score += 5   # Partial match
            
            if score > best_score:
                best_score = score
                best_match = artist
        
        return best_match
    
    def create_artist_enrichment(self, artist_data: Dict[str, Any]) -> ArtistAppleMusicData:
        """Create ArtistAppleMusicData enrichment from raw data."""
        attributes = artist_data.get("attributes", {})
        
        # Get artwork URL
        artwork_url = ""
        artwork = attributes.get("artwork", {})
        if artwork:
            url_template = artwork.get("url", "")
            if url_template:
                artwork_url = self.get_high_res_artwork(url_template)
        
        return ArtistAppleMusicData(
            id=artist_data.get("id"),
            url=attributes.get("url"),
            name=attributes.get("name"),
            artwork_url=artwork_url,
            genres=attributes.get("genreNames", []),
            origin=attributes.get("origin", ""),
            editorial_notes=attributes.get("editorialNotes", {}).get("standard"),
            raw_data=artist_data,
        )