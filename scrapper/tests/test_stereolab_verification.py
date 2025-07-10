#!/usr/bin/env python
"""
Test Stereolab specifically with the new verification functionality.
"""

from enhanced_artist_processor import EnhancedArtistProcessor

def test_stereolab():
    processor = EnhancedArtistProcessor('collection_cache.db')
    
    # Get Stereolab directly
    all_artists = processor.extract_artists_from_releases()
    
    # Find Stereolab
    stereolab = None
    for artist in all_artists.values():
        if artist.name == "Stereolab":
            stereolab = artist
            break
    
    if not stereolab:
        print("Stereolab not found!")
        return
    
    # Apply verification
    stereolab = processor.verify_artist_with_simulated_data(stereolab)
    
    print("=" * 80)
    print("🎵 STEREOLAB - RELEASE VERIFICATION DEMO")
    print("=" * 80)
    print()
    
    print(f"Artist: {stereolab.name}")
    print(f"Discogs ID: {stereolab.discogs_id}")
    print(f"Discogs URL: {stereolab.discogs_url}")
    print(f"Release Count: {stereolab.release_count}")
    print()
    
    # Get all releases
    all_releases = processor.get_artist_all_releases(stereolab.discogs_id)
    
    print(f"📀 Known Releases from Database: {len(all_releases)}")
    for i, release in enumerate(all_releases, 1):
        print(f"  {i}. {release}")
    
    print(f"\n🎯 VERIFICATION RESULTS:")
    print(f"   Overall Confidence: {stereolab.verification_confidence}")
    print(f"   Verification Score: {stereolab.verification_score:.2f}")
    
    if stereolab.spotify_matches:
        match_pct = len(stereolab.spotify_matches) / len(all_releases) * 100
        print(f"\n🟢 Spotify: {len(stereolab.spotify_matches)}/{len(all_releases)} matched ({match_pct:.0f}%)")
        for match in stereolab.spotify_matches[:5]:
            print(f"      • {match.discogs_title} → {match.service_title} ({match.match_type})")
    
    if stereolab.apple_music_matches:
        match_pct = len(stereolab.apple_music_matches) / len(all_releases) * 100
        print(f"\n🍎 Apple Music: {len(stereolab.apple_music_matches)}/{len(all_releases)} matched ({match_pct:.0f}%)")
        for match in stereolab.apple_music_matches[:5]:
            print(f"      • {match.discogs_title} → {match.service_title} ({match.match_type})")
    
    print(f"\n📊 WHAT THIS MEANS:")
    if stereolab.verification_confidence == "HIGH":
        print("   ✅ HIGH CONFIDENCE - Strong release match confirms artist identity")
        print("   ✅ Safe to use Apple Music and Spotify URLs for this artist")
        print("   ✅ Release catalogs align well across services")
    elif stereolab.verification_confidence == "MEDIUM":
        print("   ⚠️  MEDIUM CONFIDENCE - Partial release match")
        print("   ⚠️  May need manual verification for some releases")
    else:
        print("   ❌ LOW CONFIDENCE - Poor release match")
        print("   ❌ Artist identity uncertain, manual verification needed")

if __name__ == "__main__":
    test_stereolab()