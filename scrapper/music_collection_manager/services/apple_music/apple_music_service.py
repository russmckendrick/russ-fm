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
    
    def search_release_by_query(self, query: str, **kwargs) -> Dict[str, Any]:
        """Search for a release in Apple Music using a custom query."""
        self.ensure_authenticated()
        
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
            normalized_query = self._normalize_search_term(query)
            
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
            url = f"{base_url}?term={encoded_term}&types={types}&limit=25&offset=0"
            
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
                    url = f"{base_url}?term={encoded_term}&types={types}&limit=25&offset=0"
                    
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
    
    def search_artist(self, artist_name: str, limit: int = 25) -> Dict[str, Any]:
        """Search for an artist in Apple Music using improved search methods."""
        self.ensure_authenticated()
        
        # Try the newer search/suggestions endpoint first for better results
        try:
            # Use search/suggestions for more accurate top results
            base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search/suggestions"
            params = {
                "term": artist_name,  # Use unencoded term in params
                "kinds": "topResults",
                "types": "artists",
                "limit": min(limit, 10)  # Keep suggestions limit lower for faster response
            }
            
            headers = self._get_auth_headers()
            response = self._make_request("GET", base_url, headers=headers, params=params)
            
            suggestions_result = response.json()
            
            # If we get good results from suggestions, use them
            if (suggestions_result.get("results", {}).get("suggestions", []) and 
                any(s.get("kind") == "topResults" for s in suggestions_result["results"]["suggestions"])):
                
                # Convert suggestions format to standard search format for compatibility
                converted_result = self._convert_suggestions_to_search_format(suggestions_result)
                if converted_result.get("results", {}).get("artists", {}).get("data"):
                    self.logger.info(f"Using Apple Music search suggestions for '{artist_name}'")
                    return converted_result
            
        except Exception as e:
            self.logger.warning(f"Apple Music search suggestions failed for '{artist_name}': {str(e)}")
        
        # Fallback to traditional search with basic parameters
        try:
            base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
            params = {
                "term": artist_name,  # Use unencoded term in params
                "types": "artists",
                "limit": min(limit, 25)  # Apple Music API max limit is 25
            }
            
            headers = self._get_auth_headers()
            response = self._make_request("GET", base_url, headers=headers, params=params)
            
            return response.json()
            
        except Exception as e:
            # If the original search fails, try with normalized characters
            self.logger.warning(f"Apple Music search failed for '{artist_name}': {str(e)}")
            
            # Try with normalized characters (removing special characters)
            normalized_name = self._normalize_search_term(artist_name)
            if normalized_name != artist_name:
                self.logger.info(f"Trying normalized search term: '{normalized_name}'")
                try:
                    base_url = f"{self.BASE_URL}/catalog/{self.storefront}/search"
                    params = {
                        "term": normalized_name,  # Use unencoded normalized term in params
                        "types": "artists",
                        "limit": min(limit, 25)  # Apple Music API max limit is 25
                    }
                    
                    headers = self._get_auth_headers()
                    response = self._make_request("GET", base_url, headers=headers, params=params)
                    
                    result = response.json()
                    self.logger.info(f"Normalized search succeeded for '{normalized_name}'")
                    return result
                    
                except Exception as e2:
                    self.logger.warning(f"Normalized search also failed: {str(e2)}")
            
            # Return empty result if both attempts fail
            return {"results": {"artists": {"data": []}}}
    
    def _convert_suggestions_to_search_format(self, suggestions_result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert search suggestions response to standard search format for compatibility."""
        converted = {"results": {"artists": {"data": []}}}
        
        suggestions = suggestions_result.get("results", {}).get("suggestions", [])
        
        for suggestion in suggestions:
            if suggestion.get("kind") == "topResults":
                content = suggestion.get("content", {})
                artists = content.get("artists", {}).get("data", [])
                converted["results"]["artists"]["data"].extend(artists)
        
        return converted
    
    def get_artist_by_id(self, artist_id: str, include_albums: bool = False, include_views: bool = True) -> Dict[str, Any]:
        """Get artist details by Apple Music ID with enhanced data using views and relationships."""
        self.ensure_authenticated()
        
        params = {}
        
        # Add relationships if requested
        if include_albums:
            params["include"] = "albums"
        
        # Add views for richer artist data (top songs, top albums, etc.)
        if include_views:
            # Use multiple views to get comprehensive artist data
            views = ["top-songs", "featured-albums", "latest-release"]
            params["views"] = ",".join(views)
        
        # Note: Extended attributes removed due to API compatibility issues
        
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
        """Create ArtistAppleMusicData enrichment from raw data with enhanced attributes."""
        attributes = artist_data.get("attributes", {})
        
        # Get artwork URL
        artwork_url = ""
        artwork = attributes.get("artwork", {})
        if artwork:
            url_template = artwork.get("url", "")
            if url_template:
                artwork_url = self.get_high_res_artwork(url_template)
        
        # Extract extended attributes that may be available (these may not be present in basic API responses)
        born_or_formed = attributes.get("bornOrFormed")
        origin = attributes.get("origin")
        editorial_video = attributes.get("editorialVideo")
        
        # Enhanced genre extraction
        genres = attributes.get("genreNames", [])
        
        # Extract editorial notes with fallback
        editorial_notes = None
        editorial_data = attributes.get("editorialNotes", {})
        if editorial_data:
            editorial_notes = editorial_data.get("standard") or editorial_data.get("short")
        
        return ArtistAppleMusicData(
            id=artist_data.get("id"),
            url=attributes.get("url"),
            name=attributes.get("name"),
            artwork_url=artwork_url,
            genres=genres,
            origin=origin or "",  # New field for artist origin
            editorial_notes=editorial_notes,
            born_or_formed=born_or_formed,  # New field for when artist was born/formed
            editorial_video_url=editorial_video.get("url") if editorial_video else None,  # New field
            raw_data=artist_data,
        )

    def _make_request(self, method: str, url: str, **kwargs) -> Any:
        """Make HTTP request with enhanced error handling and logging."""
        try:
            # Log the request for debugging
            self.logger.debug(f"Apple Music API request: {method} {url}")
            
            response = super()._make_request(method, url, **kwargs)
            
            # Check for Apple Music specific error responses
            if response.status_code == 401:
                self.logger.error("Apple Music API authentication failed - check JWT token")
                raise AuthenticationError("Apple Music API authentication failed")
            elif response.status_code == 403:
                self.logger.error("Apple Music API access forbidden - check permissions")
                raise AuthenticationError("Apple Music API access forbidden")
            elif response.status_code == 429:
                self.logger.warning("Apple Music API rate limit exceeded")
                raise APIError("Apple Music API rate limit exceeded")
            elif response.status_code >= 400:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("errors", [{}])[0].get("detail", "Unknown error")
                    self.logger.error(f"Apple Music API error: {error_msg}")
                    raise APIError(f"Apple Music API error: {error_msg}")
                except:
                    self.logger.error(f"Apple Music API HTTP {response.status_code}: {response.text}")
                    raise APIError(f"Apple Music API HTTP {response.status_code}")
            
            # Log successful response
            self.logger.debug(f"Apple Music API response: {response.status_code}")
            return response
            
        except Exception as e:
            if not isinstance(e, (AuthenticationError, APIError)):
                self.logger.error(f"Apple Music API request failed: {str(e)}")
                raise APIError(f"Apple Music API request failed: {str(e)}")
            raise

    def ensure_authenticated(self) -> None:
        """Ensure we have a valid authentication token with better error handling."""
        try:
            if not self._auth_token or (
                self._token_expires_at and 
                datetime.now() >= self._token_expires_at
            ):
                self.logger.info("Apple Music JWT token expired or missing, regenerating...")
                self.authenticate()
        except Exception as e:
            self.logger.error(f"Apple Music authentication failed: {str(e)}")
            raise AuthenticationError(f"Apple Music authentication failed: {str(e)}")

    def validate_configuration(self) -> Dict[str, Any]:
        """Validate Apple Music API configuration and return diagnostic information."""
        validation_result = {
            "valid": False,
            "issues": [],
            "recommendations": []
        }
        
        # Check required credentials
        if not self.key_id:
            validation_result["issues"].append("Missing key_id")
            validation_result["recommendations"].append("Set key_id in Apple Music configuration")
        
        if not self.team_id:
            validation_result["issues"].append("Missing team_id")
            validation_result["recommendations"].append("Set team_id in Apple Music configuration")
        
        if not self.private_key_path:
            validation_result["issues"].append("Missing private_key_path")
            validation_result["recommendations"].append("Set private_key_path in Apple Music configuration")
        
        # Check private key file
        if self.private_key_path:
            key_path = Path(self.private_key_path)
            if not key_path.is_absolute():
                key_path = Path.cwd() / key_path
            
            if not key_path.exists():
                validation_result["issues"].append(f"Private key file not found: {key_path}")
                validation_result["recommendations"].append("Ensure the private key file exists and path is correct")
            else:
                try:
                    with open(key_path, 'r') as f:
                        key_content = f.read()
                        if not key_content.strip().startswith("-----BEGIN PRIVATE KEY-----"):
                            validation_result["issues"].append("Private key file format appears invalid")
                            validation_result["recommendations"].append("Ensure private key is in PEM format")
                except Exception as e:
                    validation_result["issues"].append(f"Cannot read private key file: {str(e)}")
        
        # Test JWT generation
        try:
            self.authenticate()
            validation_result["recommendations"].append("JWT token generated successfully")
        except Exception as e:
            validation_result["issues"].append(f"JWT generation failed: {str(e)}")
            validation_result["recommendations"].append("Check Apple Music credentials and private key format")
        
        # Test API access
        try:
            test_response = self.search_catalog("test", limit=1)
            if test_response.get("results"):
                validation_result["recommendations"].append("API access test successful")
            else:
                validation_result["issues"].append("API access test returned no results")
        except Exception as e:
            validation_result["issues"].append(f"API access test failed: {str(e)}")
            validation_result["recommendations"].append("Check network connectivity and Apple Music service status")
        
        validation_result["valid"] = len(validation_result["issues"]) == 0
        
        return validation_result