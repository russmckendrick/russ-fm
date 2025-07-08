#!/usr/bin/env python
"""
Enhanced Artist Processor - Demonstrates improved artist matching and batch processing.

Features:
1. Batch processing with --from and --to parameters
2. Better matching using release context
3. Automatic Various Artists filtering
4. Direct Discogs URL generation from existing IDs
"""

import json
import sqlite3
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import difflib

@dataclass
class ReleaseMatch:
    """Represents a matched release between services."""
    discogs_title: str
    service_title: str
    match_score: float
    match_type: str  # 'exact', 'fuzzy', 'partial'

@dataclass
class EnhancedArtistInfo:
    """Enhanced artist info with release context."""
    name: str
    discogs_id: str
    release_count: int = 0
    sample_releases: List[str] = field(default_factory=list)
    genres: List[str] = field(default_factory=list)
    matching_confidence: str = "LOW"
    context_score: float = 0.0
    
    # URLs
    discogs_url: str = ""
    
    # Release verification data
    spotify_matches: List[ReleaseMatch] = field(default_factory=list)
    apple_music_matches: List[ReleaseMatch] = field(default_factory=list)
    verification_confidence: str = "LOW"
    verification_score: float = 0.0
    
    # Potential matches from other services
    potential_matches: Dict[str, List[Dict]] = field(default_factory=dict)

class ArtistMatcher:
    """Enhanced artist matching using release context."""
    
    @staticmethod
    def normalize_name(name: str) -> str:
        """Normalize artist name for better matching."""
        # Remove articles
        name = re.sub(r'^(The|A|An)\s+', '', name, flags=re.IGNORECASE)
        # Remove parenthetical suffixes
        name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
        # Remove special characters but keep spaces
        name = re.sub(r'[^\w\s]', '', name)
        # Normalize whitespace
        name = ' '.join(name.split()).lower()
        return name
    
    @staticmethod
    def calculate_context_score(artist_name: str, release_titles: List[str]) -> Tuple[float, str]:
        """Calculate matching score using release context."""
        normalized_artist = ArtistMatcher.normalize_name(artist_name)
        
        scores = []
        for title in release_titles[:5]:  # Check first 5 releases
            normalized_title = ArtistMatcher.normalize_name(title)
            
            # Check for self-titled album
            if normalized_artist == normalized_title:
                scores.append(1.0)
                continue
            
            # Check if artist name is in release title
            if normalized_artist in normalized_title:
                scores.append(0.9)
                continue
            
            # Check word overlap
            artist_words = set(normalized_artist.split())
            title_words = set(normalized_title.split())
            
            if artist_words and title_words:
                overlap = len(artist_words & title_words) / min(len(artist_words), len(title_words))
                scores.append(overlap * 0.5)
            else:
                scores.append(0.0)
            
            # Use fuzzy matching for partial matches
            ratio = difflib.SequenceMatcher(None, normalized_artist, normalized_title).ratio()
            scores.append(ratio * 0.3)
        
        if not scores:
            return 0.0, "LOW"
        
        avg_score = sum(scores) / len(scores)
        
        # Determine confidence level
        if avg_score >= 0.8:
            confidence = "HIGH"
        elif avg_score >= 0.4:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
        
        return avg_score, confidence
    
    @staticmethod
    def generate_search_query(artist_name: str, release_context: Optional[str] = None) -> Dict[str, str]:
        """Generate optimized search queries for different services."""
        queries = {
            'basic': artist_name,
            'normalized': ArtistMatcher.normalize_name(artist_name),
        }
        
        if release_context:
            # For services that support album search
            queries['with_album'] = f"{artist_name} {release_context}"
            
            # For services that support quoted search
            queries['quoted'] = f'"{artist_name}"'
            
            # For disambiguation (common artist names)
            if len(artist_name.split()) == 1:  # Single word artist names
                queries['disambiguated'] = f"{artist_name} band" if release_context else artist_name
        
        return queries

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
    def calculate_confidence(matches: List[ReleaseMatch], total_discogs: int) -> Tuple[float, str]:
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

class EnhancedArtistProcessor:
    """Process artists with enhanced matching and batch support."""
    
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
    
    def extract_artists_from_releases(self, skip_various: bool = True) -> Dict[str, EnhancedArtistInfo]:
        """Extract all unique artists from releases with context."""
        cursor = self.conn.cursor()
        
        # Build query with optional Various Artists filter
        query = """
            SELECT artists, title, genres, discogs_id 
            FROM releases 
            WHERE artists IS NOT NULL
        """
        
        if skip_various:
            query += " AND artists NOT LIKE '%Various%'"
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        artists_map = {}
        
        for row in rows:
            try:
                artists = json.loads(row['artists'])
                genres = json.loads(row['genres']) if row['genres'] else []
                
                for artist in artists:
                    # Skip Various Artists if requested
                    if skip_various and artist['name'] == 'Various Artists':
                        continue
                    
                    discogs_id = artist.get('discogs_id', '')
                    if not discogs_id:
                        continue
                    
                    if discogs_id not in artists_map:
                        artists_map[discogs_id] = EnhancedArtistInfo(
                            name=artist['name'],
                            discogs_id=discogs_id,
                            release_count=1,
                            sample_releases=[row['title']],
                            genres=genres[:5]  # Keep top 5 genres
                        )
                    else:
                        artists_map[discogs_id].release_count += 1
                        if row['title'] not in artists_map[discogs_id].sample_releases:
                            artists_map[discogs_id].sample_releases.append(row['title'])
                        
                        # Merge genres
                        for genre in genres:
                            if genre not in artists_map[discogs_id].genres:
                                artists_map[discogs_id].genres.append(genre)
            
            except json.JSONDecodeError:
                continue
        
        # Calculate context scores for all artists
        for artist in artists_map.values():
            score, confidence = ArtistMatcher.calculate_context_score(
                artist.name, 
                artist.sample_releases
            )
            artist.context_score = score
            artist.matching_confidence = confidence
            artist.discogs_url = f"https://www.discogs.com/artist/{artist.discogs_id}"
        
        return artists_map
    
    def process_batch(self, start_idx: int, end_idx: int, skip_various: bool = True) -> List[EnhancedArtistInfo]:
        """Process a batch of artists."""
        all_artists = self.extract_artists_from_releases(skip_various)
        
        # Sort by release count (most releases first) for better processing order
        sorted_artists = sorted(
            all_artists.values(), 
            key=lambda x: (x.release_count, x.context_score), 
            reverse=True
        )
        
        # Return the requested batch
        return sorted_artists[start_idx:end_idx]
    
    def get_processing_stats(self) -> Dict:
        """Get statistics about artists to process."""
        all_artists = self.extract_artists_from_releases()
        
        stats = {
            'total_artists': len(all_artists),
            'confidence_breakdown': defaultdict(int),
            'top_artists_by_releases': [],
            'genres_coverage': defaultdict(int)
        }
        
        for artist in all_artists.values():
            stats['confidence_breakdown'][artist.matching_confidence] += 1
            
            for genre in artist.genres:
                stats['genres_coverage'][genre] += 1
        
        # Get top 10 artists by release count
        sorted_artists = sorted(
            all_artists.values(), 
            key=lambda x: x.release_count, 
            reverse=True
        )
        
        stats['top_artists_by_releases'] = [
            {
                'name': a.name, 
                'releases': a.release_count,
                'confidence': a.matching_confidence
            } 
            for a in sorted_artists[:10]
        ]
        
        return stats
    
    def get_artist_all_releases(self, discogs_artist_id: str) -> List[str]:
        """Get all known releases for an artist from the database."""
        cursor = self.conn.cursor()
        
        query = """
            SELECT DISTINCT title 
            FROM releases 
            WHERE artists LIKE ? 
            ORDER BY title
        """
        
        cursor.execute(query, [f'%"discogs_id": "{discogs_artist_id}"%'])
        return [row[0] for row in cursor.fetchall()]
    
    def verify_artist_with_simulated_data(self, artist: EnhancedArtistInfo) -> EnhancedArtistInfo:
        """Verify artist using simulated service data for demonstration."""
        # Get all releases for this artist
        all_releases = self.get_artist_all_releases(artist.discogs_id)
        
        # Simulated service data based on known patterns
        simulated_spotify = self._generate_simulated_releases(all_releases, "spotify")
        simulated_apple_music = self._generate_simulated_releases(all_releases, "apple_music")
        
        # Perform verification
        spotify_matches = ReleaseVerifier.match_releases(all_releases, simulated_spotify)
        apple_music_matches = ReleaseVerifier.match_releases(all_releases, simulated_apple_music)
        
        # Calculate verification scores
        spotify_score, spotify_confidence = ReleaseVerifier.calculate_confidence(spotify_matches, len(all_releases))
        apple_score, apple_confidence = ReleaseVerifier.calculate_confidence(apple_music_matches, len(all_releases))
        
        # Update artist with verification data
        artist.spotify_matches = spotify_matches
        artist.apple_music_matches = apple_music_matches
        artist.verification_score = (spotify_score + apple_score) / 2
        
        # Determine overall verification confidence
        if artist.verification_score >= 0.5:
            artist.verification_confidence = "HIGH"
        elif artist.verification_score >= 0.3:
            artist.verification_confidence = "MEDIUM"
        else:
            artist.verification_confidence = "LOW"
        
        return artist
    
    def _generate_simulated_releases(self, actual_releases: List[str], service: str) -> List[str]:
        """Generate simulated service releases based on actual releases."""
        simulated = []
        
        for release in actual_releases:
            # Add the base release
            simulated.append(release)
            
            # Add variations based on service patterns
            if service == "spotify":
                # Spotify tends to have fewer variations
                if "greatest" in release.lower() or "best" in release.lower():
                    continue  # Skip compilations
            elif service == "apple_music":
                # Apple Music often has remastered versions
                if not any(suffix in release for suffix in ["(Remastered)", "(Deluxe", "(Expanded"]):
                    if len(simulated) < 10:  # Don't overwhelm with variations
                        simulated.append(f"{release} (Remastered)")
        
        # Remove duplicates and sort
        return sorted(list(set(simulated)))

def main():
    """Demonstrate enhanced artist processing."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enhanced Artist Processor')
    parser.add_argument('--from', dest='start', type=int, default=0, help='Start index')
    parser.add_argument('--to', dest='end', type=int, default=10, help='End index')
    parser.add_argument('--stats', action='store_true', help='Show processing statistics')
    parser.add_argument('--include-various', action='store_true', help='Include Various Artists')
    parser.add_argument('--verify', action='store_true', help='Include release verification for better matching')
    
    args = parser.parse_args()
    
    processor = EnhancedArtistProcessor('collection_cache.db')
    
    if args.stats:
        print("=" * 80)
        print("ARTIST PROCESSING STATISTICS")
        print("=" * 80)
        
        stats = processor.get_processing_stats()
        
        print(f"\nTotal Artists to Process: {stats['total_artists']}")
        print(f"\nConfidence Breakdown:")
        for confidence, count in stats['confidence_breakdown'].items():
            print(f"  {confidence}: {count} artists")
        
        print(f"\nTop 10 Artists by Release Count:")
        for i, artist in enumerate(stats['top_artists_by_releases'], 1):
            print(f"  {i}. {artist['name']} - {artist['releases']} releases ({artist['confidence']} confidence)")
        
        print(f"\nTop Genres:")
        sorted_genres = sorted(stats['genres_coverage'].items(), key=lambda x: x[1], reverse=True)[:10]
        for genre, count in sorted_genres:
            print(f"  {genre}: {count} artists")
    
    else:
        print("=" * 80)
        print(f"PROCESSING ARTISTS: {args.start} to {args.end}")
        print("=" * 80)
        
        artists = processor.process_batch(
            args.start, 
            args.end, 
            skip_various=not args.include_various
        )
        
        if not artists:
            print("No artists found in the specified range.")
            return
        
        for i, artist in enumerate(artists, args.start + 1):
            # Apply verification if requested
            if args.verify:
                artist = processor.verify_artist_with_simulated_data(artist)
            
            print(f"\n{i}. {artist.name}")
            print(f"   Discogs ID: {artist.discogs_id}")
            print(f"   Discogs URL: {artist.discogs_url}")
            print(f"   Release Count: {artist.release_count}")
            print(f"   Matching Confidence: {artist.matching_confidence} (score: {artist.context_score:.2f})")
            
            if args.verify:
                print(f"   Verification Confidence: {artist.verification_confidence} (score: {artist.verification_score:.2f})")
            
            if artist.genres:
                print(f"   Genres: {', '.join(artist.genres[:5])}")
            
            print(f"   Sample Releases:")
            for release in artist.sample_releases[:3]:
                print(f"     - {release}")
            
            # Show verification results if enabled
            if args.verify and (artist.spotify_matches or artist.apple_music_matches):
                all_releases = processor.get_artist_all_releases(artist.discogs_id)
                
                print(f"\n   🎵 RELEASE VERIFICATION (Total Known: {len(all_releases)}):")
                
                if artist.spotify_matches:
                    match_pct = len(artist.spotify_matches) / len(all_releases) * 100 if all_releases else 0
                    print(f"   🟢 Spotify: {len(artist.spotify_matches)}/{len(all_releases)} matched ({match_pct:.0f}%)")
                    for match in artist.spotify_matches[:2]:
                        print(f"      • {match.discogs_title} → {match.service_title} ({match.match_type})")
                
                if artist.apple_music_matches:
                    match_pct = len(artist.apple_music_matches) / len(all_releases) * 100 if all_releases else 0
                    print(f"   🍎 Apple Music: {len(artist.apple_music_matches)}/{len(all_releases)} matched ({match_pct:.0f}%)")
                    for match in artist.apple_music_matches[:2]:
                        print(f"      • {match.discogs_title} → {match.service_title} ({match.match_type})")
            
            # Show search strategies
            search_queries = ArtistMatcher.generate_search_query(
                artist.name, 
                artist.sample_releases[0] if artist.sample_releases else None
            )
            
            print(f"\n   🔍 Search Strategies:")
            print(f"     Basic: '{search_queries['basic']}'")
            print(f"     Normalized: '{search_queries['normalized']}'")
            if 'with_album' in search_queries:
                print(f"     With Album Context: '{search_queries['with_album']}'")
            
            print("-" * 70)

if __name__ == "__main__":
    main()