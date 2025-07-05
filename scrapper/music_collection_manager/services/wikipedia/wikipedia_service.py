"""Wikipedia API service implementation."""

import re
from typing import Dict, Any, Optional, List
from urllib.parse import quote

from ..base import BaseService
from ...models.enrichment import WikipediaData
from ...utils.text_cleaner import clean_for_json


class WikipediaService(BaseService):
    """Service for interacting with the Wikipedia API."""
    
    BASE_URL = "https://en.wikipedia.org/api/rest_v1"
    API_URL = "https://en.wikipedia.org/w/api.php"
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.language = config.get("language", "en")
        self.user_agent = config.get("user_agent", "MusicCollectionManager/1.0")
    
    def authenticate(self) -> None:
        """No authentication needed for Wikipedia API."""
        pass
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get headers for Wikipedia requests."""
        return {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }
    
    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for album information on Wikipedia."""
        # Try different search patterns
        search_terms = [
            f"{album} album {artist}",
            f"{album} {artist} album",
            f'"{album}" album',
            f"{artist} {album}",
        ]
        
        for term in search_terms:
            results = self.search_pages(term, limit=30)
            if results.get("query", {}).get("search"):
                return results
        
        return {"query": {"search": []}}
    
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a release (page title)."""
        return self.get_page_info(release_id)
    
    def search_pages(self, query: str, limit: int = 30) -> Dict[str, Any]:
        """Search Wikipedia pages."""
        params = {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query,
            "srlimit": limit,
            "srprop": "snippet|titlesnippet|size|timestamp",
        }
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", self.API_URL, headers=headers, params=params)
        
        return response.json()
    
    def get_page_info(self, page_title: str, include_extract: bool = True) -> Dict[str, Any]:
        """Get information about a specific page."""
        params = {
            "action": "query",
            "format": "json",
            "titles": page_title,
            "prop": "info|pageimages|pageterms",
            "inprop": "url",
            "piprop": "thumbnail|original",
            "pithumbsize": 500,
        }
        
        if include_extract:
            params["prop"] += "|extracts"
            params["exintro"] = "1"
            params["explaintext"] = "1"
            params["exsectionformat"] = "plain"
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", self.API_URL, headers=headers, params=params)
        
        return response.json()
    
    def get_page_summary(self, page_title: str) -> Dict[str, Any]:
        """Get page summary using the REST API."""
        # URL encode the title
        encoded_title = quote(page_title, safe='')
        
        headers = self._get_auth_headers()
        response = self._make_request("GET", f"{self.BASE_URL}/page/summary/{encoded_title}", headers=headers)
        
        return response.json()
    
    def search_artist(self, artist_name: str) -> Dict[str, Any]:
        """Search for artist information."""
        # Try different search patterns for artists
        search_terms = [
            f"{artist_name} musician",
            f"{artist_name} band",
            f"{artist_name} singer",
            f"{artist_name} artist",
            artist_name,
        ]
        
        for term in search_terms:
            results = self.search_pages(term, limit=30)
            search_results = results.get("query", {}).get("search", [])
            
            if search_results:
                # Filter for likely artist pages
                for result in search_results:
                    title = result.get("title", "").lower()
                    snippet = result.get("snippet", "").lower()
                    
                    # Check if it's likely an artist page
                    if any(keyword in title or keyword in snippet for keyword in [
                        "musician", "band", "singer", "artist", "songwriter", "producer"
                    ]):
                        return results
        
        return {"query": {"search": []}}
    
    def get_artist_info(self, artist_name: str) -> Optional[Dict[str, Any]]:
        """Get comprehensive artist information."""
        search_results = self.search_artist(artist_name)
        search_data = search_results.get("query", {}).get("search", [])
        
        if not search_data:
            return None
        
        # Try the first few results
        for result in search_data[:3]:
            page_title = result.get("title", "")
            if page_title:
                try:
                    # Get detailed page info
                    page_info = self.get_page_info(page_title)
                    
                    # Also get summary for better formatting
                    try:
                        summary = self.get_page_summary(page_title)
                        page_info["summary"] = summary
                    except:
                        pass
                    
                    return page_info
                except:
                    continue
        
        return None
    
    def extract_artist_bio(self, page_data: Dict[str, Any]) -> str:
        """Extract artist biography from page data."""
        bio_sources = []
        
        # Try REST API summary first
        if "summary" in page_data:
            summary_data = page_data["summary"]
            if "extract" in summary_data:
                bio_sources.append(summary_data["extract"])
        
        # Try page extract
        pages = page_data.get("query", {}).get("pages", {})
        for page_id, page_info in pages.items():
            if "extract" in page_info:
                bio_sources.append(page_info["extract"])
        
        # Return the first non-empty bio
        for bio in bio_sources:
            if bio and len(bio.strip()) > 50:  # Minimum meaningful length
                return self._clean_text(bio)
        
        return ""
    
    def _clean_text(self, text: str) -> str:
        """Clean up extracted text."""
        if not text:
            return ""
        
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Remove multiple spaces and newlines
        text = re.sub(r'\s+', ' ', text)
        
        # Remove common Wikipedia artifacts
        text = re.sub(r'\[citation needed\]', '', text)
        text = re.sub(r'\[.*?\]', '', text)  # Remove citations
        
        return text.strip()
    
    def create_wikipedia_enrichment(self, page_data: Dict[str, Any], page_title: str = "") -> WikipediaData:
        """Create WikipediaData enrichment from page data."""
        wikipedia_data = WikipediaData()
        
        # Handle both search results and page info
        if "summary" in page_data:
            # REST API summary format
            summary_data = page_data["summary"]
            wikipedia_data.url = summary_data.get("content_urls", {}).get("desktop", {}).get("page", "")
            wikipedia_data.title = summary_data.get("title", "")
            wikipedia_data.extract = summary_data.get("extract", "")
            
            # Images
            if "thumbnail" in summary_data:
                wikipedia_data.thumbnail = summary_data["thumbnail"].get("source", "")
            if "originalimage" in summary_data:
                wikipedia_data.original_image = summary_data["originalimage"].get("source", "")
                
        elif "query" in page_data:
            # API query format
            pages = page_data["query"].get("pages", {})
            for page_id, page_info in pages.items():
                if page_id != "-1":  # Page exists
                    wikipedia_data.page_id = page_id
                    wikipedia_data.title = page_info.get("title", "")
                    wikipedia_data.url = page_info.get("fullurl", "")
                    wikipedia_data.extract = page_info.get("extract", "")
                    
                    # Images
                    if "thumbnail" in page_info:
                        wikipedia_data.thumbnail = page_info["thumbnail"].get("source", "")
                    if "original" in page_info:
                        wikipedia_data.original_image = page_info["original"].get("source", "")
                    
                    break
        
        # Clean up extract using centralized cleaner
        if wikipedia_data.extract:
            wikipedia_data.extract = clean_for_json(wikipedia_data.extract)
        
        # Use extract as summary if no separate summary
        if not wikipedia_data.summary and wikipedia_data.extract:
            # Take first paragraph as summary
            paragraphs = wikipedia_data.extract.split('\n')
            if paragraphs:
                wikipedia_data.summary = clean_for_json(paragraphs[0])
        
        wikipedia_data.raw_data = page_data
        
        return wikipedia_data
    
    def find_best_artist_match(self, artist_name: str) -> Optional[WikipediaData]:
        """Find the best Wikipedia match for an artist."""
        artist_info = self.get_artist_info(artist_name)
        
        if not artist_info:
            return None
        
        return self.create_wikipedia_enrichment(artist_info)