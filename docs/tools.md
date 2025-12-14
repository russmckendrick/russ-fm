# Tools & Utilities

The project includes several utility scripts to assist with database management, file consistency, and maintenance.

## Database Manager

Located at `scrapper/tools/db_manager.py`, this tool provides direct access to the SQLite cache without running full collection processes.

```bash
# Search the database
python -m tools.db_manager search release "Album Name"
python -m tools.db_manager search artist "Artist Name"

# List recent additions
python -m tools.db_manager list releases --limit 20
python -m tools.db_manager list artists --sort name

# View Database Stats (count of albums, artists, etc.)
python -m tools.db_manager stats

# Backup Database
python -m tools.db_manager backup
```

## Consistency Tools

These tools help ensure that your database matches the generated static files in `/public`.

### Find Missing Artists

Checks for artists present in the database but missing corresponding folders in `/public/artist`.

```bash
python -m tools.find_missing_artists
python -m tools.find_missing_artists --show-orphaned
```

### Artist Folder Reconciler

A more advanced tool that tries to "fix" mismatching folders (e.g., URL slug differences).

```bash
python -m tools.artist_folder_reconciler --detailed-analysis
```

## Frontend Scripts

Located in the root `scripts/` directory.

-   **`process-images.mjs`**: Resizes images in `/public` to standard sizes (hi-res, medium).
-   **`generate-colors.mjs`**: Extracts dominant colors from album art for UI theming.
-   **`generate-og-images.mjs`**: Generates `og-image.png` for social sharing for each page.
-   **`sync-to-r2.js`**: Smart sync utility for Cloudflare R2 (see [Deployment](./deployment.md)).

## Troubleshooting

### "Image Not Found"

1.  Check if the file exists in `/public/album/{slug}/`.
2.  Verify the filename matches the convention: `{slug}-{size}.jpg`.
3.  Run `process-images.mjs` to ensure sizes were generated.

### "Data Mismatch"

If the frontend shows different data than the backend:
1.  Run `python main.py collection` to regenerate JSON files.
2.  Hard refresh the browser (cache clearing).
