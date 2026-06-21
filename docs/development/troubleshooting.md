# Troubleshooting Guide

Common issues and solutions for russ.fm development and deployment.

## Frontend Issues

### Images Not Loading

**Symptom:** Album/artist images show broken image icons.

**Causes & Solutions:**

1. **Using wrong image size**
   ```typescript
   // Wrong - 'small' doesn't exist
   getAlbumImageFromData(album.uri_release, 'small')

   // Correct - only 'hi-res' and 'medium' exist
   getAlbumImageFromData(album.uri_release, 'medium')
   ```

2. **Hardcoded paths instead of utilities**
   ```typescript
   // Wrong
   <img src={album.images_uri_release['medium']} />

   // Correct
   import { getAlbumImageFromData } from '@/lib/image-utils';
   <img src={getAlbumImageFromData(album.uri_release, 'medium')} />
   ```

3. **Hi-res source missing**
   - Check that `/public/album/{slug}/{slug}-hi-res.jpg` exists
   - Run `scrapper release {id} --save` to regenerate

4. **R2 sync issues (production)**
   ```bash
   # Check R2 for specific album
   node scripts/sync-to-r2.js --filter "album-slug" --dry-run
   ```

---

### Search Not Working

**Symptom:** Search returns no results or errors.

**Solutions:**

1. **Check collection.json exists**
   ```bash
   ls -la public/collection.json
   ```

2. **Regenerate search index**
   ```bash
   scrapper generate-collection
   ```

3. **Check browser console for Fuse.js errors**

4. **Verify JSON is valid**
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('public/collection.json'))"
   ```

---

### Styles Not Applying

**Symptom:** Tailwind classes not working.

**Solutions:**

1. **Check content paths in tailwind.config.js**
   ```javascript
   content: ['./src/**/*.{js,ts,jsx,tsx}']
   ```

2. **Restart dev server after config changes**

3. **Check for class name typos**

4. **Verify CSS imports in main.tsx**
   ```typescript
   import './index.css';
   import './styles/brand-colors.css';
   ```

---

### Build Failures

**Symptom:** `pnpm run build` fails.

**Solutions:**

1. **Type errors**
   ```bash
   pnpm run tsc --noEmit
   # Fix any type errors shown
   ```

2. **ESLint errors**
   ```bash
   pnpm run lint
   # Fix linting issues
   ```

3. **Missing dependencies**
   ```bash
   rm -rf node_modules
   pnpm install
   ```

4. **Out of memory**
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 pnpm run build
   ```

---

## Backend Issues

### `scrapper: command not found`

**Symptom:** The CLI isn't on your `PATH`.

**Solution:**
```bash
cd scrapper
./install.sh   # installs `scrapper` to ~/.cargo/bin
```
Ensure `~/.cargo/bin` is on your `PATH`. To run without installing, use `cargo run -- <cmd>` from inside `scrapper/`.

---

### API Authentication Errors

**Symptom:** Service returns 401/403 errors.

**Solutions:**

1. **Test individual services**
   ```bash
   scrapper test
   ```

2. **Verify config.json credentials**

3. **Check token expiration (Apple Music, Spotify)**

4. **Regenerate tokens if needed**

5. **For Apple Music JWT issues:**
   - Verify .p8 file path is correct
   - Check key_id and team_id match

---

### Rate Limit Errors

**Symptom:** 429 Too Many Requests.

**Solutions:**

1. **Wait and retry**
   ```bash
   # Use --resume to continue
   scrapper collection --resume
   ```

2. **Process a smaller range**
   ```bash
   scrapper collection --limit 5
   ```

3. **Check rate limit configuration**
   ```json
   {
     "discogs": { "rate_limit": 60 },
     "spotify": { "rate_limit": 100 }
   }
   ```

---

### Database Locked

**Symptom:** SQLite "database is locked" error.

**Solutions:**

1. **Stop other processes using the database**
   ```bash
   # Check for running scrapper processes
   ps aux | grep scrapper
   ```

2. **Backup and recreate**
   ```bash
   scrapper backup
   rm collection_cache.db
   scrapper collection
   ```

---

### Images Not Downloading

**Symptom:** Album processing completes but images missing.

**Solutions:**

1. **Check network connectivity**

2. **Verify image URLs in API responses**
   ```bash
   scrapper --log-level DEBUG release 123456
   ```

3. **Check disk space**

4. **Verify write permissions to public/**

---

### Resume Not Working

**Symptom:** Collection processing starts from beginning.

**Solutions:**

1. **Use `--resume` flag**
   ```bash
   scrapper collection --resume
   ```

2. **Check database exists**
   ```bash
   ls -la scrapper/collection_cache.db
   ```

3. **Verify items are marked as processed**
   ```bash
   scrapper status
   ```

---

## Deployment Issues

### R2 Sync Fails

**Symptom:** Images not uploading to R2.

**Solutions:**

1. **Check credentials**
   ```bash
   # Verify env vars are set
   echo $R2_ACCOUNT_ID
   echo $R2_BUCKET_NAME
   ```

2. **Test connectivity**
   ```bash
   pnpm run r2:list
   ```

3. **Dry run to check what would sync**
   ```bash
   pnpm run build:sync:dry
   ```

4. **Force re-sync**
   ```bash
   node scripts/sync-to-r2.js --force
   ```

---

### Worker Deployment Fails

**Symptom:** Wrangler deployment errors.

**Solutions:**

1. **Verify authentication**
   ```bash
   pnpm run wrangler whoami
   ```

2. **Check wrangler.toml syntax**

3. **Validate worker build**
   ```bash
   pnpm run build:worker
   ls -la dist-worker/
   ```

4. **Check Cloudflare dashboard for errors**

---

### GitHub Actions Failing

**Symptom:** Workflow fails on push.

**Solutions:**

1. **Check Actions tab for error logs**

2. **Verify all secrets are set**
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

3. **Run build locally to test**
   ```bash
   pnpm run build
   ```

4. **Check cache key changes**
   - Workflow may need cache bust if scripts changed

---

## Common Gotchas

### Image Sizes

**Only two sizes exist:**
- `hi-res` (1400px)
- `medium` (800px)

**`small` does NOT exist!** Never use it.

### Path Aliases

Use `@/` for imports:
```typescript
// Correct
import { Button } from '@/components/ui/button';

// Wrong
import { Button } from '../../../components/ui/button';
```

### Genre Filtering

Use the correct function:
```typescript
// Use this
import { getCleanGenresFromArray } from '@/lib/genreUtils';
const genres = getCleanGenresFromArray(album.genre_names, album.release_artist);

// Not this (deprecated)
import { filterGenres } from '@/lib/genreUtils';
```

### Collection JSON vs Album JSON

- `collection.json` - Minimal data for listings
- `album/{slug}/index.json` - Full data with enrichment

Don't expect full data in collection.json.

### Running the Backend

The `scrapper` binary runs from any directory once installed via `./install.sh`
(it registers `~/.config/scrapper/config.json` pointing at the scrapper folder):
```bash
scrapper <command>
```
For source dev without installing, use `cargo run -- <command>` from inside `scrapper/`.

### Config File Security

Never commit `config.json`:
```bash
# Check .gitignore
cat .gitignore | grep config.json
```

---

## Getting Help

1. **Check logs**
   ```bash
   # Backend logs to stderr — run with --log-level DEBUG (optionally redirect)
   scrapper --log-level DEBUG status 2> run.log

   # Browser console for frontend
   ```

2. **Enable debug mode**
   ```bash
   scrapper --log-level DEBUG <command>
   ```

3. **Check status**
   ```bash
   scrapper status
   ```

4. **Review documentation**
   - [Backend CLI](../backend/cli-commands.md)
   - [Frontend Utilities](../frontend/utilities.md)
   - [Build Pipeline](../build-pipeline/)

---

## Related Documentation

- [Development Guide](./README.md)
- [Configuration Reference](./configuration.md)
- [Backend Documentation](../backend/)
- [Build Pipeline](../build-pipeline/)
