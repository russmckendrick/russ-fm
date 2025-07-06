"""Discogs API service implementation."""

from typing import Dict, Any, List, Optional
from datetime import datetime

from ..base import BaseService, APIError, AuthenticationError
from ...models import Release, Artist, Track, Image, CollectionItem
from ...models.enrichment import DiscogsData
from ...utils.text_cleaner import clean_discogs_artist_name


class DiscogsService(BaseService):
    """Service for interacting with the Discogs API."""
    
    BASE_URL = "https://api.discogs.com"
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.access_token = config.get("access_token")
        self.username = config.get("username")
        
        if not self.access_token:
            raise AuthenticationError("Discogs access token is required")
    
    def authenticate(self) -> None:
        """Authenticate with Discogs API."""
        # Test authentication by getting user info
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/oauth/identity", headers=headers)
        
        if response.status_code != 200:
            raise AuthenticationError("Failed to authenticate with Discogs API")
        
        identity = response.json()
        self.logger.info(f"Authenticated as Discogs user: {identity.get('username')}")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers."""
        # Debug: Check the actual token value
        self.logger.info(f"🔑 Using Discogs token: {self.access_token[:10]}...{self.access_token[-10:]}")
        headers = {
            "Authorization": f"Discogs token={self.access_token}",
            "User-Agent": "MusicCollectionManager/1.0",
        }
        self.logger.info(f"🔑 Full headers: {headers}")
        return headers
    
    def search_artist(self, artist_name: str, limit: int = 25) -> Dict[str, Any]:
        """Search for artists in Discogs."""
        params = {
            "q": artist_name,
            "type": "artist",
            "per_page": min(limit, 100),  # Discogs allows up to 100 results per page
        }
        
        headers = self._get_auth_headers()
        url = f"{self.BASE_URL}/database/search"
        
        self.logger.info(f"🔍 Making Discogs search request to: {url}")
        self.logger.info(f"🔍 Headers: {headers}")
        self.logger.info(f"🔍 Params: {params}")
        
        # Use direct requests instead of the session to avoid retry/adapter issues
        import requests
        import time
        
        # Add a small delay to avoid potential timing issues
        time.sleep(0.5)
        
        self.logger.info(f"🔄 Making direct search request to: {url}")
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            self.logger.info(f"📊 Search response status: {response.status_code}")
            self.logger.info(f"📊 Search response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                self.logger.error(f"📊 Search response body: {response.text[:200]}...")
            
            # Check for rate limiting
            if response.status_code == 429:
                from ..base.exceptions import RateLimitError
                retry_after = response.headers.get("Retry-After", 60)
                raise RateLimitError(
                    f"Rate limit exceeded for {url}",
                    retry_after=int(retry_after)
                )
            
            # Check for authentication errors
            if response.status_code in [401, 403]:
                from ..base.exceptions import AuthenticationError
                raise AuthenticationError(
                    f"Authentication failed for {url}: {response.status_code}"
                )
            
            # Check for other errors
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request failed for {url}: {str(e)}")
            from ..base.exceptions import APIError
            raise APIError(f"Request failed: {str(e)}")

    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for a release by artist and album."""
        params = {
            "q": f"{artist} {album}",
            "type": "release",
            "per_page": 10,
        }
        
        # Add optional parameters
        if "format" in kwargs:
            params["format"] = kwargs["format"]
        if "year" in kwargs:
            params["year"] = kwargs["year"]
        if "country" in kwargs:
            params["country"] = kwargs["country"]
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/database/search", headers=headers, params=params)
        
        return response.json()
    
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a specific release."""
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/releases/{release_id}", headers=headers)
        
        return response.json()
    
    def get_master_release(self, master_id: str) -> Dict[str, Any]:
        """Get master release information."""
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/masters/{master_id}", headers=headers)
        
        return response.json()
    
    def get_user_collection(self, username: Optional[str] = None, folder_id: str = "0") -> List[Dict[str, Any]]:
        """Get user's collection items."""
        username = username or self.username
        if not username:
            raise ValueError("Username is required to fetch collection")
        
        headers = self._get_auth_headers()
        all_items = []
        page = 1
        per_page = 100
        
        while True:
            params = {
                "page": page,
                "per_page": per_page,
                "sort": "added",
                "sort_order": "desc",
            }
            
            response = self._make_request(
                "GET", 
                f"{self.BASE_URL}/users/{username}/collection/folders/{folder_id}/releases",
                headers=headers,
                params=params
            )
            
            data = response.json()
            releases = data.get("releases", [])
            
            if not releases:
                break
            
            all_items.extend(releases)
            
            # Check if there are more pages
            pagination = data.get("pagination", {})
            if page >= pagination.get("pages", 1):
                break
            
            page += 1
        
        return all_items
    
    def get_artist_details(self, artist_id: str) -> Dict[str, Any]:
        """Get detailed information about an artist."""
        headers = self._get_auth_headers()
        url = f"{self.BASE_URL}/artists/{artist_id}"
        
        # Use direct requests instead of the session to avoid retry/adapter issues
        import requests
        import time
        
        # Add a small delay to avoid potential timing issues
        time.sleep(0.5)
        
        self.logger.info(f"🔄 Making direct request to: {url}")
        try:
            response = requests.get(url, headers=headers, timeout=30)
            self.logger.info(f"📊 Response status: {response.status_code}")
            self.logger.info(f"📊 Response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                self.logger.error(f"📊 Response body: {response.text[:200]}...")
            
            
            # Check for rate limiting
            if response.status_code == 429:
                from ..base.exceptions import RateLimitError
                retry_after = response.headers.get("Retry-After", 60)
                raise RateLimitError(
                    f"Rate limit exceeded for {url}",
                    retry_after=int(retry_after)
                )
            
            # Check for authentication errors
            if response.status_code in [401, 403]:
                from ..base.exceptions import AuthenticationError
                raise AuthenticationError(
                    f"Authentication failed for {url}: {response.status_code}"
                )
            
            # Check for other errors
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request failed for {url}: {str(e)}")
            from ..base.exceptions import APIError
            raise APIError(f"Request failed: {str(e)}")

    def find_best_artist_match(self, search_results: Dict[str, Any], target_artist: str) -> Optional[Dict[str, Any]]:
        """Find the best matching artist from Discogs search results."""
        results = search_results.get("results", [])
        
        if not results:
            return None
        
        target_artist_lower = target_artist.lower()
        best_match = None
        best_score = 0
        
        for artist in results:
            artist_title = artist.get("title", "").lower()
            
            score = 0
            if target_artist_lower == artist_title:
                score += 10  # Exact match
            elif target_artist_lower in artist_title or artist_title in target_artist_lower:
                score += 5   # Partial match
            
            if score > best_score:
                best_score = score
                best_match = artist
        
        return best_match

    def create_artist_enrichment(self, artist_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create artist enrichment data from Discogs search result."""
        # For search results, we have limited data, but we can construct what we need
        return {
            "id": str(artist_data.get("id", "")),
            "name": artist_data.get("title", ""),
            "url": f"https://www.discogs.com/artist/{artist_data.get('id', '')}" if artist_data.get("id") else "",
            "resource_url": artist_data.get("resource_url", ""),
            "thumb": artist_data.get("thumb", ""),
            "cover_image": artist_data.get("cover_image", ""),
            "raw_data": artist_data
        }
    
    def get_label_details(self, label_id: str) -> Dict[str, Any]:
        """Get detailed information about a label."""
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/labels/{label_id}", headers=headers)
        
        return response.json()
    
    def get_collection_release_instances(self, release_id: str, username: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all instances of a release in the user's collection."""
        username = username or self.username
        if not username:
            raise ValueError("Username is required to check collection")
        
        headers = self._get_auth_headers()
        try:
            response = self._make_request(
                "GET",
                f"{self.BASE_URL}/users/{username}/collection/releases/{release_id}",
                headers=headers
            )
            
            if response.status_code == 404:
                # Release not in collection
                return []
            
            data = response.json()
            return data.get("releases", [])
        except Exception as e:
            self.logger.warning(f"Failed to check collection for release {release_id}: {str(e)}")
            return []
    
    def parse_release_data(self, discogs_data: Dict[str, Any]) -> Release:
        """Parse Discogs release data into Release model."""
        release = Release(
            id=str(discogs_data.get("id", "")),
            title=discogs_data.get("title", ""),
            discogs_id=str(discogs_data.get("id", "")),
            discogs_url=discogs_data.get("uri", ""),
            year=discogs_data.get("year"),
            released=discogs_data.get("released"),
            country=discogs_data.get("country"),
            raw_data={"discogs": discogs_data}
        )
        
        # Parse artists
        for artist_data in discogs_data.get("artists", []):
            original_name = artist_data.get("name", "")
            cleaned_name = clean_discogs_artist_name(original_name)
            
            artist = Artist(
                discogs_id=str(artist_data.get("id", "")),
                name=cleaned_name,  # Use cleaned name for display
                role=artist_data.get("role", "artist"),
            )
            
            # Preserve original Discogs name in raw_data
            artist.raw_data["discogs"] = {
                "original_name": original_name,
                "id": artist_data.get("id", ""),
                "role": artist_data.get("role", "artist")
            }
            
            release.add_artist(artist)
        
        # Parse formats
        for format_data in discogs_data.get("formats", []):
            format_name = format_data.get("name", "")
            if format_name:
                release.formats.append(format_name)
        
        # Parse labels
        for label_data in discogs_data.get("labels", []):
            label_name = label_data.get("name", "")
            if label_name:
                release.labels.append(label_name)
        
        # Parse genres and styles
        release.genres = discogs_data.get("genres", [])
        release.styles = discogs_data.get("styles", [])
        
        # Parse images
        for image_data in discogs_data.get("images", []):
            image = Image(
                url=image_data.get("resource_url", ""),
                type=image_data.get("type", "secondary"),
                width=image_data.get("width"),
                height=image_data.get("height"),
                resource_url=image_data.get("resource_url"),
            )
            release.add_image(image)
        
        # Parse tracklist
        for track_data in discogs_data.get("tracklist", []):
            track = Track(
                position=track_data.get("position", ""),
                title=track_data.get("title", ""),
                duration=track_data.get("duration", ""),
            )
            
            # Parse track artists
            for artist_data in track_data.get("artists", []):
                original_name = artist_data.get("name", "")
                cleaned_name = clean_discogs_artist_name(original_name)
                
                artist = Artist(
                    discogs_id=str(artist_data.get("id", "")),
                    name=cleaned_name,  # Use cleaned name for display
                    role=artist_data.get("role", "artist"),
                )
                
                # Preserve original Discogs name in raw_data
                artist.raw_data["discogs"] = {
                    "original_name": original_name,
                    "id": artist_data.get("id", ""),
                    "role": artist_data.get("role", "artist")
                }
                
                track.artists.append(artist)
            
            release.tracklist.append(track)
        
        return release
    
    def parse_collection_item(self, item_data: Dict[str, Any]) -> CollectionItem:
        """Parse Discogs collection item data."""
        basic_info = item_data.get("basic_information", {})
        
        # Create release from basic information
        release = self.parse_release_data(basic_info)
        
        # Parse date added
        date_added = None
        if "date_added" in item_data:
            try:
                date_added = datetime.fromisoformat(item_data["date_added"].replace("Z", "+00:00"))
            except ValueError:
                self.logger.warning(f"Could not parse date_added: {item_data['date_added']}")
        
        # Set date_added on the release object
        release.date_added = date_added
        
        collection_item = CollectionItem(
            id=str(item_data.get("id", "")),
            release=release,
            instance_id=str(item_data.get("instance_id", "")),
            folder_id=str(item_data.get("folder_id", "")),
            date_added=date_added,
            notes=item_data.get("notes", {}).get("value", ""),
            rating=item_data.get("rating"),
            basic_information=basic_info,
        )
        
        return collection_item
    
    def create_discogs_enrichment(self, discogs_data: Dict[str, Any]) -> DiscogsData:
        """Create DiscogsData enrichment from raw data."""
        return DiscogsData(
            id=str(discogs_data.get("id", "")),
            master_id=str(discogs_data.get("master_id", "")),
            resource_url=discogs_data.get("resource_url", ""),
            uri=discogs_data.get("uri", ""),
            catalog_number=discogs_data.get("catalog_number", ""),
            barcode=discogs_data.get("barcode", ""),
            rating=discogs_data.get("rating", {}).get("average"),
            votes=discogs_data.get("rating", {}).get("count"),
            want=discogs_data.get("community", {}).get("want", 0),
            have=discogs_data.get("community", {}).get("have", 0),
            raw_data=discogs_data,
        )