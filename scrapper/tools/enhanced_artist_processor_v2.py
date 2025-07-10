#!/usr/bin/env python
"""
Enhanced Artist Processor V2 - With release verification for confident matching.

This version searches Apple Music and Spotify, then verifies artists by comparing
their releases against our known Discogs releases.
"""

import json
import sqlite3
import re
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field
from collections import defaultdict
import difflib
from pathlib import Path
import sys

# Add the music_collection_manager to the path
sys.path.insert(0, str(Path(__file__).parent))

from music_collection_manager.services.apple_music import AppleMusicService
from music_collection_manager.services.spotify import SpotifyService

@dataclass
class ReleaseMatch:
    """Represents a matched release between services."""
    discogs_title: str
    service_title: str
    match_score: float
    match_type: str  # 'exact', 'fuzzy', 'partial'

@dataclass
class ServiceArtistCandidate:
    """Artist candidate from a music service with release verification."""
    service: str
    artist_id: str
    artist_name: str
    artist_url: str
    genres: List[str] = field(default_factory=list)
    popularity: Optional[int] = None
    
    # Release matching
    total_releases: int = 0
    matched_releases: List[ReleaseMatch] = field(default_factory=list)
    match_percentage: float = 0.0
    confidence_score: float = 0.0

@dataclass
class VerifiedArtistInfo:
    """Enhanced artist info with service verification."""
    name: str
    discogs_id: str
    discogs_url: str
    known_releases: List[str] = field(default_factory=list)
    
    # Service matches
    apple_music: Optional[ServiceArtistCandidate] = None
    spotify: Optional[ServiceArtistCandidate] = None
    
    # Overall confidence
    overall_confidence: str = "LOW"
    confidence_details: Dict[str, str] = field(default_factory=dict)

class ReleaseVerifier:
    """Verifies artist matches by comparing releases."""
    
    @staticmethod
    def normalize_title(title: str) -> str:
        """Normalize album title for comparison."""
        # Remove common suffixes
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)  # Remove (Deluxe Edition), etc.
        title = re.sub(r'\s*\[[^\]]*\]\s*$', '', title)  # Remove [Remastered], etc.
        
        # Remove special characters but keep spaces
        title = re.sub(r'[^\w\s]', '', title)
        
        # Normalize whitespace and case
        title = ' '.join(title.split()).lower()
        
        # Remove common words that cause mismatches
        skip_words = {'the', 'a', 'an', 'and', '&', 'remastered', 'deluxe', 'edition', 
                      'expanded', 'anniversary', 'reissue', 'bonus', 'tracks', 'disc'}
        words = [w for w in title.split() if w not in skip_words]
        
        return ' '.join(words)
    
    @staticmethod
    def match_releases(discogs_releases: List[str], service_releases: List[str]) -> List[ReleaseMatch]:
        """Match releases between Discogs and a service."""
        matches = []
        
        # Normalize all titles
        normalized_discogs = {ReleaseVerifier.normalize_title(r): r for r in discogs_releases}
        normalized_service = {ReleaseVerifier.normalize_title(r): r for r in service_releases}
        
        # First pass: exact matches
        for norm_discogs, orig_discogs in normalized_discogs.items():
            if norm_discogs in normalized_service:
                matches.append(ReleaseMatch(
                    discogs_title=orig_discogs,
                    service_title=normalized_service[norm_discogs],
                    match_score=1.0,
                    match_type='exact'
                ))
        
        # Second pass: fuzzy matches for unmatched releases
        unmatched_discogs = {k: v for k, v in normalized_discogs.items() 
                           if not any(m.discogs_title == v for m in matches)}
        unmatched_service = {k: v for k, v in normalized_service.items() 
                           if not any(m.service_title == v for m in matches)}
        
        for norm_discogs, orig_discogs in unmatched_discogs.items():
            best_match = None
            best_score = 0.0
            
            for norm_service, orig_service in unmatched_service.items():
                # Calculate similarity
                score = difflib.SequenceMatcher(None, norm_discogs, norm_service).ratio()
                
                # Boost score if key words match
                discogs_words = set(norm_discogs.split())
                service_words = set(norm_service.split())
                if discogs_words and service_words:
                    word_overlap = len(discogs_words & service_words) / min(len(discogs_words), len(service_words))
                    score = (score + word_overlap) / 2
                
                if score > best_score and score > 0.7:  # 70% threshold
                    best_score = score
                    best_match = orig_service
            
            if best_match:
                matches.append(ReleaseMatch(
                    discogs_title=orig_discogs,
                    service_title=best_match,
                    match_score=best_score,
                    match_type='fuzzy'
                ))
        
        return matches
    
    @staticmethod
    def calculate_confidence(matches: List[ReleaseMatch], total_discogs: int, total_service: int) -> Tuple[float, str]:
        """Calculate confidence score based on release matches."""
        if total_discogs == 0:
            return 0.0, "NO_RELEASES"
        
        match_percentage = len(matches) / total_discogs
        
        # Calculate weighted score based on match quality
        if matches:
            avg_match_score = sum(m.match_score for m in matches) / len(matches)
            confidence_score = match_percentage * avg_match_score
        else:
            confidence_score = 0.0
        
        # Determine confidence level
        if match_percentage >= 0.5 and len(matches) >= 2:
            confidence = "HIGH"
        elif match_percentage >= 0.3 or len(matches) >= 1:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
        
        # Special cases
        if len(matches) >= 5:
            confidence = "HIGH"  # Many matches = high confidence
        elif total_discogs == 1 and len(matches) == 1 and matches[0].match_score > 0.9:
            confidence = "HIGH"  # Single perfect match
        
        return confidence_score, confidence

class EnhancedArtistProcessorV2:
    """Process artists with release verification."""
    
    def __init__(self, db_path: str, config_path: str = "config.json"):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        
        # Load config and initialize services
        try:
            with open(config_path, 'r') as f:
                self.config = json.load(f)
            
            # Initialize services
            self.apple_music = AppleMusicService(self.config, None)
            self.spotify = SpotifyService(self.config, None)
        except Exception as e:
            print(f"Warning: Could not initialize services: {e}")
            self.apple_music = None
            self.spotify = None
    
    def get_artist_releases(self, discogs_artist_id: str) -> List[str]:
        """Get all known releases for an artist from our database."""
        cursor = self.conn.cursor()
        
        query = """
            SELECT DISTINCT title 
            FROM releases 
            WHERE artists LIKE ? 
            ORDER BY title
        """
        
        cursor.execute(query, [f'%"discogs_id": "{discogs_artist_id}"%'])
        return [row['title'] for row in cursor.fetchall()]
    
    def verify_apple_music_artist(self, artist_name: str, known_releases: List[str]) -> Optional[ServiceArtistCandidate]:
        """Search Apple Music and verify artist by releases."""
        if not self.apple_music:
            return None
        
        try:
            # Search for artist
            search_results = self.apple_music.search_artist(artist_name)
            if not search_results:
                return None
            
            # Take top 10 candidates
            candidates = []
            
            for i, artist in enumerate(search_results[:10]):
                # Get artist albums
                artist_id = artist.get('id', '')
                if not artist_id:
                    continue
                
                # Fetch artist's albums
                albums = self.apple_music.get_artist_albums(artist_id, limit=100)
                album_titles = [album.get('attributes', {}).get('name', '') for album in albums]
                
                # Match releases
                matches = ReleaseVerifier.match_releases(known_releases, album_titles)
                
                # Calculate confidence
                confidence_score, _ = ReleaseVerifier.calculate_confidence(
                    matches, len(known_releases), len(album_titles)
                )
                
                candidate = ServiceArtistCandidate(
                    service='apple_music',
                    artist_id=artist_id,
                    artist_name=artist.get('attributes', {}).get('name', ''),
                    artist_url=artist.get('attributes', {}).get('url', ''),
                    genres=artist.get('attributes', {}).get('genreNames', []),
                    total_releases=len(album_titles),
                    matched_releases=matches,
                    match_percentage=len(matches) / len(known_releases) if known_releases else 0,
                    confidence_score=confidence_score
                )
                
                candidates.append(candidate)
            
            # Return best candidate
            if candidates:
                return max(candidates, key=lambda c: (c.confidence_score, len(c.matched_releases)))
            
        except Exception as e:
            print(f"Error searching Apple Music: {e}")
        
        return None
    
    def verify_spotify_artist(self, artist_name: str, known_releases: List[str]) -> Optional[ServiceArtistCandidate]:
        """Search Spotify and verify artist by releases."""
        if not self.spotify:
            return None
        
        try:
            # Search for artist
            search_results = self.spotify.search_artist(artist_name)
            if not search_results:
                return None
            
            candidates = []
            
            for i, artist in enumerate(search_results[:10]):
                artist_id = artist.get('id', '')
                if not artist_id:
                    continue
                
                # Get artist albums
                albums = self.spotify.get_artist_albums(artist_id, limit=50, include_groups='album')
                album_titles = [album.get('name', '') for album in albums]
                
                # Match releases
                matches = ReleaseVerifier.match_releases(known_releases, album_titles)
                
                # Calculate confidence
                confidence_score, _ = ReleaseVerifier.calculate_confidence(
                    matches, len(known_releases), len(album_titles)
                )
                
                candidate = ServiceArtistCandidate(
                    service='spotify',
                    artist_id=artist_id,
                    artist_name=artist.get('name', ''),
                    artist_url=artist.get('external_urls', {}).get('spotify', ''),
                    genres=artist.get('genres', []),
                    popularity=artist.get('popularity'),
                    total_releases=len(album_titles),
                    matched_releases=matches,
                    match_percentage=len(matches) / len(known_releases) if known_releases else 0,
                    confidence_score=confidence_score
                )
                
                candidates.append(candidate)
            
            # Return best candidate
            if candidates:
                return max(candidates, key=lambda c: (c.confidence_score, len(c.matched_releases)))
            
        except Exception as e:
            print(f"Error searching Spotify: {e}")
        
        return None
    
    def process_artist_with_verification(self, artist_name: str, discogs_id: str) -> VerifiedArtistInfo:
        """Process an artist with full release verification."""
        # Get known releases
        known_releases = self.get_artist_releases(discogs_id)
        
        # Create base info
        verified_artist = VerifiedArtistInfo(
            name=artist_name,
            discogs_id=discogs_id,
            discogs_url=f"https://www.discogs.com/artist/{discogs_id}",
            known_releases=known_releases
        )
        
        # Verify on Apple Music
        apple_match = self.verify_apple_music_artist(artist_name, known_releases)
        if apple_match:
            verified_artist.apple_music = apple_match
            verified_artist.confidence_details['apple_music'] = f"{len(apple_match.matched_releases)}/{len(known_releases)} releases matched"
        
        # Verify on Spotify
        spotify_match = self.verify_spotify_artist(artist_name, known_releases)
        if spotify_match:
            verified_artist.spotify = spotify_match
            verified_artist.confidence_details['spotify'] = f"{len(spotify_match.matched_releases)}/{len(known_releases)} releases matched"
        
        # Calculate overall confidence
        confidence_scores = []
        if apple_match:
            confidence_scores.append(apple_match.confidence_score)
        if spotify_match:
            confidence_scores.append(spotify_match.confidence_score)
        
        if confidence_scores:
            avg_confidence = sum(confidence_scores) / len(confidence_scores)
            if avg_confidence >= 0.5:
                verified_artist.overall_confidence = "HIGH"
            elif avg_confidence >= 0.3:
                verified_artist.overall_confidence = "MEDIUM"
            else:
                verified_artist.overall_confidence = "LOW"
        
        return verified_artist

def main():
    """Test the enhanced processor with release verification."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enhanced Artist Processor V2')
    parser.add_argument('artist', nargs='?', help='Artist name to test')
    parser.add_argument('--id', help='Discogs ID of the artist')
    parser.add_argument('--demo', action='store_true', help='Run demo with sample artists')
    
    args = parser.parse_args()
    
    processor = EnhancedArtistProcessorV2('collection_cache.db')
    
    if args.demo:
        # Demo mode - test a few artists
        demo_artists = [
            ("Stereolab", "388"),
            ("Pink Floyd", "45467"),
            ("The Stone Roses", "7298"),
            ("Sleep", "57916")
        ]
        
        for artist_name, discogs_id in demo_artists:
            print("=" * 80)
            print(f"VERIFYING: {artist_name} (Discogs ID: {discogs_id})")
            print("=" * 80)
            
            result = processor.process_artist_with_verification(artist_name, discogs_id)
            
            print(f"\nKnown Releases: {len(result.known_releases)}")
            for i, release in enumerate(result.known_releases[:5], 1):
                print(f"  {i}. {release}")
            if len(result.known_releases) > 5:
                print(f"  ... and {len(result.known_releases) - 5} more")
            
            print(f"\n🎵 APPLE MUSIC:")
            if result.apple_music:
                am = result.apple_music
                print(f"  ✅ Found: {am.artist_name}")
                print(f"  URL: {am.artist_url}")
                print(f"  Genres: {', '.join(am.genres[:5])}")
                print(f"  Releases: {am.total_releases} total")
                print(f"  Matched: {len(am.matched_releases)}/{len(result.known_releases)} ({am.match_percentage:.0%})")
                print(f"  Confidence: {am.confidence_score:.2f}")
                
                if am.matched_releases:
                    print(f"\n  Matched Albums:")
                    for match in am.matched_releases[:3]:
                        print(f"    • {match.discogs_title} → {match.service_title} ({match.match_type}, {match.match_score:.2f})")
            else:
                print("  ❌ No results or service unavailable")
            
            print(f"\n🎵 SPOTIFY:")
            if result.spotify:
                sp = result.spotify
                print(f"  ✅ Found: {sp.artist_name}")
                print(f"  URL: {sp.artist_url}")
                print(f"  Genres: {', '.join(sp.genres[:5])}")
                print(f"  Popularity: {sp.popularity}/100")
                print(f"  Releases: {sp.total_releases} total")
                print(f"  Matched: {len(sp.matched_releases)}/{len(result.known_releases)} ({sp.match_percentage:.0%})")
                print(f"  Confidence: {sp.confidence_score:.2f}")
                
                if sp.matched_releases:
                    print(f"\n  Matched Albums:")
                    for match in sp.matched_releases[:3]:
                        print(f"    • {match.discogs_title} → {match.service_title} ({match.match_type}, {match.match_score:.2f})")
            else:
                print("  ❌ No results or service unavailable")
            
            print(f"\n📊 OVERALL CONFIDENCE: {result.overall_confidence}")
            for service, detail in result.confidence_details.items():
                print(f"  - {service}: {detail}")
            
            print("\n")
    
    elif args.artist and args.id:
        # Process single artist
        result = processor.process_artist_with_verification(args.artist, args.id)
        
        # Display results (same format as demo)
        print(f"\nVerifying {args.artist}...")
        print(f"Overall Confidence: {result.overall_confidence}")
        if result.apple_music:
            print(f"Apple Music: {result.apple_music.artist_url}")
        if result.spotify:
            print(f"Spotify: {result.spotify.artist_url}")
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()