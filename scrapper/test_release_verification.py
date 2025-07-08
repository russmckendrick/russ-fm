#!/usr/bin/env python
"""
Test release verification concept without the full service imports.
Shows how the matching algorithm would work.
"""

import json
import sqlite3
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
import difflib

@dataclass
class ReleaseMatch:
    """Represents a matched release between services."""
    discogs_title: str
    service_title: str
    match_score: float
    match_type: str  # 'exact', 'fuzzy', 'partial'

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

def get_artist_releases(db_path: str, discogs_artist_id: str) -> List[str]:
    """Get all known releases for an artist from the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    query = """
        SELECT DISTINCT title 
        FROM releases 
        WHERE artists LIKE ? 
        ORDER BY title
    """
    
    cursor.execute(query, [f'%"discogs_id": "{discogs_artist_id}"%'])
    releases = [row[0] for row in cursor.fetchall()]
    conn.close()
    
    return releases

def test_matching_algorithm():
    """Test the matching algorithm with real and simulated data."""
    
    # Test cases with simulated service data
    test_cases = [
        {
            'artist': 'Stereolab',
            'discogs_id': '388',
            'simulated_spotify': [
                'Transient Random-Noise Bursts with Announcements',
                'Mars Audiac Quintet',
                'Dots and Loops',
                'Sound-Dust',
                'Margerine Eclipse',
                'Fab Four Suture',
                'Chemical Chords',
                'Not Music',
                'Switched On (Expanded Edition)',
                'Electrically Possessed [Switched On Volume 4]'
            ],
            'simulated_apple_music': [
                'Transient Random-Noise Bursts with Announcements (Expanded Edition)',
                'Mars Audiac Quintet',
                'Dots and Loops (Deluxe Edition)',
                'Sound-Dust (Remastered)',
                'Margerine Eclipse',
                'Fab Four Suture',
                'Chemical Chords',
                'Not Music',
                'Switched On',
                'Electrically Possessed'
            ]
        },
        {
            'artist': 'Sleep',
            'discogs_id': '57916',
            'simulated_spotify': [
                'Sleep\'s Holy Mountain',
                'Dopesmoker',
                'The Sciences'
            ],
            'simulated_apple_music': [
                'Sleep\'s Holy Mountain (Remastered)',
                'Dopesmoker',
                'The Sciences'
            ]
        },
        {
            'artist': 'Pink Floyd',
            'discogs_id': '45467',
            'simulated_spotify': [
                'The Dark Side of the Moon',
                'Wish You Were Here',
                'Animals',
                'The Wall',
                'Meddle',
                'Atom Heart Mother',
                'Obscured by Clouds',
                'More',
                'Ummagumma',
                'A Saucerful of Secrets'
            ],
            'simulated_apple_music': [
                'The Dark Side of the Moon (50th Anniversary Edition)',
                'Wish You Were Here (2011 Remastered)',
                'Animals (2018 Remix)',
                'The Wall',
                'Meddle (2011 Remastered)',
                'Atom Heart Mother (2011 Remastered)',
                'Obscured by Clouds',
                'More (2011 Remastered)',
                'Ummagumma (2011 Remastered)',
                'A Saucerful of Secrets (2011 Remastered)'
            ]
        }
    ]
    
    print("=" * 80)
    print("RELEASE VERIFICATION MATCHING TEST")
    print("=" * 80)
    
    for test_case in test_cases:
        artist = test_case['artist']
        discogs_id = test_case['discogs_id']
        
        print(f"\n🎵 Testing: {artist} (Discogs ID: {discogs_id})")
        print("-" * 60)
        
        # Get actual releases from database
        actual_releases = get_artist_releases('collection_cache.db', discogs_id)
        
        print(f"📀 Known Releases from Database: {len(actual_releases)}")
        for i, release in enumerate(actual_releases[:5], 1):
            print(f"  {i}. {release}")
        if len(actual_releases) > 5:
            print(f"  ... and {len(actual_releases) - 5} more")
        
        # Test Spotify matching
        print(f"\n🟢 SPOTIFY MATCHING:")
        spotify_matches = ReleaseVerifier.match_releases(actual_releases, test_case['simulated_spotify'])
        spotify_score, spotify_confidence = ReleaseVerifier.calculate_confidence(spotify_matches, len(actual_releases))
        
        print(f"  Service Albums: {len(test_case['simulated_spotify'])}")
        print(f"  Matches Found: {len(spotify_matches)}/{len(actual_releases)} ({len(spotify_matches)/len(actual_releases)*100:.0f}%)")
        print(f"  Confidence Score: {spotify_score:.2f}")
        print(f"  Confidence Level: {spotify_confidence}")
        
        if spotify_matches:
            print(f"  Sample Matches:")
            for match in spotify_matches[:3]:
                print(f"    • {match.discogs_title} → {match.service_title}")
                print(f"      ({match.match_type}, score: {match.match_score:.2f})")
        
        # Test Apple Music matching
        print(f"\n🍎 APPLE MUSIC MATCHING:")
        apple_matches = ReleaseVerifier.match_releases(actual_releases, test_case['simulated_apple_music'])
        apple_score, apple_confidence = ReleaseVerifier.calculate_confidence(apple_matches, len(actual_releases))
        
        print(f"  Service Albums: {len(test_case['simulated_apple_music'])}")
        print(f"  Matches Found: {len(apple_matches)}/{len(actual_releases)} ({len(apple_matches)/len(actual_releases)*100:.0f}%)")
        print(f"  Confidence Score: {apple_score:.2f}")
        print(f"  Confidence Level: {apple_confidence}")
        
        if apple_matches:
            print(f"  Sample Matches:")
            for match in apple_matches[:3]:
                print(f"    • {match.discogs_title} → {match.service_title}")
                print(f"      ({match.match_type}, score: {match.match_score:.2f})")
        
        # Overall assessment
        overall_score = (spotify_score + apple_score) / 2
        print(f"\n📊 OVERALL ASSESSMENT:")
        print(f"  Combined Score: {overall_score:.2f}")
        if overall_score >= 0.5:
            print(f"  Result: HIGH CONFIDENCE - Strong match across services")
        elif overall_score >= 0.3:
            print(f"  Result: MEDIUM CONFIDENCE - Partial match")
        else:
            print(f"  Result: LOW CONFIDENCE - Weak or no match")
        
        print("\n" + "=" * 80)

if __name__ == "__main__":
    test_matching_algorithm()