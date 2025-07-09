#!/usr/bin/env python3
"""
Regenerate JSON files from cached database without re-fetching data or images.

Usage:
    python regenerate_json.py
"""

import logging
from pathlib import Path
from music_collection_manager.config import ConfigManager
from music_collection_manager.utils.database import DatabaseManager
from music_collection_manager.utils.collection_generator import CollectionGenerator
from music_collection_manager.utils.image_manager import ImageManager
from music_collection_manager.utils.serializers import ArtistSerializer
from music_collection_manager.utils.text_cleaner import clean_for_json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('regenerate_json')

def main():
    """Regenerate all JSON files from database cache."""
    # Load configuration
    config_manager = ConfigManager()
    config = config_manager.config
    
    # Initialize components
    db_path = config.get('database', {}).get('path', 'collection_cache.db')
    db = DatabaseManager(db_path, logger)
    
    data_path = config.get('data', {}).get('path', 'data')
    releases_path = config.get('releases', {}).get('path', 'album')
    artists_path = config.get('artists', {}).get('path', 'artist')
    
    image_manager = ImageManager(f'{data_path}/{releases_path}', config)
    
    # Regenerate all release JSON files
    releases = db.get_all_releases()
    logger.info(f'Found {len(releases)} releases in database')
    logger.info('Regenerating release JSON files...')
    
    success_count = 0
    for i, release in enumerate(releases, 1):
        try:
            # Save release JSON using the image manager's method
            json_path = image_manager.save_release_json(
                release, 
                release.title, 
                str(release.discogs_id)
            )
            if json_path:
                success_count += 1
                logger.info(f'[{i}/{len(releases)}] Regenerated: {release.title}')
            else:
                logger.warning(f'[{i}/{len(releases)}] Failed to save: {release.title}')
        except Exception as e:
            logger.error(f'[{i}/{len(releases)}] Error with {release.title}: {e}')
    
    logger.info(f'Successfully regenerated {success_count}/{len(releases)} release JSON files')
    
    # Regenerate all artist JSON files
    artists = db.get_all_artists()
    logger.info(f'\nFound {len(artists)} artists in database')
    logger.info('Regenerating artist JSON files...')
    
    artist_success_count = 0
    for i, artist in enumerate(artists, 1):
        try:
            # Create artist folder
            artist_folder = image_manager.sanitize_filename(artist.name)
            artist_path = Path(data_path) / artists_path / artist_folder
            artist_path.mkdir(parents=True, exist_ok=True)
            
            # Save artist JSON
            json_path = artist_path / f'{artist_folder}.json'
            json_content = ArtistSerializer.to_json(artist, include_enrichment=True)
            
            # Clean the JSON content
            json_content = clean_for_json(json_content)
            
            with open(json_path, 'w', encoding='utf-8') as f:
                f.write(json_content)
            
            artist_success_count += 1
            logger.info(f'[{i}/{len(artists)}] Regenerated: {artist.name}')
        except Exception as e:
            logger.error(f'[{i}/{len(artists)}] Error with {artist.name}: {e}')
    
    logger.info(f'Successfully regenerated {artist_success_count}/{len(artists)} artist JSON files')
    
    # Regenerate collection.json
    logger.info('\nRegenerating collection.json...')
    generator = CollectionGenerator(data_path, config, logger)
    collection_path = generator.generate_collection_json()
    
    if collection_path.exists():
        logger.info(f'Successfully regenerated collection.json at: {collection_path}')
    else:
        logger.error('Failed to regenerate collection.json')
    
    # Summary
    logger.info('\n=== Regeneration Summary ===')
    logger.info(f'Release JSON files: {success_count}/{len(releases)}')
    logger.info(f'Artist JSON files: {artist_success_count}/{len(artists)}')
    logger.info(f'Collection.json: {"✓" if collection_path.exists() else "✗"}')
    logger.info('JSON regeneration complete!')

if __name__ == '__main__':
    main()