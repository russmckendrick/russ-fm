# Database Management Tool

A command-line tool for managing the music collection database.

## Installation

Make sure you have installed the required dependencies:
```bash
pip install tabulate
```

## Usage

```bash
python db_manager.py [command] [options]
```

## Commands

### Search
Search for releases or artists by ID or name/title.

```bash
# Search for a release
python db_manager.py search release "Easy Tiger"
python db_manager.py search release 31499750

# Search for an artist
python db_manager.py search artist "Traveling Wilburys"
```

### List
List releases or artists with sorting options.

```bash
# List releases
python db_manager.py list releases --limit 10
python db_manager.py list releases --limit 20 --sort year
python db_manager.py list releases --limit 20 --sort title
python db_manager.py list releases --limit 20 --sort date_added

# List artists
python db_manager.py list artists --limit 10
python db_manager.py list artists --limit 20 --sort name
python db_manager.py list artists --limit 20 --sort created_at
```

### Delete
Delete releases or artists (with automatic backup).

```bash
# Delete a release
python db_manager.py delete release 31499750
python db_manager.py delete release 31499750 --force  # Skip confirmation

# Delete an artist
python db_manager.py delete artist "artist-name"
python db_manager.py delete artist artist-id --force
```

**Note**: Deleting automatically creates a backup before any deletions.

### Stats
Show database statistics.

```bash
python db_manager.py stats
```

### Backup
Create a manual database backup.

```bash
python db_manager.py backup
python db_manager.py backup --name my_backup.db
```

## Important Notes

- All delete operations automatically create a backup before deletion
- Deleting a release also removes its JSON and image files from `/public/album/`
- Deleting an artist also removes their JSON and image files from `/public/artist/`
- Artist deletions do NOT automatically delete their associated releases
- The tool uses the `collection_cache.db` SQLite database by default