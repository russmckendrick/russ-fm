#!/usr/bin/env python
"""Show artists with HIGH confidence scores."""

from enhanced_artist_processor import EnhancedArtistProcessor

processor = EnhancedArtistProcessor('collection_cache.db')
all_artists = processor.extract_artists_from_releases()

# Filter HIGH confidence artists
high_confidence = [a for a in all_artists.values() if a.matching_confidence == "HIGH"]

print(f"\nFound {len(high_confidence)} HIGH confidence artists:\n")

# Sort by context score
high_confidence.sort(key=lambda x: x.context_score, reverse=True)

for i, artist in enumerate(high_confidence[:20], 1):
    print(f"{i}. {artist.name}")
    print(f"   Score: {artist.context_score:.2f}")
    print(f"   Releases: {artist.release_count}")
    print(f"   Sample: {', '.join(artist.sample_releases[:2])}")
    print()