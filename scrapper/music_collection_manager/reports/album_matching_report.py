"""Album matching report for comparing album names across services."""

import json
import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
from dataclasses import dataclass
from difflib import SequenceMatcher
from datetime import datetime

from ..utils.database import DatabaseManager
from ..models import Release


@dataclass
class AlbumMatchResult:
    """Result of comparing album names across services."""
    discogs_id: str
    discogs_title: str
    apple_music_title: Optional[str]
    spotify_title: Optional[str]
    discogs_normalized: str
    apple_music_normalized: Optional[str]
    spotify_normalized: Optional[str]
    apple_music_similarity: Optional[float]
    spotify_similarity: Optional[float]
    has_mismatch: bool
    mismatch_reasons: List[str]


class AlbumMatchingReport:
    """Generate reports comparing album names across Discogs, Apple Music, and Spotify."""
    
    def __init__(self, config: Dict[str, Any], filter_config_path: str = "album_matching_filters.json", logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        self.filter_config = self._load_filter_config(filter_config_path)
        
        # Initialize database manager
        db_path = config.get("database", {}).get("path", "collection_cache.db")
        self.db_manager = DatabaseManager(db_path, logger)
    
    def _load_filter_config(self, filter_config_path: str) -> Dict[str, Any]:
        """Load the filter configuration from JSON file."""
        try:
            config_path = Path(filter_config_path)
            if not config_path.exists():
                self.logger.warning(f"Filter config file not found: {filter_config_path}, using defaults")
                return self._get_default_filter_config()
            
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load filter config: {str(e)}")
            return self._get_default_filter_config()
    
    def _get_default_filter_config(self) -> Dict[str, Any]:
        """Get default filter configuration."""
        return {
            "filters": {
                "common_variations": [
                    "deluxe edition", "deluxe", "remaster", "remastered", "special edition",
                    "expanded edition", "anniversary edition", "collector's edition", "limited edition"
                ],
                "punctuation_ignore": [":", ";", "!", "?", ".", ",", "'", "\"", "-", "_", "&", "and"],
                "parentheses_content": True,
                "brackets_content": True,
                "case_sensitive": False,
                "normalize_spaces": True,
                "remove_leading_articles": ["the", "a", "an"]
            },
            "reporting": {
                "similarity_threshold": 0.8,
                "show_only_mismatches": True,
                "include_partial_matches": False,
                "include_unprocessed": True,
                "max_results": 100
            }
        }
    
    def normalize_album_name(self, album_name: str) -> str:
        """Normalize album name according to filter configuration."""
        if not album_name:
            return ""
        
        filters = self.filter_config.get("filters", {})
        normalized = album_name
        
        # Convert to lowercase if not case sensitive
        if not filters.get("case_sensitive", False):
            normalized = normalized.lower()
        
        # Remove content in parentheses
        if filters.get("parentheses_content", True):
            normalized = re.sub(r'\([^)]*\)', '', normalized)
        
        # Remove content in brackets
        if filters.get("brackets_content", True):
            normalized = re.sub(r'\[[^\]]*\]', '', normalized)
        
        # Remove common variations
        common_variations = filters.get("common_variations", [])
        for variation in common_variations:
            pattern = r'\b' + re.escape(variation.lower()) + r'\b'
            normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
        
        # Remove punctuation
        punctuation_ignore = filters.get("punctuation_ignore", [])
        for punct in punctuation_ignore:
            if punct == "and":
                normalized = re.sub(r'\band\b', '&', normalized, flags=re.IGNORECASE)
            else:
                normalized = normalized.replace(punct, '')
        
        # Normalize spaces
        if filters.get("normalize_spaces", True):
            normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        # Remove leading articles
        leading_articles = filters.get("remove_leading_articles", [])
        for article in leading_articles:
            pattern = r'^' + re.escape(article.lower()) + r'\s+'
            normalized = re.sub(pattern, '', normalized, flags=re.IGNORECASE)
        
        return normalized.strip()
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two text strings."""
        if not text1 or not text2:
            return 0.0
        
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    def analyze_release_matching(self, release: Release) -> AlbumMatchResult:
        """Analyze matching for a single release."""
        # Use the new service-specific release name fields
        discogs_title = release.release_name_discogs or release.title
        apple_music_title = release.release_name_apple_music
        spotify_title = release.release_name_spotify
        
        # Debug logging
        self.logger.debug(f"Release {release.discogs_id}: Discogs='{discogs_title}', Apple Music='{apple_music_title}', Spotify='{spotify_title}'")
        
        # Normalize titles
        discogs_normalized = self.normalize_album_name(discogs_title)
        apple_music_normalized = self.normalize_album_name(apple_music_title) if apple_music_title else None
        spotify_normalized = self.normalize_album_name(spotify_title) if spotify_title else None
        
        # Calculate similarities
        apple_music_similarity = None
        spotify_similarity = None
        
        if apple_music_normalized:
            apple_music_similarity = self.calculate_similarity(discogs_normalized, apple_music_normalized)
        
        if spotify_normalized:
            spotify_similarity = self.calculate_similarity(discogs_normalized, spotify_normalized)
        
        # Determine if there's a mismatch or if it's unprocessed
        threshold = self.filter_config.get("reporting", {}).get("similarity_threshold", 0.8)
        has_mismatch = False
        mismatch_reasons = []
        
        # Check for actual mismatches
        if apple_music_title and apple_music_similarity is not None:
            if apple_music_similarity < threshold:
                has_mismatch = True
                mismatch_reasons.append(f"Apple Music similarity: {apple_music_similarity:.2f}")
        
        if spotify_title and spotify_similarity is not None:
            if spotify_similarity < threshold:
                has_mismatch = True
                mismatch_reasons.append(f"Spotify similarity: {spotify_similarity:.2f}")
        
        # Check for unprocessed status
        if not apple_music_title and not spotify_title:
            has_mismatch = True  # Consider unprocessed as needing attention
            mismatch_reasons.append("Not processed - no service data available")
        elif not apple_music_title:
            mismatch_reasons.append("Missing Apple Music data")
        elif not spotify_title:
            mismatch_reasons.append("Missing Spotify data")
        
        return AlbumMatchResult(
            discogs_id=release.discogs_id,
            discogs_title=discogs_title,
            apple_music_title=apple_music_title,
            spotify_title=spotify_title,
            discogs_normalized=discogs_normalized,
            apple_music_normalized=apple_music_normalized,
            spotify_normalized=spotify_normalized,
            apple_music_similarity=apple_music_similarity,
            spotify_similarity=spotify_similarity,
            has_mismatch=has_mismatch,
            mismatch_reasons=mismatch_reasons
        )
    
    def generate_report(self, limit: Optional[int] = None, include_unprocessed: Optional[bool] = None) -> List[AlbumMatchResult]:
        """Generate album matching report for all releases in database."""
        self.logger.info("Generating album matching report...")
        
        # Get all releases from database
        releases = self.db_manager.get_all_releases()
        
        if not releases:
            self.logger.warning("No releases found in database")
            return []
        
        results = []
        max_results = limit or self.filter_config.get("reporting", {}).get("max_results", 100)
        show_only_mismatches = self.filter_config.get("reporting", {}).get("show_only_mismatches", True)
        
        # Override include_unprocessed if explicitly provided
        if include_unprocessed is not None:
            include_unprocessed_flag = include_unprocessed
        else:
            include_unprocessed_flag = self.filter_config.get("reporting", {}).get("include_unprocessed", True)
        
        for release in releases[:max_results]:
            try:
                result = self.analyze_release_matching(release)
                
                # Filter based on configuration
                if show_only_mismatches and not result.has_mismatch:
                    continue
                
                # If not including unprocessed, skip releases without service data
                if not include_unprocessed_flag and not result.apple_music_title and not result.spotify_title:
                    continue
                
                results.append(result)
                
            except Exception as e:
                self.logger.error(f"Failed to analyze release {release.discogs_id}: {str(e)}")
        
        self.logger.info(f"Generated report with {len(results)} entries")
        return results
    
    def format_report_text(self, results: List[AlbumMatchResult]) -> str:
        """Format report results as text."""
        if not results:
            return "No matching issues found.\n"
        
        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("ALBUM MATCHING REPORT")
        report_lines.append("=" * 80)
        report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append(f"Total entries: {len(results)}")
        report_lines.append("=" * 80)
        report_lines.append("")
        
        for i, result in enumerate(results, 1):
            report_lines.append(f"{i}. DISCOGS ID: {result.discogs_id}")
            report_lines.append(f"   Discogs Title: {result.discogs_title}")
            report_lines.append(f"   Normalized:    {result.discogs_normalized}")
            report_lines.append("")
            
            if result.apple_music_title:
                similarity = result.apple_music_similarity or 0.0
                report_lines.append(f"   Apple Music:   {result.apple_music_title}")
                report_lines.append(f"   Normalized:    {result.apple_music_normalized}")
                report_lines.append(f"   Similarity:    {similarity:.2f}")
                report_lines.append("")
            
            if result.spotify_title:
                similarity = result.spotify_similarity or 0.0
                report_lines.append(f"   Spotify:       {result.spotify_title}")
                report_lines.append(f"   Normalized:    {result.spotify_normalized}")
                report_lines.append(f"   Similarity:    {similarity:.2f}")
                report_lines.append("")
            
            if result.mismatch_reasons:
                report_lines.append(f"   Issues: {', '.join(result.mismatch_reasons)}")
                report_lines.append("")
            
            report_lines.append("-" * 80)
            report_lines.append("")
        
        return "\n".join(report_lines)
    
    def save_report(self, results: List[AlbumMatchResult], output_path: str) -> bool:
        """Save report to file."""
        try:
            report_text = self.format_report_text(results)
            
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(report_text)
            
            self.logger.info(f"Report saved to: {output_file}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to save report: {str(e)}")
            return False
    
    def save_report_json(self, results: List[AlbumMatchResult], output_path: str) -> bool:
        """Save report as JSON."""
        try:
            # Convert results to serializable format
            json_data = {
                "generated": datetime.now().isoformat(),
                "total_entries": len(results),
                "results": []
            }
            
            for result in results:
                json_data["results"].append({
                    "discogs_id": result.discogs_id,
                    "discogs_title": result.discogs_title,
                    "apple_music_title": result.apple_music_title,
                    "spotify_title": result.spotify_title,
                    "discogs_normalized": result.discogs_normalized,
                    "apple_music_normalized": result.apple_music_normalized,
                    "spotify_normalized": result.spotify_normalized,
                    "apple_music_similarity": result.apple_music_similarity,
                    "spotify_similarity": result.spotify_similarity,
                    "has_mismatch": result.has_mismatch,
                    "mismatch_reasons": result.mismatch_reasons
                })
            
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"JSON report saved to: {output_file}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to save JSON report: {str(e)}")
            return False