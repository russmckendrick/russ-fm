"""Centralized matching utilities for consistent album/artist matching across all services."""

import logging
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass


@dataclass
class MatchCandidate:
    """Represents a candidate match from any music service."""
    data: Dict[str, Any]
    artist_name: str
    album_name: str
    release_date: Optional[str] = None
    album_type: Optional[str] = None
    is_compilation: Optional[bool] = None
    service_name: str = ""


class MusicMatcher:
    """Centralized matching logic for all music services."""
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger(__name__)
    
    def find_best_match(self, 
                       candidates: List[MatchCandidate], 
                       target_artist: str, 
                       target_album: str, 
                       **kwargs) -> Optional[MatchCandidate]:
        """Find the best matching album from a list of candidates."""
        if not candidates:
            return None
        
        target_artist_lower = target_artist.lower()
        target_album_lower = target_album.lower()
        target_year = kwargs.get("year")
        
        best_match = None
        best_score = 0
        
        for candidate in candidates:
            score = self._calculate_match_score(
                candidate, target_artist_lower, target_album_lower, target_year
            )
            
            self.logger.debug(f"{candidate.service_name} candidate: '{candidate.album_name}' by '{candidate.artist_name}' "
                            f"({candidate.release_date}, type: {candidate.album_type}, compilation: {candidate.is_compilation}) - Score: {score}")
            
            if score > best_score:
                best_score = score
                best_match = candidate
        
        if best_match:
            self.logger.info(f"{best_match.service_name} best match: '{best_match.album_name}' by '{best_match.artist_name}' (Score: {best_score})")
        
        return best_match
    
    def _calculate_match_score(self, 
                              candidate: MatchCandidate, 
                              target_artist_lower: str, 
                              target_album_lower: str, 
                              target_year: Optional[int]) -> int:
        """Calculate match score for a candidate."""
        score = 0
        
        # Artist matching (high priority)
        artist_name_lower = candidate.artist_name.lower()
        if target_artist_lower == artist_name_lower:
            score += 10  # Exact artist match
        elif target_artist_lower in artist_name_lower or artist_name_lower in target_artist_lower:
            score += 5   # Partial artist match
        else:
            # No artist match is usually a deal breaker
            return 0
        
        # Album title matching (high priority)
        album_name_lower = candidate.album_name.lower()
        if target_album_lower == album_name_lower:
            score += 10  # Exact title match
        elif target_album_lower in album_name_lower:
            score += 7   # Target is substring of result
        elif album_name_lower in target_album_lower:
            score += 5   # Result is substring of target
        
        # Album type preferences
        if candidate.album_type:
            album_type_lower = candidate.album_type.lower()
            if album_type_lower == "album":
                score += 3
            elif album_type_lower in ["compilation", "appears_on"]:
                score -= 3
            elif album_type_lower == "single":
                score -= 5
        
        # Compilation detection (multiple methods)
        is_compilation = self._detect_compilation(candidate)
        if is_compilation:
            score -= 3
        
        # Penalize compilation indicators in title
        compilation_indicators = [
            "best of", "greatest hits", "collection", "anthology", 
            "very very best", "essential", "hits", "complete"
        ]
        if any(indicator in album_name_lower for indicator in compilation_indicators):
            score -= 5
        
        # Year matching (medium priority)
        if target_year and candidate.release_date:
            year_score = self._calculate_year_score(candidate.release_date, target_year)
            score += year_score
        
        # Prefer original albums over reissues/remasters
        reissue_indicators = [
            "remaster", "reissue", "deluxe", "expanded", 
            "anniversary", "special edition", "bonus"
        ]
        if any(indicator in album_name_lower for indicator in reissue_indicators):
            score -= 1
        
        # Exact match bonus
        if (target_artist_lower == artist_name_lower and 
            target_album_lower == album_name_lower and 
            not is_compilation):
            score += 5
        
        return score
    
    def _detect_compilation(self, candidate: MatchCandidate) -> bool:
        """Detect if an album is a compilation using multiple methods."""
        # Direct compilation flag
        if candidate.is_compilation is True:
            return True
        
        # Apple Music specific detection
        if candidate.service_name.lower() == "apple_music":
            attributes = candidate.data.get("attributes", {})
            if attributes.get("isCompilation", False):
                return True
        
        # Album type detection
        if candidate.album_type and candidate.album_type.lower() in ["compilation", "appears_on"]:
            return True
        
        # Title-based detection
        album_name_lower = candidate.album_name.lower()
        compilation_words = [
            "best of", "greatest hits", "collection", "anthology",
            "essential", "hits", "complete", "very very best"
        ]
        return any(word in album_name_lower for word in compilation_words)
    
    def _calculate_year_score(self, release_date: str, target_year: int) -> int:
        """Calculate score based on release year proximity."""
        try:
            album_year = int(release_date.split("-")[0])
            year_diff = abs(target_year - album_year)
            
            if year_diff == 0:
                return 3  # Exact year match
            elif year_diff <= 2:
                return 1  # Close year match
            elif year_diff > 10:
                return -2  # Significantly different year
            else:
                return 0  # Neutral
        except (ValueError, IndexError, TypeError):
            return 0  # Can't parse year


# Service-specific candidate factories
class AppleMusicMatcher:
    """Apple Music specific candidate factory."""
    
    @staticmethod
    def create_candidates(search_results: Dict[str, Any]) -> List[MatchCandidate]:
        """Create MatchCandidate objects from Apple Music search results."""
        albums = search_results.get("results", {}).get("albums", {}).get("data", [])
        candidates = []
        
        for album in albums:
            attributes = album.get("attributes", {})
            candidate = MatchCandidate(
                data=album,
                artist_name=attributes.get("artistName", ""),
                album_name=attributes.get("name", ""),
                release_date=attributes.get("releaseDate", ""),
                album_type=None,  # Apple Music doesn't have clear album_type
                is_compilation=attributes.get("isCompilation", False),
                service_name="Apple Music"
            )
            candidates.append(candidate)
        
        return candidates


class SpotifyMatcher:
    """Spotify specific candidate factory."""
    
    @staticmethod
    def create_candidates(search_results: Dict[str, Any]) -> List[MatchCandidate]:
        """Create MatchCandidate objects from Spotify search results."""
        albums = search_results.get("albums", {}).get("items", [])
        candidates = []
        
        for album in albums:
            # Get primary artist name
            artists = album.get("artists", [])
            artist_name = artists[0].get("name", "") if artists else ""
            
            candidate = MatchCandidate(
                data=album,
                artist_name=artist_name,
                album_name=album.get("name", ""),
                release_date=album.get("release_date", ""),
                album_type=album.get("album_type", ""),
                is_compilation=album.get("album_type", "") == "compilation",
                service_name="Spotify"
            )
            candidates.append(candidate)
        
        return candidates